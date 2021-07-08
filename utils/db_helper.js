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

const BEGIN = 'BEGIN';
const COMMIT = 'COMMIT';
const ROLLBACK = 'ROLLBACK';
const SET_ISOLATION_LEVEL = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ';

const CREATE_TOKEN_TRANSACTIONS = 'CREATE TABLE IF NOT EXISTS token_transactions (ID SERIAL PRIMARY KEY, sender varchar(255) not null, receiver varchar(255) not null, amount bigint not null, symbol varchar(255) not null, trx_timestamp timestamp not null);';
const CREATE_TOKEN_BALANCES = 'CREATE TABLE IF NOT EXISTS token_balances (owner varchar(255) not null, balance bigint not null, symbol varchar(255) not null, last_update timestamp not null, PRIMARY KEY(owner, symbol));';
const CREATE_BET_REPORTS = 'CREATE TABLE IF NOT EXISTS bet_reports (bet_id varchar(255) not null PRIMARY KEY, reporter varchar(255) not null, outcome smallint not null, report_timestamp timestamp not null);';
const CREATE_AMM_INTERACTIONS = 'CREATE TABLE IF NOT EXISTS amm_interactions (ID SERIAL PRIMARY KEY, buyer varchar(255) NOT NULL, bet varchar(255) NOT NULL, outcome smallint NOT NULL, direction varchar(10) NOT NULL, investmentAmount bigint NOT NULL, feeAmount bigint NOT NULL, outcomeTokensBought bigint NOT NULL, trx_timestamp timestamp NOT NULL);';

// ALTER TABLE token_transactions ALTER COLUMN amount TYPE BIGINT;
// ALTER TABLE token_balances ALTER COLUMN balance TYPE BIGINT;

const TEARDOWN_TOKEN_TRANSACTIONS = 'DROP TABLE token_transactions;';
const TEARDOWN_TOKEN_BALANCES = 'DROP TABLE token_balances;';
const TEARDOWN_BET_REPORTS = 'DROP TABLE bet_reports;';
const TEARDOWN_AMM_INTERACTIONS = 'DROP TABLE amm_interactions;';

const GET_BALANCE_OF_USER = 'SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2;';
const GET_ALL_BALANCE_OF_USER = 'SELECT * FROM token_balances WHERE owner = $1;';
const GET_ALL_BALANCE_OF_TOKEN = 'SELECT * FROM token_balances WHERE symbol = $1 AND balance > 0;';
const GET_LIMIT_BALANCE_OF_TOKEN = 'SELECT * FROM token_balances WHERE symbol = $1 ORDER BY owner, balance DESC LIMIT $2;';

const GET_ALL_AMM_INTERACTIONS_OF_USER = 'SELECT * FROM amm_interactions WHERE buyer = $1;';
const GET_USER_INVESTMENT = 'SELECT buyer, bet, direction, SUM(investmentamount) AS amount FROM amm_interactions WHERE buyer = $1 AND bet = $2 AND outcome = $3 GROUP BY buyer, bet, direction;';
const GET_TRANSACTIONS_OF_USER = 'SELECT * FROM token_transactions WHERE (sender = $1 OR receiver = $1);';
const GET_TRANSACTIONS_OF_USER_AND_TOKEN = 'SELECT * FROM token_transactions WHERE symbol = $1 AND (sender = $2 OR receiver = $2);';

const UPDATE_BALANCE_OF_USER = 'INSERT INTO token_balances (owner, symbol, last_update, balance) VALUES($1, $2, $3, $4) ON CONFLICT (owner, symbol) DO UPDATE SET last_update = $3, balance = $4;'
const INSERT_TOKEN_TRANSACTION = 'INSERT INTO token_transactions(sender, receiver, amount, symbol, trx_timestamp) VALUES($1, $2, $3, $4, $5);';
const INSERT_AMM_INTERACTION = 'INSERT INTO amm_interactions(buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8);';
const INSERT_REPORT = 'INSERT INTO bet_reports(bet_id, reporter, outcome, report_timestamp) VALUES($1, $2, $3, $4);';
const GET_REPORT = 'SELECT * FROM bet_reports WHERE bet_id = $1;';

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
    await pool.query(CREATE_TOKEN_TRANSACTIONS);
    await pool.query(CREATE_TOKEN_BALANCES);
    await pool.query(CREATE_BET_REPORTS);
    await pool.query(CREATE_AMM_INTERACTIONS);
}

/**
 * @returns {Promise<void>}
 */
async function teardownDatabase() {
    await pool.query(TEARDOWN_TOKEN_TRANSACTIONS);
    await pool.query(TEARDOWN_TOKEN_BALANCES);
    await pool.query(TEARDOWN_BET_REPORTS);
    await pool.query(TEARDOWN_AMM_INTERACTIONS);
}

/**
 * @returns {Promise<Client>}
 */
async function createDBTransaction() {
    const client = await getConnection();
    await client.query(BEGIN);
    await client.query(SET_ISOLATION_LEVEL);
    return client;
}

/**
 * @param client {Client}
 * @returns {Promise<void>}
 */
async function commitDBTransaction(client) {
    await client.query(COMMIT);
    client.release();
}

/**
 * @param client {Client}
 * @returns {Promise<void>}
 */
async function rollbackDBTransaction(client) {
    await client.query(ROLLBACK);
    client.release();
}

/**
 * Get the balance of a specific token from a user
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getBalanceOfUser(client, user, symbol) {
    const res = await client.query(GET_BALANCE_OF_USER, [symbol, user]);
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
    const res = await pool.query(GET_BALANCE_OF_USER, [symbol, user]);
    return res.rows;
}

/**
 * View the Amm Interactions of a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewAMMInteractionsOfUser(user) {
    const res = await pool.query(GET_ALL_AMM_INTERACTIONS_OF_USER, [user]);
    return res.rows;
}

/**
 * Get the balance of a specific token from a user
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @returns {Promise<*>}
 */
async function getAllBalancesOfUser(client, user) {
    const res = await client.query(GET_ALL_BALANCE_OF_USER, [user]);
    return res.rows;
}

/**
 * View the balance of a specific token from a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewAllBalancesOfUser(user) {
    const res = await pool.query(GET_ALL_BALANCE_OF_USER, [user]);
    return res.rows;
}

/**
 * Get the balance of a specific token
 * Build for Transactions
 *
 * @param client {Client}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getAllBalancesOfToken(client, symbol) {
    const res = await client.query(GET_ALL_BALANCE_OF_TOKEN, [symbol]);
    return res.rows;
}

/**
 * View the balance of a specific token
 *
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewAllBalancesOfToken(symbol) {
    const res = await pool.query(GET_ALL_BALANCE_OF_TOKEN, [symbol]);
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
    const res = await pool.query(GET_LIMIT_BALANCE_OF_TOKEN, [symbol, limit]);
    return res.rows;
}

/**
 * Update the balance of a specific token from a user
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @param timestamp {Date}
 * @param newBalance {bigint}
 * @returns {Promise<void>}
 */
async function updateBalanceOfUser(client, user, symbol, timestamp, newBalance) {
    await client.query(UPDATE_BALANCE_OF_USER, [user, symbol, timestamp, newBalance]);
}

/**
 * Save a Token Transaction
 * Build for Transactions
 *
 * @param client {Client}
 * @param sender {String}
 * @param receiver {String}
 * @param amount {bigint}
 * @param symbol {String}
 * @param timestamp
 * @returns {Promise<void>}
 */
async function insertTransaction(client, sender, receiver, amount, symbol, timestamp) {
    await client.query(INSERT_TOKEN_TRANSACTION, [sender, receiver, amount, symbol, timestamp]);
}

/**
 * Save a Interaction with the AMM
 * Build for Transactions
 *
 * @param client {Client}
 * @param buyer {String}
 * @param bet {String}
 * @param outcome {number}
 * @param direction {String}
 * @param investmentAmount {bigint}
 * @param feeAmount {bigint}
 * @param outcomeTokensBought {bigint}
 * @param trx_timestamp
 * @returns {Promise<void>}
 */
async function insertAMMInteraction(client, buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp) {
    await client.query(INSERT_AMM_INTERACTION, [buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp]);
}

/**
 * Get all transactions of a user with a specific token
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @returns {Promise<*>}
 */
async function getTransactionOfUser(client, user) {
    const res = await client.query(GET_TRANSACTIONS_OF_USER, [user]);
    return res.rows;
}

/**
 * Get all transactions of a user with a specific token
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUser(user) {
    const res = await pool.query(GET_TRANSACTIONS_OF_USER, [user]);
    return res.rows;
}

/**
 * Get all transactions of a user with a specific token
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getTransactionOfUserBySymbol(client, user, symbol) {
    const res = await client.query(GET_TRANSACTIONS_OF_USER_AND_TOKEN, [symbol, user]);
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
    const res = await pool.query(GET_TRANSACTIONS_OF_USER_AND_TOKEN, [symbol, user]);
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
    const res = await pool.query(GET_USER_INVESTMENT, [user, bet, outcome]);
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
    await pool.query(INSERT_REPORT, [bet_id, reporter, outcome, timestamp]);
}

/**
 * Insert a new Report to resolve a bet
 * Build for Transactions
 *
 * @param client {Client}
 * @param bet_id {String}
 * @param reporter {String}
 * @param outcome {number}
 * @param timestamp {Date}
 * @returns {Promise<void>}
 */
async function insertReportChain(client, bet_id, reporter, outcome, timestamp) {
    await client.query(INSERT_REPORT, [bet_id, reporter, outcome, timestamp]);
}

/**
 * view the report of a bet
 *
 * @param bet_id {String}
 * @returns {Promise<*>}
 */
async function viewReport(bet_id) {
    const res = await pool.query(GET_REPORT, [bet_id]);
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
    insertReportChain,
    viewReport,
    viewUserInvestment
};
