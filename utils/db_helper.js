const { Pool, Client } = require('pg');

// ToDo: Put into Configfile
const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'db.xtdpndzaaifgrbkbqsyg.supabase.co',
    database: process.env.POSTGRES_DB || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'H3m^iGHGSK68hTdXnb3yEENGj36Vf$',
    port: process.env.POSTGRES_PORT || 6543,
    ssl: {
        rejectUnauthorized: false
    }
});

/**
 * @returns {Promise<Client>}
 */
async function getConnection() {
    return await pool.connect();
}

/**
 * @returns {Promise<void>}
 */
async function setupDatabase() {
    await pool.query('CREATE TABLE IF NOT EXISTS token_transactions (ID SERIAL PRIMARY KEY, sender varchar(255) not null, receiver varchar(255) not null, amount int8 not null, symbol varchar(255) not null, trx_timestamp timestamp not null)');
    await pool.query('CREATE TABLE IF NOT EXISTS token_balances (owner varchar(255) not null, balance int8 not null, symbol varchar(255) not null, last_update timestamp not null, PRIMARY KEY(owner, symbol))');
    await pool.query('CREATE TABLE IF NOT EXISTS bet_reports (bet_id varchar(255) not null PRIMARY KEY, reporter varchar(255) not null, outcome varchar(3) not null, report_timestamp timestamp not null)');
}

/**
 * @returns {Promise<void>}
 */
async function teardownDatabase() {
    await pool.query('DROP TABLE token_transactions;');
    await pool.query('DROP TABLE token_balances;');
    await pool.query('DROP TABLE bet_reports;');
}

/**
 * @returns {Promise<Client>}
 */
async function createDBTransaction() {
    const client = await getConnection();
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    return client;
}


/**
 * @param client {Client}
 * @returns {Promise<void>}
 */
async function commitDBTransaction(client) {
    await client.query('COMMIT');
    client.release();
}

/**
 * @param client {Client}
 * @returns {Promise<void>}
 */
async function rollbackDBTransaction(client) {
    await client.query('ROLLBACK');
    client.release();
}

/**
 * Get the balance of a specific token from a user
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getBalanceOfUser(client, user, symbol) {
    const res = await client.query('SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2', [symbol, user]);
    return res.rows;
}

/**
 * View the balance of a specific token from a user
 *
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewBalanceOfUser(user, symbol) {
    const res = await pool.query('SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2', [symbol, user]);
    return res.rows;
}

/**
 * Get the balance of a specific token from a user
 *
 * @param client {Client}
 * @param user {String}
 * @returns {Promise<*>}
 */
async function getAllBalancesOfUser(client, user) {
    const res = await client.query('SELECT * FROM token_balances WHERE owner = $1', [user]);
    return res.rows;
}

/**
 * View the balance of a specific token from a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewAllBalancesOfUser(user) {
    const res = await pool.query('SELECT * FROM token_balances WHERE owner = $1', [user]);
    return res.rows;
}

/**
 * Get the balance of a specific token
 *
 * @param client {Client}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getAllBalancesOfToken(client, symbol) {
    const res = await client.query('SELECT * FROM token_balances WHERE symbol = $1', [symbol]);
    return res.rows;
}

/**
 * View the balance of a specific token
 *
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewAllBalancesOfToken(symbol) {
    const res = await pool.query('SELECT * FROM token_balances WHERE symbol = $1', [symbol]);
    return res.rows;
}

/**
 * Update the balance of a specific token from a user
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @param timestamp {Date}
 * @param newBalance {number}
 * @returns {Promise<void>}
 */
async function updateBalanceOfUser(client, user, symbol,timestamp, newBalance) {
    await client.query('INSERT INTO token_balances (owner, symbol, last_update, balance) VALUES($1, $2, $3, $4) ON CONFLICT (owner, symbol) DO UPDATE SET last_update = $3, balance = $4;', [user, symbol, timestamp, newBalance]);
}

async function insertTransaction(client, sender, receiver, amount, symbol, timestamp) {
    await client.query('INSERT INTO token_transactions(sender, receiver, amount, symbol, trx_timestamp) VALUES($1, $2, $3, $4, $5)', [sender, receiver, amount, symbol, timestamp]);
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getTransactionOfUser(client, user, symbol) {
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
    await pool.query('INSERT INTO bet_reports(bet_id, reporter, outcome, report_timestamp) VALUES($1, $2, $3, $4)', [bet_id, reporter, outcome, timestamp]);
}

/**
 * view the report of a bet
 *
 * @param bet_id {String}
 * @returns {Promise<*>}
 */
async function viewReport(bet_id) {
    const res = await pool.query('SELECT * FROM bet_reports WHERE bet_id = $1', [bet_id]);
    return res.rows;
}

module.exports = {
    setupDatabase,
    teardownDatabase,
    createDBTransaction,
    commitDBTransaction,
    rollbackDBTransaction,
    getBalanceOfUser,
    viewBalanceOfUser,
    getAllBalancesOfUser,
    viewAllBalancesOfUser,
    updateBalanceOfUser,
    insertTransaction,
    getTransactionOfUser,
    insertReport,
    viewReport
};
