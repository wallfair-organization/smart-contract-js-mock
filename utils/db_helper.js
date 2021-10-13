const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'testdb',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  ssl:
    process.env.POSTGRES_DISABLE_SSL === 'true'
      ? false
      : {
          rejectUnauthorized: false,
          ca: fs.readFileSync(process.env.POSTGRES_CA).toString(),
        },
});

const DIRECTION = {
  BUY: 'BUY',
  SELL: 'SELL',
  PAYOUT: 'PAYOUT',
  REFUND: 'REFUND',
};

const CASINO_TRADE_STATE = {
  OPEN: 0,
  LOCKED: 1,
  WIN: 2,
  LOSS: 3,
};

const BEGIN = 'BEGIN';
const COMMIT = 'COMMIT';
const ROLLBACK = 'ROLLBACK';
const SET_ISOLATION_LEVEL = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ';

const CREATE_TOKEN_TRANSACTIONS =
  'CREATE TABLE IF NOT EXISTS token_transactions (ID SERIAL PRIMARY KEY, sender varchar(255) not null, receiver varchar(255) not null, amount bigint not null, symbol varchar(255) not null, trx_timestamp timestamp not null);';
const CREATE_TOKEN_BALANCES =
  'CREATE TABLE IF NOT EXISTS token_balances (owner varchar(255) not null, balance bigint not null, symbol varchar(255) not null, last_update timestamp not null, PRIMARY KEY(owner, symbol));';
const CREATE_BET_REPORTS =
  'CREATE TABLE IF NOT EXISTS bet_reports (bet_id varchar(255) not null PRIMARY KEY, reporter varchar(255) not null, outcome smallint not null, report_timestamp timestamp not null);';
const CREATE_AMM_INTERACTIONS =
  'CREATE TABLE IF NOT EXISTS amm_interactions (ID SERIAL PRIMARY KEY, buyer varchar(255) NOT NULL, bet varchar(255) NOT NULL, outcome smallint NOT NULL, direction varchar(10) NOT NULL, investmentAmount bigint NOT NULL, feeAmount bigint NOT NULL, outcomeTokensBought bigint NOT NULL, trx_timestamp timestamp NOT NULL);';
const CREATE_CASINO_TRADES =
  'CREATE TABLE IF NOT EXISTS casino_trades (ID SERIAL PRIMARY KEY, userId varchar(255) NOT NULL, crashFactor decimal NOT NULL, stakedAmount bigint NOT NULL, state smallint NOT NULL, gameId varchar(255), created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);';

// ALTER TABLE token_transactions ALTER COLUMN amount TYPE BIGINT;
// ALTER TABLE token_balances ALTER COLUMN balance TYPE BIGINT;

const TEARDOWN_TOKEN_TRANSACTIONS = 'DROP TABLE token_transactions;';
const TEARDOWN_TOKEN_BALANCES = 'DROP TABLE token_balances;';
const TEARDOWN_BET_REPORTS = 'DROP TABLE bet_reports;';
const TEARDOWN_AMM_INTERACTIONS = 'DROP TABLE amm_interactions;';
const TEARDOWN_CASINO_TRADES = 'DROP TABLE casino_trades;';

const GET_BALANCE_OF_USER =
  'SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2;';
const GET_ALL_BALANCE_OF_USER =
  'SELECT * FROM token_balances WHERE owner = $1;';
const GET_ALL_BALANCE_OF_TOKEN =
  'SELECT * FROM token_balances WHERE symbol = $1 AND balance > 0;';
const GET_LIMIT_BALANCE_OF_TOKEN =
  'SELECT * FROM token_balances WHERE symbol = $1 ORDER BY owner, balance DESC LIMIT $2;';

const GET_TRANSACTIONS_OF_USER =
  'SELECT * FROM token_transactions WHERE (sender = $1 OR receiver = $1);';
const GET_TRANSACTIONS_OF_USER_AND_TOKEN =
  'SELECT * FROM token_transactions WHERE symbol = $1 AND (sender = $2 OR receiver = $2);';

const GET_ALL_AMM_INTERACTIONS_OF_USER =
  'SELECT * FROM amm_interactions WHERE buyer = $1;';
const GET_BET_INTERACTIONS = 'SELECT * FROM amm_interactions WHERE bet = $1';
const GET_BET_INTERACTIONS_SUMMARY =
  'SELECT outcome, SUM(investmentamount) AS amount FROM amm_interactions WHERE bet = $1 AND direction = $2 AND trx_timestamp <= $3 GROUP BY outcome;';
const GET_USER_INVESTMENT =
  'SELECT buyer, bet, direction, SUM(investmentamount) AS amount, SUM(feeamount) AS fee FROM amm_interactions WHERE buyer = $1 AND bet = $2 AND outcome = $3 GROUP BY buyer, bet, direction;';
const GET_BET_INVESTORS =
  'SELECT buyer, direction, SUM(investmentamount) AS amount FROM amm_interactions WHERE bet = $1 GROUP BY buyer, direction;';

const UPDATE_BALANCE_OF_USER =
  'INSERT INTO token_balances (owner, symbol, last_update, balance) VALUES($1, $2, $3, $4) ON CONFLICT (owner, symbol) DO UPDATE SET last_update = $3, balance = $4;';
const INSERT_TOKEN_TRANSACTION =
  'INSERT INTO token_transactions(sender, receiver, amount, symbol, trx_timestamp) VALUES($1, $2, $3, $4, $5);';
const INSERT_AMM_INTERACTION =
  'INSERT INTO amm_interactions(buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8);';
const INSERT_REPORT =
  'INSERT INTO bet_reports(bet_id, reporter, outcome, report_timestamp) VALUES($1, $2, $3, $4);';
const GET_REPORT = 'SELECT * FROM bet_reports WHERE bet_id = $1;';

const INSERT_CASINO_TRADE =
  'INSERT INTO casino_trades (userId, crashFactor, stakedAmount, state) VALUES ($1, $2, $3, $4);';
const LOCK_OPEN_CASINO_TRADES = `UPDATE casino_trades SET state = $1, gameId = $2 WHERE state = ${CASINO_TRADE_STATE.OPEN};`;
const SET_CASINO_TRADE_OUTCOMES =
  'UPDATE casino_trades SET state = CASE WHEN crashFactor <= $2::decimal THEN 2 ELSE 3 end WHERE gameId = $1 AND state = 1 RETURNING userId, crashFactor, stakedAmount, state;';
const GET_CASINO_TRADES =
  'SELECT userId, crashFactor, stakedAmount FROM casino_trades WHERE gameId = $1 AND state = $2;';
const SET_CASINO_TRADE_STATE =
  'UPDATE casino_trades SET state = $1, crashfactor = $2 WHERE gameId = $3 AND state = $4 and userId = $5 RETURNING *;';
const GET_CASINO_TRADES_BY_USER_AND_STATES =
  'SELECT * FROM casino_trades WHERE userId = $1 AND state = ANY($2::smallint[]);';

const GET_AMM_PRICE_ACTIONS = (interval1, interval2, timePart) => `
  select date_trunc($1, trx_timestamp) + (interval '${interval1}' * (extract('${timePart}' from trx_timestamp)::int / $2)) as trunc,
  outcomeindex,
  avg(quote) as quote
from amm_price_action
where trx_timestamp > localtimestamp - interval '${interval2}' and betid = $3
group by outcomeindex, trunc
order by outcomeindex, trunc;`;
const GET_LATEST_PRICE_ACTIONS = `select * from amm_price_action
    where trx_timestamp = (
        select max(trx_timestamp)
            from amm_price_action
            where betid = $1
    )`;

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
  await pool.query(CREATE_CASINO_TRADES);
}

/**
 * @returns {Promise<void>}
 */
async function teardownDatabase() {
  await pool.query(TEARDOWN_TOKEN_TRANSACTIONS);
  await pool.query(TEARDOWN_TOKEN_BALANCES);
  await pool.query(TEARDOWN_BET_REPORTS);
  await pool.query(TEARDOWN_AMM_INTERACTIONS);
  await pool.query(TEARDOWN_CASINO_TRADES);
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
async function updateBalanceOfUser(
  client,
  user,
  symbol,
  timestamp,
  newBalance
) {
  await client.query(UPDATE_BALANCE_OF_USER, [
    user,
    symbol,
    timestamp,
    newBalance,
  ]);
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
async function insertTransaction(
  client,
  sender,
  receiver,
  amount,
  symbol,
  timestamp
) {
  await client.query(INSERT_TOKEN_TRANSACTION, [
    sender,
    receiver,
    amount,
    symbol,
    timestamp,
  ]);
}

/**
 * Saves a new Casino Trade
 * Meant to be used inside a transaction together with a balance
 *
 * @param client {Client}
 * @param userWalletAddr  {String}
 * @param crashFactor {Number}
 * @param stakedAmount {Number}
 * @param state {Number}
 * @param gameId {String}
 */
async function insertCasinoTrade(
  client,
  userWalletAddr,
  crashFactor,
  stakedAmount
) {
  await client.query(INSERT_CASINO_TRADE, [
    userWalletAddr,
    crashFactor,
    stakedAmount,
    CASINO_TRADE_STATE.OPEN,
  ]);
}

/**
 * Attempts to cashout user from a casino trade
 *
 * @param {Client} client
 * @param {String} userwalletAddr
 * @param {String} gameId
 * @returns
 */
async function attemptCashout(client, userwalletAddr, gameId, crashFactor) {
  return await client.query(SET_CASINO_TRADE_STATE, [
    CASINO_TRADE_STATE.WIN,
    crashFactor,
    gameId,
    CASINO_TRADE_STATE.LOCKED,
    userwalletAddr,
  ]);
}

/**
 * Locks all open trades into specific gameid
 *
 * @param client {Client}
 * @param gameId {String}
 */
async function lockOpenCasinoTrades(client, gameId) {
  await client.query(LOCK_OPEN_CASINO_TRADES, [
    CASINO_TRADE_STATE.LOCKED,
    gameId,
  ]);
}

/**
 * Sets the outcome of trades locked in a casino game
 *
 * @param client {Client}
 * @param gameId {String}
 * @param {Number} crashFactor
 */
async function setCasinoTradeOutcomes(client, gameId, crashFactor) {
  return await client.query(SET_CASINO_TRADE_OUTCOMES, [gameId, crashFactor]);
}

/**
 * Gets casino trades with a certain state from a specific game
 *
 * @param {Client} client
 * @param {String} gameId
 * @param {CASINO_TRADE_STATE} state
 */
async function getCasinoTrades(client, gameId, state) {
  const res = await client.query(GET_CASINO_TRADES, [gameId, state]);
  return res.rows;
}

/**
 * Gets casino trades by userId and states
 *
 * @param {String} userId
 * @param {CASINO_TRADE_STATE[]} states
 */
async function getCasinoTradesByUserAndStates(userId, states) {
  const res = await pool.query(GET_CASINO_TRADES_BY_USER_AND_STATES, [
    userId,
    states,
  ]);
  return res.rows;
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
async function insertAMMInteraction(
  client,
  buyer,
  bet,
  outcome,
  direction,
  investmentAmount,
  feeAmount,
  outcomeTokensBought,
  trx_timestamp
) {
  await client.query(INSERT_AMM_INTERACTION, [
    buyer,
    bet,
    outcome,
    direction,
    investmentAmount,
    feeAmount,
    outcomeTokensBought,
    trx_timestamp,
  ]);
}

/**
 * Get all transactions of a user (sender/recipient)
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUserChain(client, user) {
  const res = await client.query(GET_TRANSACTIONS_OF_USER, [user]);
  return res.rows;
}

/**
 * Get all transactions of a user (sender/recipient)
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUser(user) {
  const res = await pool.query(GET_TRANSACTIONS_OF_USER, [user]);
  return res.rows;
}

/**
 * Get all transactions of a user with a specific token (sender/recipient)
 * Build for Transactions
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUserBySymbolChain(client, user, symbol) {
  const res = await client.query(GET_TRANSACTIONS_OF_USER_AND_TOKEN, [
    symbol,
    user,
  ]);
  return res.rows;
}

/**
 * Get all transactions of a user with a specific token sender/recipient
 *
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUserBySymbol(user, symbol) {
  const res = await pool.query(GET_TRANSACTIONS_OF_USER_AND_TOKEN, [
    symbol,
    user,
  ]);
  return res.rows;
}

/**
 * Get all buy/sell/payout/refund aggregated amounts for particular user in particular bet
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
 * Get interactions between users and particular bet
 * For buy/sell/refund/payput operation directions or from specific startDate
 *
 * @param client {Client}
 * @param bet {String}
 * @param startDate {Date}
 * @param direction {String}
 * @returns {Promise<*>}
 */
async function getBetInteractions(bet, startDate, direction) {
  const values = [bet];
  let query = GET_BET_INTERACTIONS;

  if (startDate) {
    query += ' AND trx_timestamp >= $2';
    values.push(startDate);
  }

  if (direction) {
    query += ` AND direction = $${startDate ? 3 : 2}`;
    values.push(direction);
  }

  const res = await pool.query(`${query};`, values);
  return res.rows;
}

/**
 * Get interactions summary between users and particular bet
 * For buy/sell/refund/payput operation directions and specific endDate
 *
 * @param client {Client}
 * @param bet {String}
 * @param direction {String}
 * @param endDate {Date}
 * @returns {Promise<*>}
 */
async function getBetInteractionsSummary(bet, direction, endDate) {
  const res = await pool.query(GET_BET_INTERACTIONS_SUMMARY, [
    bet,
    direction,
    endDate,
  ]);
  return res.rows;
}

/**
 * Get all buyers and sellers for particular bet with aggregated buy/sell amounts
 *
 * @param client {Client}
 * @param bet {String}
 * @returns {Promise<*>}
 */
async function getBetInvestors(bet) {
  const res = await pool.query(GET_BET_INVESTORS, [bet]);
  return res.rows;
}

/**
 * Get all buyers and sellers for particular bet with aggregated buy/sell amounts
 * Build for Transactions
 *
 * @param client {Client}
 * @param bet {String}
 * @returns {Promise<*>}
 */
async function getBetInvestorsChain(client, bet) {
  const res = await client.query(GET_BET_INVESTORS, [bet]);
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

function getTimeParams(timePeriod, betId) {
  switch (timePeriod) {
    case '7days':
      return ['4 hours', '7 days', 'hour', 'day', 4, betId];
    case '30days':
      return ['8 hours', '30 days', 'hour', 'day', 8, betId];
    case '24hours':
    default:
      return ['30 minutes', '1 day', 'minute', 'hour', 5, betId];
  }
}

/**
 * view the report of a bet
 *
 * @param bet_id {String}
 * @returns {Promise<*>}
 */
async function getAmmPriceActions(betId, timeOption) {
  const params = getTimeParams(timeOption, betId);
  const query = GET_AMM_PRICE_ACTIONS(params[0], params[1], params[2]);
  const res = await pool.query(query, params.slice(3));
  return res.rows.map((r) => ({
    outcomeIndex: r.outcomeindex,
    trxTimestamp: r.trunc,
    quote: Number(r.quote),
  }));
}

/**
 * Gets the most recent price actions for a bet id
 *
 * @param betId {String}
 * @returns {Promise<*>}
 */
async function getLatestPriceActions(betId) {
  const res = await pool.query(GET_LATEST_PRICE_ACTIONS, [betId]);
  return res.rows;
}

module.exports = {
  pool,
  DIRECTION,
  CASINO_TRADE_STATE,
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
  viewTransactionOfUserBySymbolChain,
  viewTransactionOfUserBySymbol,
  viewTransactionOfUserChain,
  viewTransactionOfUser,
  insertReport,
  insertReportChain,
  viewReport,
  viewUserInvestment,
  getBetInvestorsChain,
  getBetInvestors,
  getBetInteractions,
  getBetInteractionsSummary,
  insertCasinoTrade,
  lockOpenCasinoTrades,
  setCasinoTradeOutcomes,
  getCasinoTrades,
  getCasinoTradesByUserAndStates,
  attemptCashout,
  getAmmPriceActions,
  getLatestPriceActions,
};
