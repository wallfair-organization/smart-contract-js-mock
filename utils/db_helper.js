const {Client} = require('pg');

// ToDo: Put into Configfile
const client = new Client({
    user: 'postgres',
    host: 'db.zghidkehwmoktkokenok.supabase.co',
    database: 'postgres',
    password: 'H3m^iGHGSK68hTdXnb3yEENGj36Vf$',
    port: 6543,
});

client.connect()

async function setupDatabase() {
    await client.query('CREATE TABLE IF NOT EXISTS token_transactions (ID SERIAL PRIMARY KEY, sender varchar(255) not null, receiver varchar(255) not null, amount integer not null, symbol varchar(255) not null, trx_timestamp timestamp not null)');
    await client.query('CREATE TABLE IF NOT EXISTS bet_reports (ID SERIAL PRIMARY KEY, bet_id varchar(255) not null, reporter varchar(255) not null, outcome varchar(3) not null, report_timestamp timestamp not null, unique(bet_id))');
}

async function insertTransaction(sender, receiver, amount, symbol, timestamp) {
    await client.query('INSERT INTO token_transactions(sender, receiver, amount, symbol, trx_timestamp) VALUES($1, $2, $3, $4, $5)', [sender, receiver, amount, symbol, timestamp]);
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getTransactionOfUser(user, symbol) {
    const res = await client.query('SELECT * FROM token_transactions WHERE symbol = $1 AND (sender = $2 OR receiver = $2)', [symbol, user]);
    return res.rows;
}

/**
 * Insert a new Report to resolve a bet
 *
 * @param bet_id {String}
 * @param reporter {String}
 * @param outcome {"yes" | "no"}
 * @param timestamp {Date}
 * @returns {Promise<void>}
 */
async function insertReport(bet_id, reporter, outcome, timestamp) {
    await client.query('INSERT INTO bet_reports(bet_id, reporter, outcome, report_timestamp) VALUES($1, $2, $3, $4)', [bet_id, reporter, outcome, timestamp]);
}

/**
 * The report of a bet
 *
 * @param bet_id {String}
 * @returns {Promise<*>}
 */
async function getReport(bet_id) {
    const res = await client.query('SELECT * FROM bet_reports WHERE bet_id = $1', [bet_id]);
    return res.rows;
}

module.exports = {setupDatabase, insertTransaction, getTransactionOfUser, insertReport, getReport};
