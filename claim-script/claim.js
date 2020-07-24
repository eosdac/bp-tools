
const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
const {JsSignatureProvider} = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const { stringToPublicKey, publicKeyToString } = require('eosjs/dist/eosjs-numeric');

const config = require('./config');

const keys = config.map((conf) => {
    return conf.claim_key
});

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


async function claim(config){
    config.forEach(async (conf) => {

        const rpc = new JsonRpc(conf.api_url, { fetch });
        const textDecoder = new TextDecoder();
        const textEncoder = new TextEncoder();
        let api = new Api({ rpc, signatureProvider, textDecoder, textEncoder });

        try {
            let action_name = (conf.name === 'wax')?'claimgbmprod':'claimrewards';
            let account = (conf.name === 'remme')?'rem':'eosio';
            let data = {
                owner: conf.producer_name
            };

            if (conf.name === 'fio'){
                action_name = 'bpclaim';
                account = 'fio.treasury';
                data = {
                    fio_address: conf.fio_address,
                    actor: conf.producer_name
                };
                const authorityProvider = getAuthorityProvider(rpc);

                api = new Api({ authorityProvider, rpc, signatureProvider, textDecoder, textEncoder });
            }

            await api.transact({
                actions:[{
                    account,
                    name: action_name,
                    authorization: [{
                        actor: conf.producer_name,
                        permission: conf.claim_permission
                    }],
                    data
                }]
            }, {
                blocksBehind: 3,
                expireSeconds: 30,
            });

            console.log(`Claimed rewards for ${conf.name}`);

            if (conf.name === 'wax' || config.name == 'waxtest'){
                console.log(`Claiming genesis for WAX`);

                await api.transact({
                    actions:[{
                        account: 'eosio',
                        name: 'claimgenesis',
                        authorization: [{
                            actor: conf.producer_name,
                            permission: conf.claim_permission
                        }],
                        data: {
                            claimer: conf.producer_name
                        }
                    },{
                        account: 'eosio',
                        name: 'voterclaim',
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
            }
        }
        catch (e){
            let msg = e.message;
            if (conf.name === 'fio'){
                msg = e.json.fields[0].error;
            }

            if (msg.indexOf('already claimed rewards within past day') === -1 &&
                msg.indexOf('producer pay request not found') === -1 &&
                msg.indexOf('FIO Address not producer or nothing payable') === -1){

                console.error(`Failed to claim for ${conf.name} - ${e.message}`);
            }
        }

    });

}

setInterval(() => {claim(config)}, 60000);

claim(config);
