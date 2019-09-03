
const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
const {JsSignatureProvider} = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const config = require('./config');

const keys = config.map((conf) => {
    return conf.claim_key
});

const signatureProvider = new JsSignatureProvider.default(keys);





async function claim(config){
    config.forEach(async (conf) => {

        const rpc = new JsonRpc(conf.api_url, { fetch });
        const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

        try {
            const action_name = (conf.name === 'wax')?'claimgbmprod':'claimrewards';

            await api.transact({
                actions:[{
                    account: 'eosio',
                    name: action_name,
                    authorization: [{
                        actor: conf.producer_name,
                        permission: conf.claim_permission
                    }],
                    data: {
                        owner: conf.producer_name
                    }
                }]
            }, {
                blocksBehind: 3,
                expireSeconds: 30,
            });

            console.log(`Claimed rewards for ${conf.name}`);
        }
        catch (e){
            if (e.message.indexOf('already claimed rewards within past day') === -1 && e.message.indexOf('producer pay request not found') === -1){
                console.error(`Failed to claim for ${conf.name} - ${e.message}`);
            }
        }

    });

}

setInterval(() => {claim(config)}, 60000);

claim(config);
