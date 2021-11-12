const client = require('@wallfair.io/wallfair-commons').utils.getPostgresConnection();
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
  CANCELED: 4
};

const CREATE_TOKEN_TRANSACTIONS =
  'CREATE TABLE IF NOT EXISTS token_transactions (ID SERIAL PRIMARY KEY, sender varchar(255) not null, receiver varchar(255) not null, amount bigint not null, symbol varchar(255) not null, trx_timestamp timestamp not null);';
const CREATE_TOKEN_BALANCES =
  'CREATE TABLE IF NOT EXISTS token_balances (owner varchar(255) not null, balance bigint not null, symbol varchar(255) not null, last_update timestamp not null, PRIMARY KEY(owner, symbol));';
const CREATE_BET_REPORTS =
  'CREATE TABLE IF NOT EXISTS bet_reports (bet_id varchar(255) not null PRIMARY KEY, reporter varchar(255) not null, outcome smallint not null, report_timestamp timestamp not null);';
const CREATE_AMM_INTERACTIONS =
  'CREATE TABLE IF NOT EXISTS amm_interactions (ID SERIAL PRIMARY KEY, buyer varchar(255) NOT NULL, bet varchar(255) NOT NULL, outcome smallint NOT NULL, direction varchar(10) NOT NULL, investmentAmount bigint NOT NULL, feeAmount bigint NOT NULL, outcomeTokensBought bigint NOT NULL, trx_timestamp timestamp NOT NULL);';
const CREATE_CASINO_MATCHES =
  'CREATE TABLE IF NOT EXISTS casino_matches (ID SERIAL PRIMARY KEY, gameId varchar(255) NOT NULL, gameHash varchar(255), crashFactor decimal NOT NULL, gameLengthInSeconds INT, amountInvestedSum bigint, amountRewardedSum bigint, numTrades INT, numcashouts INT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)';
const CREATE_CASINO_TRADES =
  'CREATE TABLE IF NOT EXISTS casino_trades (ID SERIAL PRIMARY KEY, userId varchar(255) NOT NULL, crashFactor decimal NOT NULL, stakedAmount bigint NOT NULL, state smallint NOT NULL, gameHash varchar(255), gameId varchar(255), created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, game_match int, CONSTRAINT fk_game_match FOREIGN KEY (game_match) REFERENCES casino_matches(ID));';

// ALTER TABLE token_transactions ALTER COLUMN amount TYPE BIGINT;
// ALTER TABLE token_balances ALTER COLUMN balance TYPE BIGINT;

const TEARDOWN_TOKEN_TRANSACTIONS = 'DROP TABLE token_transactions;';
const TEARDOWN_TOKEN_BALANCES = 'DROP TABLE token_balances;';
const TEARDOWN_BET_REPORTS = 'DROP TABLE bet_reports;';
const TEARDOWN_AMM_INTERACTIONS = 'DROP TABLE amm_interactions;';
const TEARDOWN_CASINO_TRADES = 'DROP TABLE casino_trades;';
const TEARDOWN_CASINO_MATCHES = 'DROP TABLE casino_matches';

const GET_BALANCE_OF_USER = 'SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2;';
const GET_BALANCE_OF_USER_FOR_UPDATE = 'SELECT * FROM token_balances WHERE symbol = $1 AND owner = $2 FOR UPDATE;';
const GET_ALL_BALANCE_OF_USER = 'SELECT * FROM token_balances WHERE owner = $1;';
const GET_ALL_BALANCE_OF_TOKEN = 'SELECT * FROM token_balances WHERE symbol = $1 AND balance > 0;';
const GET_LIMIT_BALANCE_OF_TOKEN =
  'SELECT * FROM token_balances WHERE symbol = $1 ORDER BY owner, balance DESC LIMIT $2;';

const GET_TRANSACTIONS_OF_USER =
  'SELECT * FROM token_transactions WHERE (sender = $1 OR receiver = $1);';
const GET_TRANSACTIONS_OF_USER_AND_TOKEN =
  'SELECT * FROM token_transactions WHERE symbol = $1 AND (sender = $2 OR receiver = $2);';

const GET_ALL_AMM_INTERACTIONS_OF_USER = 'SELECT * FROM amm_interactions WHERE buyer = $1;';
const GET_BET_INTERACTIONS = 'SELECT * FROM amm_interactions WHERE bet = $1';
const GET_BET_INTERACTIONS_SUMMARY =
  'SELECT outcome, SUM(investmentamount) AS amount FROM amm_interactions WHERE bet = $1 AND direction = $2 AND trx_timestamp <= $3 GROUP BY outcome;';
const GET_USER_INVESTMENT =
  'SELECT buyer, bet, direction, SUM(investmentamount) AS amount, SUM(feeamount) AS fee FROM amm_interactions WHERE buyer = $1 AND bet = $2 AND outcome = $3 GROUP BY buyer, bet, direction;';
const GET_BET_INVESTORS =
  'SELECT buyer, direction, SUM(investmentamount) AS amount FROM amm_interactions WHERE bet = $1 GROUP BY buyer, direction;';

const UPDATE_BALANCE_OF_USER =
  'INSERT INTO token_balances (owner, symbol, last_update, balance) VALUES($1, $2, $3, $4) ON CONFLICT (owner, symbol) DO UPDATE SET last_update = $3, balance = token_balances.balance + $4 RETURNING balance;';
const INSERT_TOKEN_TRANSACTION =
  'INSERT INTO token_transactions(sender, receiver, amount, symbol, trx_timestamp) VALUES($1, $2, $3, $4, $5);';
const INSERT_AMM_INTERACTION =
  'INSERT INTO amm_interactions(buyer, bet, outcome, direction, investmentAmount, feeAmount, outcomeTokensBought, trx_timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8);';
const INSERT_REPORT =
  'INSERT INTO bet_reports(bet_id, reporter, outcome, report_timestamp) VALUES($1, $2, $3, $4);';
const GET_REPORT = 'SELECT * FROM bet_reports WHERE bet_id = $1;';

const INSERT_CASINO_MATCH =
  'INSERT INTO casino_matches (gameId, gameHash, crashfactor, gamelengthinseconds) VALUES ($1, $2, $3, $4) RETURNING id;';
const INSERT_CASINO_TRADE =
  'INSERT INTO casino_trades (userId, crashFactor, stakedAmount, state, gameId) VALUES ($1, $2, $3, $4, $5);';
const INSERT_CASINO_SINGLE_GAME_TRADE =
  'INSERT INTO casino_trades (userId, crashFactor, stakedAmount, state, gameId, gameHash, riskFactor) VALUES ($1, $2, $3, $4, $5, $6, $7);';
const LOCK_OPEN_CASINO_TRADES = `UPDATE casino_trades SET state = $1, gameHash = $2, game_match = $3 WHERE state = ${CASINO_TRADE_STATE.OPEN} AND gameId = $4;`;
const SET_CASINO_TRADE_OUTCOMES =
  'UPDATE casino_trades SET state = CASE WHEN crashFactor <= $2::decimal THEN 2 ELSE 3 end WHERE gameHash = $1 AND state = 1 RETURNING userId, crashFactor, stakedAmount, state;';
const GET_CASINO_TRADES =
  'SELECT userId, crashFactor, stakedAmount FROM casino_trades WHERE gameHash = $1 AND state = $2;';
const SET_CASINO_TRADE_STATE =
  'UPDATE casino_trades SET state = $1, crashfactor = $2 WHERE gameHash = $3 AND state = $4 AND userId = $5 RETURNING *;';
const CANCEL_CASINO_TRADE =
  `UPDATE casino_trades SET state = ${CASINO_TRADE_STATE.CANCELED} WHERE id = $1 AND state = ${CASINO_TRADE_STATE.OPEN} AND gameHash IS NULL RETURNING *;`;
const GET_CASINO_TRADES_BY_USER_AND_STATES =
  'SELECT * FROM casino_trades WHERE userId = $1 AND state = ANY($2::smallint[]);';
const GET_CASINO_TRADES_BY_PERIOD =
  `SELECT * FROM casino_trades WHERE created_at >= CURRENT_TIMESTAMP - $1 * INTERVAL '1 hour' ORDER BY $2 DESC`
const GET_OPEN_TRADES_BY_USER_AND_GAME =
  `SELECT * FROM casino_trades WHERE state= ${CASINO_TRADE_STATE.OPEN} AND userId = $1 AND gameId = $2`
const GET_HIGH_CASINO_TRADES_BY_PERIOD =
  `SELECT * FROM casino_trades WHERE created_at >= CURRENT_TIMESTAMP - $1 * INTERVAL '1 hour' AND state=2 AND gameId=$3 ORDER BY (crashfactor * stakedamount) DESC LIMIT $2`
const GET_HIGH_CASINO_TRADES_BY_PERIOD_ALL_GAMES =
  `SELECT * FROM casino_trades WHERE created_at >= CURRENT_TIMESTAMP - $1 * INTERVAL '1 hour' AND state=2 ORDER BY (crashfactor * stakedamount) DESC LIMIT $2`
const GET_LUCKY_CASINO_TRADES_BY_PERIOD =
  `SELECT * FROM casino_trades WHERE created_at >= CURRENT_TIMESTAMP - $1 * INTERVAL '1 hour' AND state=2 AND gameId=$3 ORDER BY crashfactor DESC LIMIT $2`
const GET_LUCKY_CASINO_TRADES_BY_PERIOD_ALL_GAMES =
  `SELECT * FROM casino_trades WHERE created_at >= CURRENT_TIMESTAMP - $1 * INTERVAL '1 hour' AND state=2 ORDER BY crashfactor DESC LIMIT $2`
const GET_CASINO_TRADES_BY_STATE = (p1, p2) =>
  `SELECT * FROM casino_trades WHERE state = $1 AND gamehash ${p2 ? '= $2' : 'IS NULL'}`;
const GET_OPEN_TRADES_BY_GAME = `SELECT * FROM casino_trades WHERE state= ${CASINO_TRADE_STATE.OPEN} AND gamehash IS NULL AND gameId = $1`;
const GET_LAST_COMPLETED_CASINO_TRADES_BY_GAMETYPE =
  `SELECT * FROM casino_trades WHERE gameId = $1 AND state = ANY('{${CASINO_TRADE_STATE.WIN},${CASINO_TRADE_STATE.LOSS}}'::smallint[]) ORDER BY created_at DESC LIMIT $2;`;
const GET_LAST_COMPLETED_CASINO_TRADES_BY_GAMETYPE_USERID =
  `SELECT * FROM casino_trades WHERE gameId = $1 AND userId = $2 AND state = ANY('{${CASINO_TRADE_STATE.WIN},${CASINO_TRADE_STATE.LOSS}}'::smallint[]) ORDER BY created_at DESC LIMIT $3;`;
const GET_CASINO_MATCHES =
  'SELECT * FROM casino_matches WHERE gameid = $1 ORDER BY created_at DESC LIMIT $2 OFFSET ($2*$3)';
const GET_CASINO_MATCH_BY_ID =
  'SELECT * FROM casino_matches WHERE id = $1'
const GET_CASINO_MATCH_BY_GAME_HASH =
  'SELECT * FROM casino_matches WHERE gamehash = $1 AND amountinvestedsum IS NOT NULL AND amountrewardedsum IS NOT NULL AND numtrades IS NOT NULL AND numcashouts IS NOT NULL;'

const GET_NEXT_CASINO_MATCH_BY_GAME_HASH =
  `SELECT * FROM casino_matches cm WHERE (SELECT id FROM casino_matches WHERE gamehash = $1) < cm.id AND gameId = $2 AND amountinvestedsum IS NOT NULL AND amountrewardedsum IS NOT NULL AND numtrades IS NOT NULL AND numcashouts IS NOT NULL ORDER BY ID asc limit 1;`
const GET_PREV_CASINO_MATCH_BY_GAME_HASH =
  `SELECT * FROM casino_matches cm WHERE (SELECT id FROM casino_matches WHERE gamehash = $1) > cm.id AND gameId = $2 ORDER BY ID DESC limit 1;`

const GET_CASINO_MATCHES_EXISTING_IN_TRADES =
  `SELECT * FROM casino_matches cm WHERE amountinvestedsum IS NULL OR amountrewardedsum IS NULL OR numtrades IS NULL OR numcashouts IS NULL ORDER BY created_at DESC LIMIT 50`;
const UPDATE_CASINO_MATCHES_MISSING_VALUES =
  `UPDATE casino_matches cm
   SET amountinvestedsum=amountinvestedsum_query.total,
       amountrewardedsum=amountrewardedsum_query.total,
       numtrades=numtrades_query.total,
       numcashouts=numcashouts_query.total
     FROM
     (SELECT COALESCE(SUM(stakedamount),0) as total from casino_trades ct where ct.gamehash=$1) AS amountinvestedsum_query,
     (SELECT COALESCE(SUM(stakedamount),0) as total from casino_trades ct where ct.state=2 and ct.gamehash=$1) AS amountrewardedsum_query,
     (SELECT count(ct.id) as total from casino_trades ct where ct.gamehash=$1) AS numtrades_query,
     (SELECT count(ct.id) as total from casino_trades ct where ct.gamehash=$1 and ct.state=2) AS numcashouts_query
   WHERE cm.gamehash=$1`;

const GET_USER_PLAYED_LAST_X_DAYS_IN_ROW =
  `SELECT date_trunc('day', ct.created_at) "day", count(1) AS total_played FROM casino_trades ct WHERE ct.userid = $1 and ct.created_at >= CURRENT_TIMESTAMP - $2 * INTERVAL '1 day' GROUP BY 1 ORDER BY 1;`

const GET_ALL_TRADES_BY_GAME_HASH =
  'SELECT * FROM casino_trades WHERE gameHash = $1;';

const SET_CASINO_LOST_TRADES_STATE =
  `UPDATE casino_trades SET state = ${CASINO_TRADE_STATE.LOSS}, crashfactor = $2 WHERE gamehash = $1 AND state = ${CASINO_TRADE_STATE.LOCKED} RETURNING *;`;

const COUNT_CASINO_TRADES_BY_LAST_X_HOURS =
  `SELECT count(id) as totalTrades, COALESCE(SUM(stakedamount),0) as totalVolume FROM casino_trades WHERE state = ANY('{${CASINO_TRADE_STATE.LOCKED},${CASINO_TRADE_STATE.WIN},${CASINO_TRADE_STATE.LOSS}}'::smallint[]) AND created_at >= CURRENT_TIMESTAMP - $1 * INTERVAL '1 hour';`

const COUNT_CASINO_TRADES_BY_ALLTIME =
  `SELECT count(id) as totalTrades, COALESCE(SUM(stakedamount),0) as totalVolume FROM casino_trades WHERE state = ANY('{${CASINO_TRADE_STATE.LOCKED},${CASINO_TRADE_STATE.WIN},${CASINO_TRADE_STATE.LOSS}}'::smallint[]);`

const GET_AMM_PRICE_ACTIONS = (interval1, interval2, timePart) => `
  select date_trunc($1, trx_timestamp) + (interval '${interval1}' * (extract('${timePart}' from trx_timestamp)::int / $2)) as trunc,
         outcomeindex, avg(quote) as quote
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
 * @returns {Promise<void>}
 */
async function setupDatabase() {
  await (await client).query(CREATE_TOKEN_TRANSACTIONS);
  await (await client).query(CREATE_TOKEN_BALANCES);
  await (await client).query(CREATE_BET_REPORTS);
  await (await client).query(CREATE_AMM_INTERACTIONS);
  await (await client).query(CREATE_CASINO_MATCHES);
  await (await client).query(CREATE_CASINO_TRADES);
}

/**
 * @returns {Promise<void>}
 */
async function teardownDatabase() {
  await (await client).query(TEARDOWN_TOKEN_TRANSACTIONS);
  await (await client).query(TEARDOWN_TOKEN_BALANCES);
  await (await client).query(TEARDOWN_BET_REPORTS);
  await (await client).query(TEARDOWN_AMM_INTERACTIONS);
  await (await client).query(TEARDOWN_CASINO_TRADES);
  await (await client).query(TEARDOWN_CASINO_MATCHES);
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
  const res = await (await client).query(GET_BALANCE_OF_USER, [symbol, user]);
  return res.rows;
}

/**
 * Get the balance of a specific token from a user
 * Build for Transactions while locking a row for modifying
 *
 * @param client {Client}
 * @param user {String}
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function getBalanceOfUserForUpdate(client, user, symbol) {
  const res = await (await client).query(GET_BALANCE_OF_USER_FOR_UPDATE, [symbol, user]);
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
  const res = await (await client).query(GET_BALANCE_OF_USER, [symbol, user]);
  return res.rows;
}

/**
 * View the Amm Interactions of a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewAMMInteractionsOfUser(user) {
  const res = await (await client).query(GET_ALL_AMM_INTERACTIONS_OF_USER, [user]);
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
  const res = await (await client).query(GET_ALL_BALANCE_OF_USER, [user]);
  return res.rows;
}

/**
 * View the balance of a specific token from a user
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewAllBalancesOfUser(user) {
  const res = await (await client).query(GET_ALL_BALANCE_OF_USER, [user]);
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
  const res = await (await client).query(GET_ALL_BALANCE_OF_TOKEN, [symbol]);
  return res.rows;
}

/**
 * View the balance of a specific token
 *
 * @param symbol {String}
 * @returns {Promise<*>}
 */
async function viewAllBalancesOfToken(symbol) {
  const res = await (await client).query(GET_ALL_BALANCE_OF_TOKEN, [symbol]);
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
  const res = await (await client).query(GET_LIMIT_BALANCE_OF_TOKEN, [symbol, limit]);
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
async function updateBalanceOfUser(client, user, symbol, timestamp, amount) {
  const res = await (await client).query(UPDATE_BALANCE_OF_USER, [user, symbol, timestamp, amount]);
  return res.rows;
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
  await (await client).query(INSERT_TOKEN_TRANSACTION, [sender, receiver, amount, symbol, timestamp]);
}

/**
 * Saves a new Casino Trade
 * Meant to be used inside a transaction together with a balance
 *
 * @param client {Client}
 * @param userWalletAddr  {String}
 * @param crashFactor {Number}
 * @param stakedAmount {Number}
 * @param gameId {String}
 */
async function insertCasinoTrade(client, userWalletAddr, crashFactor, stakedAmount, gameId) {
  await (await client).query(INSERT_CASINO_TRADE, [
    userWalletAddr,
    crashFactor,
    stakedAmount,
    CASINO_TRADE_STATE.OPEN,
    gameId
  ]);
}

/**
 * Saves a new Casino Trade at once for simple games
 * Meant to be used inside a transaction together with a balance
 *
 * @param client {Client}
 * @param userWalletAddr  {String}
 * @param crashFactor {Number}
 * @param stakedAmount {Number}
 * @param gameId {String}
 */
async function insertCasinoSingleGameTrade(client, userWalletAddr, crashFactor, stakedAmount, gameId, state, gameHash, riskFactor) {
  await (await client).query(INSERT_CASINO_SINGLE_GAME_TRADE, [
    userWalletAddr,
    crashFactor,
    stakedAmount,
    state,
    gameId,
    gameHash,
    riskFactor
  ]);
}

/**
 * Reverts INSERT_CASINO_TRADE
 * Meant to be used inside a transaction together with a balance
 *
 * @param client {Client}
 * @param tradeId  {String}
 */
async function cancelCasinoTrade(client, tradeId) {
  return await (await client).query(CANCEL_CASINO_TRADE, [
    tradeId
  ]);
}

/**
 * Attempts to cashout user from a casino trade
 *
 * @param {Client} client
 * @param {String} userwalletAddr
 * @param {String} gameHash
 * @returns
 */
async function attemptCashout(client, userwalletAddr, crashFactor, gameHash) {
  return await (await client).query(SET_CASINO_TRADE_STATE, [
    CASINO_TRADE_STATE.WIN,
    crashFactor,
    gameHash,
    CASINO_TRADE_STATE.LOCKED,
    userwalletAddr,
  ]);
}

/**
 * Locks all open trades into specific gameHash
 *
 */
async function lockOpenCasinoTrades(client, gameId, gameHash, crashFactor, gameLengthMS) {
  let res = await (await client).query(INSERT_CASINO_MATCH, [gameId, gameHash, crashFactor, gameLengthMS]);
  let matchId = res.rows[0].id;
  await (await client).query(LOCK_OPEN_CASINO_TRADES, [CASINO_TRADE_STATE.LOCKED, gameHash, matchId, gameId]);
}

/**
 * Sets the outcome of trades locked in a casino game
 *
 * @param client {Client}
 * @param gameHash {String}
 * @param {Number} crashFactor
 */
async function setCasinoTradeOutcomes(client, gameHash, crashFactor) {
  return await (await client).query(SET_CASINO_TRADE_OUTCOMES, [gameHash, crashFactor]);
}

/**
 * Gets casino trades with a certain state from a specific game
 *
 * @param {Client} client
 * @param {String} gameHash
 * @param {CASINO_TRADE_STATE} state
 */
async function getCasinoTrades(client, gameHash, state) {
  const res = await (await client).query(GET_CASINO_TRADES, [gameHash, state]);
  return res.rows;
}

/**
 * Gets casino trades by userId and states
 *
 * @param {String} userId
 * @param {CASINO_TRADE_STATE[]} states
 */
async function getCasinoTradesByUserAndStates(userId, states) {
  const res = await (await client).query(GET_CASINO_TRADES_BY_USER_AND_STATES, [userId, states]);
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
  await (await client).query(INSERT_AMM_INTERACTION, [
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
  const res = await (await client).query(GET_TRANSACTIONS_OF_USER, [user]);
  return res.rows;
}

/**
 * Get all transactions of a user (sender/recipient)
 *
 * @param user {String}
 * @returns {Promise<*>}
 */
async function viewTransactionOfUser(user) {
  const res = await (await client).query(GET_TRANSACTIONS_OF_USER, [user]);
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
  const res = await (await client).query(GET_TRANSACTIONS_OF_USER_AND_TOKEN, [symbol, user]);
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
  const res = await (await client).query(GET_TRANSACTIONS_OF_USER_AND_TOKEN, [symbol, user]);
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
  const res = await (await client).query(GET_USER_INVESTMENT, [user, bet, outcome]);
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

  const res = await (await client).query(`${query};`, values);
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
  const res = await (await client).query(GET_BET_INTERACTIONS_SUMMARY, [bet, direction, endDate]);
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
  const res = await (await client).query(GET_BET_INVESTORS, [bet]);
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
  const res = await (await client).query(GET_BET_INVESTORS, [bet]);
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
  await (await client).query(INSERT_REPORT, [bet_id, reporter, outcome, timestamp]);
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
  await (await client).query(INSERT_REPORT, [bet_id, reporter, outcome, timestamp]);
}

/**
 * view the report of a bet
 *
 * @param bet_id {String}
 * @returns {Promise<*>}
 */
async function viewReport(bet_id) {
  const res = await (await client).query(GET_REPORT, [bet_id]);
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
  const res = await (await client).query(query, params.slice(3));
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
  const res = await (await client).query(GET_LATEST_PRICE_ACTIONS, [betId]);
  return res.rows;
}

/**
 * Get upcoming bets (open bets)
 *
 * @param gameId {String}
 *
 */
async function getUpcomingBets(gameId) {
  if(gameId){
    const res = await (await client).query(GET_OPEN_TRADES_BY_GAME, [gameId])
    return res.rows
  }
  const res = await (await client).query(GET_CASINO_TRADES_BY_STATE(CASINO_TRADE_STATE.OPEN), [CASINO_TRADE_STATE.OPEN])
  return res.rows;
}

/**
 * Get current bets
 *
 * @param gameHash {String}
 *
 */
async function getCurrentBets(gameHash) {
  const res = await (await client).query(GET_CASINO_TRADES_BY_STATE(CASINO_TRADE_STATE.LOCKED, gameHash), [CASINO_TRADE_STATE.LOCKED, gameHash])
  return res.rows;
}

/**
 * Get cashed out (winning) bets
 *
 * @param gameHash {String}
 *
 */
async function getCashedOutBets(gameHash) {
  const res = await (await client).query(GET_CASINO_TRADES_BY_STATE(CASINO_TRADE_STATE.WIN, gameHash), [CASINO_TRADE_STATE.WIN, gameHash])
  return res.rows;
}

/**
 * Get lost bets
 *
 * @param gameHash {String}
 *
 */
async function getLostBets(gameHash) {
  const res = await (await client).query(GET_CASINO_TRADES_BY_STATE(CASINO_TRADE_STATE.LOSS, gameHash), [CASINO_TRADE_STATE.WIN, gameHash])
  return res.rows;
}

/**
 * Set lost trades and crash factor by gameHash
 *
 * @param gameHash {String}
 * @param crashFactor {String}
 *
 */
async function setLostTrades(gameHash, crashFactor) {
  const res = await (await client).query(SET_CASINO_LOST_TRADES_STATE, [gameHash, crashFactor])
  return res.rows;
}

/**
 * Get high bets (highest amount won)
 * PostgreSQL interval https://www.postgresql.org/docs/8.3/functions-datetime.html
 * @param interval {String}
 * @param limit {Number}
 * @param gameId {String}
 *
 */
async function getHighBetsInInterval(interval = 24, limit = 100, gameId) {
  const useQuery = gameId ? GET_HIGH_CASINO_TRADES_BY_PERIOD : GET_HIGH_CASINO_TRADES_BY_PERIOD_ALL_GAMES;
  const useParams = gameId ? [interval, limit, gameId] : [interval, limit];
  const res = await (await client).query(useQuery, useParams)
  return res.rows;
}

/**
 * Get lucky bets (highest crash factor)
 * PostgreSQL interval https://www.postgresql.org/docs/8.3/functions-datetime.html
 * @param interval {String}
 * @param limit {Number}
 * @param gameId {String}
 *
 */
async function getLuckyBetsInInterval(interval = 24, limit = 100, gameId) {
  const useQuery = gameId ? GET_LUCKY_CASINO_TRADES_BY_PERIOD : GET_LUCKY_CASINO_TRADES_BY_PERIOD_ALL_GAMES;
  const useParams = gameId ? [interval, limit, gameId] : [interval, limit];
  const res = await (await client).query(useQuery, useParams)
  return res.rows;
}

/**
 * Get matches
 * PostgreSQL interval
 *
 * @param page {Number}
 * @param perPage {Number}
 * @param gameId {String}
 *
 */
async function getMatches(page = 1, perPage = 10, gameId = process.env.GAME_ID) {
  const res = await (await client).query(GET_CASINO_MATCHES, [gameId, perPage, page])
  return res.rows;
}

/**
 * Get matches
 * PostgreSQL interval
 *
 * @param matchId {Number}
 *
 */
async function getMatchById(matchId) {
  const res = await (await client).query(GET_CASINO_MATCH_BY_ID, [matchId])
  return res.rows[0];
}

/**
 * For game details, get match by game hash, dont allow to get current match to avoid crash factor leak
 * PostgreSQL interval
 *
 * @param gameHash {String}
 *
 */
async function getMatchByGameHash(gameHash) {
  const res = await (await client).query(GET_CASINO_MATCH_BY_GAME_HASH, [gameHash])
  return res.rows;
}


/**
 * get next match based on gameHash
 * PostgreSQL
 *
 * @param gameHash {String}
 * @param gameId {String}
 */
async function getNextMatchByGameHash(gameHash, gameId) {
  const res = await (await client).query(GET_NEXT_CASINO_MATCH_BY_GAME_HASH, [gameHash, gameId])
  return res.rows;
}

/**
 * get prev match based on gameHash
 * PostgreSQL
 *
 * @param gameHash {String}
 * @param gameId {String}
 */
async function getPrevMatchByGameHash(gameHash, gameId) {
  const res = await (await client).query(GET_PREV_CASINO_MATCH_BY_GAME_HASH, [gameHash, gameId])
  return res.rows;
}

/**
 * get matches for update missing values for past games, only when some trades are available by game_id
 * PostgreSQL
 *
 * @param limit {Number}
 *
 */
async function getMatchesForUpdateMissingValues() {
  const res = await (await client).query(GET_CASINO_MATCHES_EXISTING_IN_TRADES, [])
  return res.rows;
}

/**
 * update missing values for past game, per gameHash
 * PostgreSQL
 *
 * @param gameHash {String}
 *
 */
async function updateMatchesMissingValues(gameHash) {
  const res = await (await client).query(UPDATE_CASINO_MATCHES_MISSING_VALUES, [gameHash])
  return res.rows;
}

/**
 * check if user by id played X days in a row (default 6), return [day, total_played] columns, grouped by day
 * PostgreSQL
 *
 * @param userId {String}
 * @param lastDays {Number}
 *
 */
async function getUserPlayedLastXDaysInRow(userId, lastDays = 6) {
  const res = await (await client).query(GET_USER_PLAYED_LAST_X_DAYS_IN_ROW, [userId, lastDays]);
  return res.rows;
}

/**
 * get trades by gameHash and sort them by staked amount
 * PostgreSQL
 *
 * @param userId {String}
 * @param lastDays {Number}
 *
 */
async function getAllTradesByGameHash(gameHash) {
  const res = await (await client).query(GET_ALL_TRADES_BY_GAME_HASH, [gameHash]);
  return res.rows;
}

async function getOpenTrade(userId, gameId) {
  const res = await (await client).query(GET_OPEN_TRADES_BY_USER_AND_GAME, [userId, gameId])
  if (res.rows.length) return res.rows[0];
  throw new Error('Trade not found')
}

/**
 * count casino trades in last x hours, where states are 1, 2, 3, when hours=0 we are showing all time stats
 * PostgreSQL
 *
 * @param lastHours {String}
 *
 */
async function countTradesByLastXHours(lastHours = 24) {
  const useQuery = lastHours === 0 ? COUNT_CASINO_TRADES_BY_ALLTIME : COUNT_CASINO_TRADES_BY_LAST_X_HOURS;
  const useParams = lastHours === 0 ? [] : [lastHours];

  const res = await (await client).query(useQuery, useParams);
  return res.rows;
}

/**
 * get last X trades based on gameId or optional userId
 * PostgreSQL
 *
 * @param gameId {String} - gameTypeId
 * @param limit {String}
 *
 */
async function getLastCasinoTradesByGameType(gameId, userId, limit = 10) {
  let res = null;
  if(userId) {
    res = await (await client).query(GET_LAST_COMPLETED_CASINO_TRADES_BY_GAMETYPE_USERID, [gameId, userId, limit]);
  } else {
    res = await (await client).query(GET_LAST_COMPLETED_CASINO_TRADES_BY_GAMETYPE, [gameId, limit]);
  }
  return res.rows;
}

module.exports = {
  DIRECTION,
  CASINO_TRADE_STATE,
  setupDatabase,
  teardownDatabase,
  getBalanceOfUser,
  getBalanceOfUserForUpdate,
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
  cancelCasinoTrade,
  getMatchById,
  getMatches,
  getLuckyBetsInInterval,
  getHighBetsInInterval,
  getCashedOutBets,
  getCurrentBets,
  getUpcomingBets,
  getMatchByGameHash,
  getMatchesForUpdateMissingValues,
  updateMatchesMissingValues,
  getUserPlayedLastXDaysInRow,
  getAllTradesByGameHash,
  getNextMatchByGameHash,
  getPrevMatchByGameHash,
  setLostTrades,
  getOpenTrade,
  countTradesByLastXHours,
  insertCasinoSingleGameTrade,
  getLastCasinoTradesByGameType
};
