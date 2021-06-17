const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Wallet = require('../erc20_moc/Wallet.noblock');

const tokenName = 'EVNT';
const EVNT = new ERC20(tokenName);
const tokensToMint = 100 * EVNT.ONE;

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
