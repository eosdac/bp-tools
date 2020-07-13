
const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
global.fetch = require("node-fetch");
global.WebSocket = require("ws");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const dfuse_key = require('./secret').dfuse_key;
const dfuse_endpoint = 'https://mainnet.eos.dfuse.io/';
const { createDfuseClient } = require("@dfuse/client")
const client = createDfuseClient({ apiKey: dfuse_key, network: "mainnet" })

const proxies = [
    `binancevote1`, `binancevote2`, `binancevote3`, `binancevote4`, `binancevote5`,
    `binanceprxy1`, `binanceprxy2`, `binanceprxy3`, `binanceprxy4`, `binanceprxy5`,
    `binanceprox1`, `binanceprox2`, `binanceprox3`, `binanceprox4`, `binanceprox5`
];


const pay_at_block = async (producer_name, {block_num, block_time, quantity}) => {
    // get the total voteweight on the producer
    // console.log({block_num, block_time, quantity});
    // console.log({blockNum: block_num});
    const prod_res = await client.stateTableRow(`eosio`, `eosio`, `producers`, producer_name, {blockNum: block_num});
    const prod_voteshare = prod_res.row.json.votepay_share;
    // console.log(prod_res.row.json.total_votes);
    const prod_votes = BigInt(prod_res.row.json.total_votes);
    // get voteweight of the proxies
    let proxy_voteweight = 0n;
    for (let p=0; p<proxies.length; p++){
        const proxy_res = await client.stateTableRow(`eosio`, `eosio`, `voters`, proxies[p], {blockNum: block_num});
        // console.log(proxy_res.row.json);
        if (proxy_res.row.json.producers.includes(producer_name)){
            // console.log(`${proxies[p]} ${proxy_res.row.json.proxied_vote_weight}`);
            proxy_voteweight += BigInt(proxy_res.row.json.proxied_vote_weight);
        }
        else {
            // console.log(``);
        }
    }
    const percentage = parseFloat(proxy_voteweight * 10000n / prod_votes * 10000n) / 1000000;
    console.log({proxy_voteweight, prod_votes, block_num, block_time, quantity, percentage});
    // get percentage of the pay due
    console.log(`Proxy provides ${percentage} of votes`);

    return {proxy_voteweight, prod_votes, block_num, block_time, quantity, percentage};
};

const start = async (producer, start_block) => {
    // get each claimpay with the date and block number
    const payments = [];
    let has_more = true;
    let next_cursor = '';
    while (has_more){
        const options = {startBlock: start_block, limit: 100};
        if (next_cursor){
            options.cursor = next_cursor;
        }
        const claimpays = await client.searchTransactions(`account:eosio action:claimrewards auth:${producer}`, options);

        if (claimpays.transactions){
            claimpays.transactions.forEach(t => {

                const inline_traces = t.lifecycle.execution_trace.action_traces[0].inline_traces;

                inline_traces.forEach(it => {
                    if (it.act.account === 'eosio.token' && it.act.name === 'transfer' && it.act.data.to === producer){
                        // console.log(JSON.stringify(it, null, 2));
                        // console.log(it.act.data.quantity);
                        payments.push({block_num: it.block_num, block_time: it.block_time, quantity: it.act.data.quantity})
                    }
                });
            });

            has_more = (claimpays.cursor);
            next_cursor = claimpays.cursor;
        }
        else {
            has_more = false;
        }

    }


    // take each paymentand calculate the binance payment
    // console.log(payments.length);
    // console.log(payments);

    const csvWriter = createCsvWriter({
        path: 'payments.csv',
        header: [
            {id: 'proxy_voteweight', title: 'Proxy Vote Weight'},
            {id: 'prod_votes', title: 'Producer Votes'},
            {id: 'block_num', title: 'Block Number'},
            {id: 'block_time', title: 'Block Time'},
            {id: 'quantity', title: 'Pay Claimed'},
            {id: 'percentage', title: 'Percentage Due to Proxy'},
            {id: 'commission', title: 'Commission For Proxy'},
        ]
    });

    for (let p=0; p<payments.length; p++){
        const pay_details = await pay_at_block(producer, payments[p]);

        const [amount_str, symbol] = pay_details.quantity.split(' ');
        const amount = parseFloat(amount_str);

        const increase = amount * (pay_details.percentage / 100);

        const payment = increase * 0.8;
        const commission = `${payment.toFixed(4)} ${symbol}`;

        pay_details.commission = commission;

        await csvWriter.writeRecords([pay_details]);
    }
    console.log(`Done!`);
    process.exit(0);

}

start(`eosdacserver`, 130698083);

