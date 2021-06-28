const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');

const EVNT = new ERC20('EVNT');
const liquidityProviderWallet = 'liquidity_provider';
const liquidityAmount = 100 * EVNT.ONE;
const investAmount = 10 * EVNT.ONE;

jest.setTimeout(1000000);

beforeAll(async () => {
    await teardownDatabase();
    await setupDatabase();
})

beforeEach(async () => {
    await EVNT.mint(liquidityProviderWallet, liquidityAmount);
});

afterAll(async () => {
    // return await teardownDatabase();
});

test('Add Liquidity', async () => {
   const addLiquidityBetId = 'addLiquidity';

   const bet = new Bet(addLiquidityBetId, 3);
   await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

   expect(await EVNT.balanceOf(liquidityProviderWallet)).toBe(0);
   expect(await bet.getOutcomeToken(0).balanceOf(bet.walletId)).toBe(liquidityAmount);
   expect(await bet.getOutcomeToken(1).balanceOf(bet.walletId)).toBe(liquidityAmount);
   expect(await bet.getOutcomeToken(2).balanceOf(bet.walletId)).toBe(liquidityAmount);
});

test('Resolve Bet', async () => {
    const resolveBetId = 'resolveBet';
    const betResolver = 'WallfairBetResolver';
    const resolvedOutcome = 1;

    const bet = new Bet(resolveBetId);
    await bet.resolveBet(betResolver, resolvedOutcome);

    expect(await bet.isResolved()).toBe(true);

    const result = await bet.getResult();
    expect(result['reporter']).toBe(betResolver);
    expect(result['outcome']).toBe(resolvedOutcome);
});

test('Check AMM', async () => {
    const checkAmmBetId = 'checkAmm';

    const bet = new Bet(checkAmmBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    expect(await bet.calcBuy(10 * EVNT.ONE, 0)).toBeLessThan(liquidityAmount);
    expect(await bet.calcBuy(10 * EVNT.ONE, 1)).toBeLessThan(liquidityAmount);
    expect(await bet.calcSell(10 * EVNT.ONE, 0)).toBeLessThan(liquidityAmount);
    expect(await bet.calcSell(10 * EVNT.ONE, 1)).toBeLessThan(liquidityAmount);
});

test('Check AMM Test', async () => {
    const checkAmmBetId = 'checkAmm';

    const bet = new Bet(checkAmmBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const result = await bet.calcSell(5 * EVNT.ONE, 0);
    const result2 = await bet.calcSell(3 * EVNT.ONE, 0);

    expect(await bet.calcSellFromAmount(result, 0)).toBe(5 * EVNT.ONE);
    expect(await bet.calcSellFromAmount(result2, 0)).toBe(3 * EVNT.ONE);
});

test('Buy Outcome Tokens', async () => {
    const buyOutcomeTokensBetId = 'buyOutcomeTokens';
    const investorWalletId = 'buyOutcomeTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
    await bet.buy(investorWalletId, investAmount, 0, 1);

    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10);
});

test('Buy and Sell Outcome Tokens', async () => {
    const buyOutcomeTokensBetId = 'buyAndSellOutcomeTokens';
    const investorWalletId = 'buyAndSellOutcomeTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
    await bet.buy(investorWalletId, investAmount, 0, 1);

    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10);

    const expectedOutcomeTokensToSell = await bet.calcSell(5 * EVNT.ONE, 0);
    await bet.sell(investorWalletId, 5 * EVNT.ONE, 0, expectedOutcomeTokensToSell + 1);

    expect(await EVNT.balanceOf(investorWalletId)).toBeLessThan(expectedOutcomeTokensToSell);
    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBe(expectedOutcomeTokens - expectedOutcomeTokensToSell);
});

test('Buy and Sell from Amount', async () => {
    const buyOutcomeTokensBetId = 'buyAndSellFromAmount';
    const investorWalletId = 'buyAndSellFromAmountTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);
    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
    await bet.buy(investorWalletId, investAmount, 0, 1);

    const expectedOutcomeTokensNo = await bet.calcBuy(investAmount, 1);
    await bet.buy(investorWalletId, investAmount, 1, 1);

    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBe(expectedOutcomeTokens);
    expect(await bet.getOutcomeToken(1).balanceOf(investorWalletId)).toBe(expectedOutcomeTokensNo);

    const expectedReturnAmount = await bet.calcSellFromAmount(expectedOutcomeTokens, 0);
    await bet.sellAmount(investorWalletId, expectedOutcomeTokens, 0, 0);

    expect(await EVNT.balanceOf(investorWalletId)).toBe(expectedReturnAmount);
    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBe(0);
    expect(await bet.getOutcomeToken(1).balanceOf(investorWalletId)).toBe(expectedOutcomeTokensNo);
});
