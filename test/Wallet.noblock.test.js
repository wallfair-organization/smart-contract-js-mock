const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');
const Wallet = require('../erc20_moc/Wallet.noblock');

const tokenName = 'EVNT';
const EVNT = new ERC20(tokenName);
const tokensToMint = 100n * EVNT.ONE;

jest.setTimeout(1000000);

beforeAll(async () => {
    return await setupDatabase();
});

afterAll(async () => {
    return await teardownDatabase();
});

test('Get Transactions', async () => {
    const testWallet = 'getTransactionsWallet';

    await EVNT.mint(testWallet, tokensToMint);
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

    await EVNT.mint(testWallet, tokensToMint);
    const wallet = new Wallet(testWallet);
    const trx_EVNT = await wallet.getTransactionsOfSymbol(tokenName);
    const trx_TEST = await wallet.getTransactionsOfSymbol(testSymbol);

    expect(trx_EVNT.length).toBe(1);
    expect(trx_TEST.length).toBe(0);
    expect(trx_EVNT[0].symbol).toBe(tokenName);
    expect(trx_EVNT[0].sender).toBe('');
    expect(trx_EVNT[0].receiver).toBe(testWallet);
});

test('Get Balances', async () => {
    const testWallet = 'getBalances';

    await EVNT.mint(testWallet, tokensToMint);
    const wallet = new Wallet(testWallet);
    const balances = await wallet.allBalances();

    expect(balances.length).toBe(1);
});

test('Get Balance of Wallet', async () => {
    const testSymbol = 'TEST';
    const testWallet = 'getBalanceOfWallet';

    const TEST = new ERC20(testSymbol);

    await TEST.mint(testWallet, tokensToMint);
    await EVNT.mint(testWallet, tokensToMint);

    const wallet = new Wallet(testWallet);
    const balances = await wallet.allBalances();
    const TEST_balance = await wallet.balanceOf(testSymbol);
    const EVNT_balance = await wallet.balanceOfEVNT();

    expect(balances.length).toBe(2);
    expect(TEST_balance).toBe(tokensToMint);
    expect(EVNT_balance).toBe(tokensToMint);
});


test('Test AMM Interactions', async () => {
    const betId = 'testAMMInteractionsOutcome';
    const testWallet = 'testAMMInteractions';
    const investAmount = 10n * EVNT.ONE;

    await EVNT.mint(betId, 100n * EVNT.ONE);
    await EVNT.mint(testWallet, investAmount);

    const bet = new Bet(betId);
    await bet.addLiquidity(betId, 100n * EVNT.ONE);

    await bet.buy(testWallet, investAmount, 0, 1n);

    await bet.sell(testWallet, 5n * EVNT.ONE, 0, BigInt(Number.MAX_SAFE_INTEGER));
    await bet.sell(testWallet, 2n * EVNT.ONE, 0, BigInt(Number.MAX_SAFE_INTEGER));

    const wallet = new Wallet(testWallet);

    expect(await wallet.investmentBet(betId, 0)).toBe(28300n)
});
