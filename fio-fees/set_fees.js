
const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
const {JsSignatureProvider} = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const { stringToPublicKey, publicKeyToString } = require('eosjs/dist/eosjs-numeric');

const config = require('./config');

const keys = [config.fee_private_key];
const signatureProvider = new JsSignatureProvider(keys);


/* FIO Compatibility */
function convertLegacyPublicKey(s) {
    let pubkey = s;
    // Convert Alternative Legacy to EOS for this process
    if (s.substr(0, 3) === 'FIO') {
        pubkey = pubkey.replace(/^FIO/, 'EOS');
    }
    // Convert Legacy Keys
    if (pubkey.substr(0, 3) === 'EOS') {
        return publicKeyToString(stringToPublicKey(pubkey));
    }
    return pubkey;
}

function convertLegacyPublicKeys(keys) {
    return keys.map(convertLegacyPublicKey);
}

function getAuthorityProvider(rpc) {
    return {
        async getRequiredKeys(args) {
            const { availableKeys, transaction } = args;

            return convertLegacyPublicKeys((await rpc.fetch('/v1/chain/get_required_keys', {
                transaction,
                available_keys: convertLegacyPublicKeys(availableKeys),
            })).required_keys);
        }
    };
}
/* End FIO */

async function get_multiplier(){
    // get fio price in usd from the binance api
    const url = `https://api.binance.com/api/v3/avgPrice?symbol=FIOUSDT`;
    const res = await fetch(url);
    const json = await res.json();

    // console.log(json);
    if (json.code && json.msg){
        throw new Error(json.msg);
    }

    return 1 / json.price;
}

const rpc = new JsonRpc(config.api_url, { fetch });
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const authorityProvider = getAuthorityProvider(rpc);
const api = new Api({ authorityProvider, rpc, signatureProvider, textDecoder, textEncoder });

async function set_fees(config){

    let data;

    try {
        data = {
            fee_ratios: [
                { "end_point": "register_fio_domain", "value": 40000000000 },
                { "end_point": "register_fio_address", "value": 2000000000 },
                { "end_point": "renew_fio_domain", "value": 40000000000 },
                { "end_point": "renew_fio_address", "value": 2000000000 },
                { "end_point": "add_pub_address", "value": 30000000 },
                { "end_point": "add_bundled_transactions", "value": 2000000000 },
                { "end_point": "transfer_tokens_pub_key", "value": 100000000 },
                { "end_point": "new_funds_request", "value": 60000000 },
                { "end_point": "reject_funds_request", "value": 30000000 },
                { "end_point": "record_obt_data", "value": 60000000 },
                { "end_point": "set_fio_domain_public", "value": 30000000 },
                { "end_point": "register_producer", "value": 10100000000 },
                { "end_point": "register_proxy", "value": 100000000 },
                { "end_point": "unregister_proxy", "value": 20000000 },
                { "end_point": "unregister_producer", "value": 100000000 },
                { "end_point": "proxy_vote", "value": 30000000 },
                { "end_point": "vote_producer", "value": 50000000 },
                { "end_point": "auth_delete", "value": 20000000 },
                { "end_point": "auth_link", "value": 20000000 },
                { "end_point": "auth_update", "value": 50000000 },
                { "end_point": "msig_propose", "value": 50000000 },
                { "end_point": "msig_approve", "value": 20000000 },
                { "end_point": "msig_unapprove", "value": 1000000 },
                { "end_point": "msig_cancel", "value": 20000000 },
                { "end_point": "msig_exec", "value": 20000000 },
                { "end_point": "msig_invalidate", "value": 20000000 },
                { "end_point": "cancel_funds_request", "value": 60000000 },
                { "end_point": "remove_pub_address", "value": 60000000 },
                { "end_point": "remove_all_pub_addresses", "value": 60000000 },
                { "end_point": "transfer_fio_domain", "value": 100000000 },
                { "end_point": "transfer_fio_address", "value": 60000000 },
                { "end_point": "submit_fee_multiplier", "value": 0 },
                { "end_point": "submit_fee_ratios", "value": 0 },
                { "end_point": "burn_fio_address", "value": 60000000 },
                { "end_point": "add_to_whitelist", "value": 30000000 },
                { "end_point": "remove_from_whitelist", "value": 30000000 },
                { "end_point": "submit_bundled_transaction", "value": 2100000000 }
            ],
            actor: config.producer_name,
            max_fee: 1000000000
        };
        const actions = [];
        actions.push({
            account: 'fio.fee',
            name: 'setfeevote',
            authorization: [{
                actor: config.producer_name,
                permission: config.fee_permission
            }],
            data
        });


        await api.transact({
            actions
        }, {
            blocksBehind: 3,
            expireSeconds: 30,
        });

        console.log(`Sent fees`);
    }
    catch (e){
        let msg = e.message;
        if (e.json && e.json.error){
            msg = e.json.error.what;
        }
        console.error(`Failed to set fees - ${msg}`);
    }

}

async function set_multiplier(config){

    try {
        data = {
            multiplier: await get_multiplier(),
            actor: config.producer_name,
            max_fee: 1000000000
        };
        const actions = [];
        actions.push({
            account: 'fio.fee',
            name: 'setfeemult',
            authorization: [{
                actor: config.producer_name,
                permission: config.fee_permission
            }],
            data
        });

        await api.transact({
            actions
        }, {
            blocksBehind: 3,
            expireSeconds: 30,
        });

        console.log(`Sent multiplier`);
    }
    catch (e){
        let msg = e.message;
        if (e.json && e.json.error){
            msg = e.json.error.what;
        }
        console.error(`Failed to set multiplier - ${msg}`);
    }
}

setInterval(() => {set_fees(config)}, 2147483647); // every 24-ish days (max 32-bit)
setInterval(() => {set_multiplier(config)}, 60000 * 60 * 3); // every 3 hours

set_fees(config);
set_multiplier(config);
