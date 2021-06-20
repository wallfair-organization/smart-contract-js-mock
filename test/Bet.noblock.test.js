const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');

const EVNT = new ERC20('EVNT');
const liquidityProviderWallet = 'liquidity_provider';
const liquidityAmount = 100 * EVNT.ONE;
const investAmount = 10 * EVNT.ONE;

jest.setTimeout(1000000);

beforeAll(async () => {
    await setupDatabase();
})

beforeEach(async () => {
    await EVNT.mint(liquidityProviderWallet, liquidityAmount);
});

afterAll(async () => {
    return await teardownDatabase();
});

test('Add Liquidity', async () => {
   const addLiquidityBetId = 'addLiquidity';

   const bet = new Bet(addLiquidityBetId);
   await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

   expect(await EVNT.balanceOf(liquidityProviderWallet)).toBe(0);
   expect(await bet.yesToken.balanceOf(bet.walletId)).toBe(liquidityAmount);
   expect(await bet.noToken.balanceOf(bet.walletId)).toBe(liquidityAmount);
});

test('Resolve Bet', async () => {
    const resolveBetId = 'resolveBet';
    const betResolver = 'WallfairBetResolver';
    const resolvedOutcome = "yes";

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

    expect(await bet.calcBuy(10 * EVNT.ONE, "yes")).toBeLessThan(liquidityAmount);
    expect(await bet.calcBuy(10 * EVNT.ONE, "no")).toBeLessThan(liquidityAmount);
    expect(await bet.calcSell(10 * EVNT.ONE, "yes")).toBeLessThan(liquidityAmount);
    expect(await bet.calcSell(10 * EVNT.ONE, "no")).toBeLessThan(liquidityAmount);
});

test('Check AMM Test', async () => {
    const checkAmmBetId = 'checkAmm';

    const bet = new Bet(checkAmmBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const result = await bet.calcSell(5 * EVNT.ONE, "yes");

    expect(await bet.calcSellFromAmount(result, "yes")).toBeLessThanOrEqual(5 * EVNT.ONE);
});

test('Buy Outcome Tokens', async () => {
    const buyOutcomeTokensBetId = 'buyOutcomeTokens';
    const investorWalletId = 'buyOutcomeTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, "yes");
    await bet.buy(investorWalletId, investAmount, "yes", 1);

    expect(await bet.yesToken.balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10);
});

test('Buy and Sell Outcome Tokens', async () => {
    const buyOutcomeTokensBetId = 'buyAndSellOutcomeTokens';
    const investorWalletId = 'buyAndSellOutcomeTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, "yes");
    await bet.buy(investorWalletId, investAmount, "yes", 1);

    expect(await bet.yesToken.balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10);

    const expectedOutcomeTokensToSell = await bet.calcSell(5 * EVNT.ONE, "yes");
    await bet.sell(investorWalletId, 5 * EVNT.ONE, "yes", expectedOutcomeTokensToSell + 1);

    expect(await EVNT.balanceOf(investorWalletId)).toBeLessThan(expectedOutcomeTokensToSell);
    expect(await bet.yesToken.balanceOf(investorWalletId)).toBe(expectedOutcomeTokens - expectedOutcomeTokensToSell);
});

test('Buy and Sell from Amount', async () => {
    const buyOutcomeTokensBetId = 'buyAndSellFromAmount';
    const investorWalletId = 'buyAndSellFromAmountTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);
    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, "yes");
    await bet.buy(investorWalletId, investAmount, "yes", 1);

    const expectedOutcomeTokensNo = await bet.calcBuy(investAmount, "no");
    await bet.buy(investorWalletId, investAmount, "no", 1);

    expect(await bet.yesToken.balanceOf(investorWalletId)).toBe(expectedOutcomeTokens);
    expect(await bet.noToken.balanceOf(investorWalletId)).toBe(expectedOutcomeTokensNo);

    const expectedReturnAmount = await bet.calcSellFromAmount(expectedOutcomeTokens, "yes");
    await bet.sellAmount(investorWalletId, expectedOutcomeTokens, "yes", 0);

    expect(await EVNT.balanceOf(investorWalletId)).toBe(expectedReturnAmount);
    expect(await bet.yesToken.balanceOf(investorWalletId)).toBe(0);
    expect(await bet.noToken.balanceOf(investorWalletId)).toBe(expectedOutcomeTokensNo);
});
