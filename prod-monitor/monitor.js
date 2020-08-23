
const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
const {JsSignatureProvider} = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const global_config = require('./config');

const round_length = 6000 * 21;

const miss_counter = {};
let unregistered = [];
const max_missed_rounds = 5;

const in_schedule = async (config) => {

    const api_url = (config.use_backup)?config.api_url:config.api_url2

    try {
        const rpc = new JsonRpc(api_url, { fetch });

        const schedule = await rpc.get_producer_schedule();

        // console.log(schedule.active.producers);
        for (let p = 0; p < schedule.active.producers.length; p++){
            const prod = schedule.active.producers[p];

            if (prod.producer_name === config.producer_name){
                return true;
            }
        }

        return false;
    }
    catch (e){
        // error in api, try backup
        if (!config.use_backup){
            console.log(`Error checking in schedule for ${config.name}, using backup`);

            config.use_backup = true;
            return in_schedule(config);
        }
        else {
            throw e;
        }
    }
}


const is_producing = async (config) => {
    const api_url = (config.use_backup)?config.api_url:config.api_url2

    let n_checks = 50;

    try {
        const rpc = new JsonRpc(api_url, { fetch });

        const info = await rpc.get_info();
        let current_block = info.head_block_num;
        const global = await rpc.get_table_rows({
            code: 'eosio',
            scope: 'eosio',
            table: 'global',
            limit: 1
        });
        if (!global.rows.length){
            throw new Error(`Could not find global table`);
        }

        while (n_checks >= 0){
            // console.log(schedule.active.producers);
            const block_data = await rpc.get_block(current_block);
            // console.log(block_data);

            if (block_data.producer === config.producer_name){
                console.log(`${config.producer_name} is producing on ${config.name}`);
                miss_counter[config.name] = 0;
                unregistered = unregistered.filter(u => u !== config.name);
                return true;
            }

            n_checks--;
            current_block -= 5;
        }


        // schedule may have updated recently and this is our first round, ignore if so
        console.log(`Checking if schedule updated recently on ${config.name}`);
        const last_update_str = global.rows[0].last_producer_schedule_update.replace(/\.[05]00/, '');
        const last_update = Date.parse(last_update_str);
        const now = new Date().getTime();

        if (now - last_update >= round_length){
            console.log(`Assuming producing because schedule changed`);
            return true;
        }
        console.log(`It did not, we are not producing`);

        return false;
    }
    catch (e){
        // error in api, try backup
        if (!config.use_backup){
            console.log(`Error checking in schedule for ${config.name} - ${e.message}, using backup`);

            config.use_backup = true;
            return is_producing(config);
        }
        else {
            throw e;
        }
    }
}

const send_alert = async (config) => {
    if (unregistered.includes(config.name)){
        console.log(`Already unregistered for ${config.name}`);
        return;
    }

    console.error(`!!!! NOT PRODUCING ON ${config.name}`);

    if (typeof miss_counter[config.name] === 'undefined'){
        miss_counter[config.name] = 1;
    }
    else {
        miss_counter[config.name]++;
    }

    console.error(`Missed ${miss_counter[config.name]} rounds on ${config.name}`);

    if (global_config.twilio.account_sid && global_config.twilio.auth_token){
        const client = require('twilio')(global_config.twilio.account_sid, global_config.twilio.auth_token);

        client.messages
            .create({
                body: `Missed ${miss_counter[config.name]} rounds on ${config.name}`,
                from: global_config.twilio.from_number,
                to: global_config.twilio.notify_number
            })
            .then(message => console.log(message.sid));
    }


    if (miss_counter[config.name] >= max_missed_rounds){
        console.error(`Missed 5 rounds, force unreg`);
        unreg(config);
    }
}

const unreg = async (config) => {
    if (!config.unreg_key){
        console.error(`NO UNREG KEY!!!`);
        return;
    }

    const api_url = config.api_url;
    const api_url2 = config.api_url2;

    try {
        // unreg on both apis
        const rpc = new JsonRpc(api_url, {fetch});
        const rpc2 = new JsonRpc(api_url2, {fetch});
        const textDecoder = new TextDecoder();
        const textEncoder = new TextEncoder();
        const signatureProvider = new JsSignatureProvider([config.unreg_key]);
        let api = new Api({ rpc, signatureProvider, textDecoder, textEncoder });
        let api2 = new Api({ rpc: rpc2, signatureProvider, textDecoder, textEncoder });

        const actions = [];
        actions.push({
            account: 'eosio',
            name: 'unregprod',
            authorization: [{
                actor: config.producer_name,
                permission: config.unreg_permission
            }],
            data: {
                producer: config.producer_name
            }
        });

        try {
            api.transact({actions}, {
                blocksBehind: 3,
                expireSeconds: 30,
            }).then(res => {
                console.log(`Send unregister tx`);
            });
            api2.transact({actions}, {
                blocksBehind: 3,
                expireSeconds: 31,
            }).then(res => {
                console.log(`Send unregister 2 tx`);
            });
        }
        catch (e){
            console.log(`Error unregistering ${e.message}`);
        }

        unregistered.push(config.name);
    }
    catch (e){
        console.error(`Failure unregistering ${e.message}`);
    }
}

const run = async (configs) => {
    for (let c = 0; c < configs.length; c++){
        const config = configs[c];
        const is = await in_schedule(config);
        if (is){
            console.log(`In schedule for ${config.name}`);

            is_producing(config).then(ip => {
                if (!ip){
                    send_alert(config);
                }
            }).catch(e => {
                console.error(`Could not determine if producing ${e.message}`)
            });
        }
    }
}

run(global_config.chains);
setInterval(() => {run(global_config.chains);}, round_length);
