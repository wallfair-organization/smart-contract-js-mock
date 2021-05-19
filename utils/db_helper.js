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
    await client.query('CREATE TABLE IF NOT EXISTS token_balances (owner varchar(255) not null, balance integer not null, symbol varchar(255) not null, last_update timestamp not null, PRIMARY KEY(owner, symbol))');
    await client.query('CREATE TABLE IF NOT EXISTS bet_reports (bet_id varchar(255) not null PRIMARY KEY, reporter varchar(255) not null, outcome varchar(3) not null, report_timestamp timestamp not null)');
}

async function teardownDatabase() {
    await client.query('DROP TABLE token_transactions;');
    await client.query('DROP TABLE token_balances;');
    await client.query('DROP TABLE bet_reports;');
}

async function createDBTransaction() {
    await client.query('BEGIN');
}

async function commitDBTransaction() {
    await client.query('COMMIT');
}

async function rollbackDBTransaction() {
    await client.query('ROLLBACK');
}

/**
 * Get the balance of a specific token from a user
 *
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getBalanceOfUser(user, symbol) {
    const res = await client.query('SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2', [symbol, user]);
    return res.rows;
}

/**
 * Get the balance of a specific token from a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function getAllBalancesOfUser(user) {
    const res = await client.query('SELECT * FROM token_balances WHERE owner = $1', [user]);
    return res.rows;
}

/**
 * Get the balance of a specific token
 *
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getAllBalancesOfToken(symbol) {
    const res = await client.query('SELECT * FROM token_balances WHERE symbol = $1', [symbol]);
    return res.rows;
}

/**
 * Update the balance of a specific token from a user
 *
 * @param user {String}
 * @param symbol {String}
 * @param timestamp {Date}
 * @param newBalance {number}
 * @returns {Promise<void>}
 */
async function updateBalanceOfUser(user, symbol,timestamp, newBalance) {
    await client.query('INSERT INTO token_balances (owner, symbol, last_update, balance) VALUES($1, $2, $3, $4) ON CONFLICT (owner, symbol) DO UPDATE SET last_update = $3, balance = $4;', [user, symbol, timestamp, newBalance]);
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

module.exports = {
    setupDatabase,
    teardownDatabase,
    createDBTransaction,
    commitDBTransaction,
    rollbackDBTransaction,
    getBalanceOfUser,
    getAllBalancesOfUser,
    updateBalanceOfUser,
    insertTransaction,
    getTransactionOfUser,
    insertReport,
    getReport
};
