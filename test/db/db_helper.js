const client = require('@wallfair.io/wallfair-commons').utils.getPostgresConnection();
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
const CREATE_ACCOUNT_NAMESPACE_ENUM = `CREATE TYPE account_namespace_enum AS ENUM('usr', 'eth', 'bet', 'tdl', 'cas')`;
const CREATE_ACCOUNTS =
  `CREATE TABLE IF NOT EXISTS "account" ("owner_account" character varying NOT NULL, "account_namespace" "public"."account_namespace_enum" NOT NULL, "symbol" character varying NOT NULL, "balance" numeric(18,0) NOT NULL, CONSTRAINT "PK_8ec3dedb1ee17a8630a7c57b0f9" PRIMARY KEY ("owner_account", "account_namespace", "symbol"));` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('usr', '615bf607f04fbb15aa5dd367', 'WFAIR', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('usr', '615bfb7df04fbb15aa5dd368', 'WFAIR', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('eth', 'liquidity_provider', 'WFAIR', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('bet', 'testBetId', 'WFAIR', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('bet', 'testBetId', '0_testBetId', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('bet', 'testBetId', '1_testBetId', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('bet', '615bf607f04fbb15aa5dd367', '0_testBetId', 0);` +
  `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ('bet', '615bfb7df04fbb15aa5dd368', '0_testBetId', 0);`;
const CREATE_USER_ACCOUNT =
  `CREATE TABLE "user_account" ("user_id" character varying NOT NULL, "owner_account" character varying NOT NULL, "account_namespace" "public"."account_namespace_enum" NOT NULL, "symbol" character varying NOT NULL, CONSTRAINT "PK_1e7af5387f4169347ddef6e8180" PRIMARY KEY ("user_id"))`
const DELETE_BET_REPORTS =
  'DELETE FROM bet_reports';
const RESET_BALANCES =
  `UPDATE account SET balance = 0 WHERE owner_account IN ('testBetId', '0_testBetId', '615bf607f04fbb15aa5dd367', '615bfb7df04fbb15aa5dd368')`;
const CREATE_ACCOUNT = `INSERT INTO account(account_namespace, owner_account, symbol, balance) VALUES ($1, $2, $3, $4);`

const TEARDOWN_TOKEN_TRANSACTIONS = 'DROP TABLE token_transactions;';
const TEARDOWN_TOKEN_BALANCES = 'DROP TABLE token_balances;';
const TEARDOWN_BET_REPORTS = 'DROP TABLE bet_reports;';
const TEARDOWN_AMM_INTERACTIONS = 'DROP TABLE amm_interactions;';
const TEARDOWN_CASINO_TRADES = 'DROP TABLE casino_trades;';
const TEARDOWN_CASINO_MATCHES = 'DROP TABLE casino_matches';
const TEARDOWN_ACCOUNT_NAMESPACE_ENUM = 'DROP TYPE account_namespace_enum';
const TEARDOWN_ACCOUNT = 'DROP TABLE account';
const TEARDOWN_USER_ACCOUNT = 'DROP TABLE user_account';

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
  await (await client).query(CREATE_ACCOUNT_NAMESPACE_ENUM);
  await (await client).query(CREATE_ACCOUNTS);
  await (await client).query(CREATE_USER_ACCOUNT);
}

async function createAccount(namespace, owner, symbol, balance) {
  await (await client).query(CREATE_ACCOUNT, [namespace, owner, symbol, balance]);
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
  await (await client).query(TEARDOWN_ACCOUNT);
  await (await client).query(TEARDOWN_USER_ACCOUNT);
  await (await client).query(TEARDOWN_ACCOUNT_NAMESPACE_ENUM);
}

async function resetBetState() {
  await (await client).query(DELETE_BET_REPORTS);
  await (await client).query(RESET_BALANCES);
}

module.exports = {
  setupDatabase,
  teardownDatabase,
  resetBetState,
  createAccount
}
