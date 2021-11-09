require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('./db/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');
const Wallet = require('../erc20_moc/Wallet.noblock');

const tokenName = 'WFAIR';
const WFAIR = new ERC20(tokenName);
const tokensToMint = 100n * WFAIR.ONE;

jest.setTimeout(1000000);

beforeAll(async () => await setupDatabase());

afterAll(async () => await teardownDatabase());

test('Get Transactions', async () => {
  const testWallet = 'getTransactionsWallet';

  await WFAIR.mint(testWallet, tokensToMint);
  const wallet = new Wallet(testWallet);
  const trx = await wallet.getTransactions();

  expect(trx.length).toBe(1);
  expect(trx[0].symbol).toBe(tokenName);
  expect(trx[0].sender).toBe('');
  expect(trx[0].receiver).toBe(testWallet);
});

test('Get Transactions of Symbol', async () => {
  const testSymbol = 'TEST';
  const testWallet = 'getTransactionsWalletOfSymbol';

  await WFAIR.mint(testWallet, tokensToMint);
  const wallet = new Wallet(testWallet);
  const trx_WFAIR = await wallet.getTransactionsOfSymbol(tokenName);
  const trx_TEST = await wallet.getTransactionsOfSymbol(testSymbol);

  expect(trx_WFAIR.length).toBe(1);
  expect(trx_TEST.length).toBe(0);
  expect(trx_WFAIR[0].symbol).toBe(tokenName);
  expect(trx_WFAIR[0].sender).toBe('');
  expect(trx_WFAIR[0].receiver).toBe(testWallet);
});

test('Get Balances', async () => {
  const testWallet = 'getBalances';

  await WFAIR.mint(testWallet, tokensToMint);
  const wallet = new Wallet(testWallet);
  const balances = await wallet.allBalances();

  expect(balances.length).toBe(1);
});

test('Get Balance of Wallet', async () => {
  const testSymbol = 'TEST';
  const testWallet = 'getBalanceOfWallet';

  const TEST = new ERC20(testSymbol);

  await TEST.mint(testWallet, tokensToMint);
  await WFAIR.mint(testWallet, tokensToMint);

  const wallet = new Wallet(testWallet);
  const balances = await wallet.allBalances();
  const TEST_balance = await wallet.balanceOf(testSymbol);
  const WFAIR_balance = await wallet.balanceOfWFAIR();

  expect(balances.length).toBe(2);
  expect(TEST_balance).toBe(tokensToMint);
  expect(WFAIR_balance).toBe(tokensToMint);
});

test('Test AMM Interactions', async () => {
  const betId = 'testAMMInteractionsOutcome';
  const testWallet = 'testAMMInteractions';
  const investAmount = 10n * WFAIR.ONE;

  await WFAIR.mint(betId, 100n * WFAIR.ONE);
  await WFAIR.mint(testWallet, investAmount);

  const bet = new Bet(betId);
  await bet.addLiquidity(betId, 100n * WFAIR.ONE);

  await bet.buy(testWallet, investAmount, 0, 1n);

  await bet.sell(
    testWallet,
    5n * WFAIR.ONE,
    0,
    BigInt(Number.MAX_SAFE_INTEGER)
  );
  await bet.sell(
    testWallet,
    2n * WFAIR.ONE,
    0,
    BigInt(Number.MAX_SAFE_INTEGER)
  );

  const wallet = new Wallet(testWallet);

  expect(await wallet.investmentBet(betId, 0)).toBe(28300n);
});
