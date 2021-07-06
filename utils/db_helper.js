const {Pool, Client} = require('pg');

// ToDo: Put into Configfile
const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'db.qscoxswxnvdajazopzcd.supabase.co',
    database: process.env.POSTGRES_DB || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'H3m^iGHGSK68hTdXnb3yEENGj36Vf$',
    port: process.env.POSTGRES_PORT || 5432,
    ssl: (process.env.POSTGRES_DISABLE_SSL === 'true' ? false : {rejectUnauthorized: false})
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
    await pool.query('CREATE TABLE IF NOT EXISTS bet_reports (bet_id varchar(255) not null PRIMARY KEY, reporter varchar(255) not null, outcome int not null, report_timestamp timestamp not null)');
    await pool.query('CREATE TABLE IF NOT EXISTS amm_interactions (ID SERIAL PRIMARY KEY, buyer varchar(255) NOT NULL, bet varchar(255) NOT NULL, outcome int NOT NULL, direction varchar(10) NOT NULL, investmentAmount int8 NOT NULL, feeAmount int8 NOT NULL, outcomeTokensBought int8 NOT NULL, trx_timestamp timestamp NOT NULL)');
}

/**
 * @returns {Promise<void>}
 */
async function teardownDatabase() {
    await pool.query('DROP TABLE token_transactions;');
    await pool.query('DROP TABLE token_balances;');
    await pool.query('DROP TABLE bet_reports;');
    await pool.query('DROP TABLE amm_interactions;');
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
 * View the Amm Interactions of a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewAMMInteractionsOfUser(user) {
    const res = await pool.query('SELECT * FROM amm_interactions WHERE buyer = $1', [user]);
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
 * View the balance of a specific token
 *
 * @param symbol {String}
 * @param limit {number}
 * @returns {Promise<*>}
 */
async function viewLimitBalancesOfToken(symbol, limit) {
    const res = await pool.query('SELECT * FROM token_balances WHERE symbol = $1 ORDER BY balance DESC LIMIT $2', [symbol, limit]);
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
async function updateBalanceOfUser(client, user, symbol, timestamp, newBalance) {
    await client.query('INSERT INTO token_balances (owner, symbol, last_update, balance) VALUES($1, $2, $3, $4) ON CONFLICT (owner, symbol) DO UPDATE SET last_update = $3, balance = $4;', [user, symbol, timestamp, newBalance]);
}

async function insertTransaction(client, sender, receiver, amount, symbol, timestamp) {
    await client.query('INSERT INTO token_transactions(sender, receiver, amount, symbol, trx_timestamp) VALUES($1, $2, $3, $4, $5)', [sender, receiver, amount, symbol, timestamp]);
}

/**
 *
 * @param client {Client}
 * @param buyer {String}
 * @param bet {String}
 * @param outcome {number}
 * @param direction {String}
 * @param investmentAmount {number}
 * @param feeAmount {number}
 * @param outcomeTokensBought {number}
 * @param trx_timestamp
 * @returns {Promise<void>}
 */
async function insertAMMInteraction(client, buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp) {
    await client.query('INSERT INTO amm_interactions(buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8)', [buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp]);
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getTransactionOfUserBySymbol(client, user, symbol) {
    const res = await client.query('SELECT * FROM token_transactions WHERE symbol = $1 AND (sender = $2 OR receiver = $2)', [symbol, user]);
    return res.rows;
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param client {Client}
 * @param user {String}
 * @returns {Promise<*>}
 */
async function getTransactionOfUser(client, user) {
    const res = await client.query('SELECT * FROM token_transactions WHERE (sender = $1 OR receiver = $1)', [user]);
    return res.rows;
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUserBySymbol(user, symbol) {
    const res = await pool.query('SELECT * FROM token_transactions WHERE symbol = $1 AND (sender = $2 OR receiver = $2)', [symbol, user]);
    return res.rows;
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUser(user) {
    const res = await pool.query('SELECT * FROM token_transactions WHERE (sender = $1 OR receiver = $1)', [user]);
    return res.rows;
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param user {String}
 * @param bet {String}
 * @param outcome {String}
 * @returns {Promise<*>}
 */
async function viewUserInvestment(user, bet, outcome) {
    const res = await pool.query('SELECT buyer, bet, direction, SUM(investmentamount) AS amount FROM amm_interactions WHERE buyer = $1 AND bet = $2 AND outcome = $3 GROUP BY buyer, bet, direction', [user, bet, outcome]);
    return res.rows;
}

/**
 * Insert a new Report to resolve a bet
 *
 * @param bet_id {String}
 * @param reporter {String}
 * @param outcome {number}
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
    viewAMMInteractionsOfUser,
    getAllBalancesOfUser,
    viewAllBalancesOfUser,
    getAllBalancesOfToken,
    viewAllBalancesOfToken,
    viewLimitBalancesOfToken,
    updateBalanceOfUser,
    insertTransaction,
    insertAMMInteraction,
    getTransactionOfUserBySymbol,
    getTransactionOfUser,
    viewTransactionOfUserBySymbol,
    viewTransactionOfUser,
    insertReport,
    viewReport,
    viewUserInvestment
};
