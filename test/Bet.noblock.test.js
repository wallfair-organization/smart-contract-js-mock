const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');

const EVNT = new ERC20('EVNT');
const liquidityProviderWallet = 'liquidity_provider';
const liquidityAmount = 100n * EVNT.ONE;
const investAmount = 10n * EVNT.ONE;

jest.setTimeout(1000000);

beforeAll(async () => {
    return await setupDatabase();
});

afterAll(async () => {
    return await teardownDatabase();
});

beforeEach(async () => {
    await EVNT.mint(liquidityProviderWallet, liquidityAmount);
});

test('Add Liquidity', async () => {
   const testBetId = 'addLiquidity';

   const bet = new Bet(testBetId, 3);
   await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

   expect(await EVNT.balanceOf(liquidityProviderWallet)).toBe(0n);
   expect(await bet.getOutcomeToken(0).balanceOf(bet.walletId)).toBe(liquidityAmount);
   expect(await bet.getOutcomeToken(1).balanceOf(bet.walletId)).toBe(liquidityAmount);
   expect(await bet.getOutcomeToken(2).balanceOf(bet.walletId)).toBe(liquidityAmount);
});

test('Resolve Bet', async () => {
    const testBetId = 'resolveBet';
    const betResolver = 'WallfairBetResolver';
    const resolvedOutcome = 1;

    const bet = new Bet(testBetId, 2);
    await bet.resolveBet(betResolver, resolvedOutcome);

    expect(await bet.isResolved()).toBe(true);

    const result = await bet.getResult();
    expect(result['reporter']).toBe(betResolver);
    expect(result['outcome']).toBe(resolvedOutcome);
});

test('Check AMM', async () => {
    const testBetId = 'checkAmm';

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    expect(await bet.calcBuy(10n * EVNT.ONE, 0)).toBeLessThan(liquidityAmount);
    expect(await bet.calcBuy(10n * EVNT.ONE, 1)).toBeLessThan(liquidityAmount);
    expect(await bet.calcSell(10n * EVNT.ONE, 0)).toBeLessThan(liquidityAmount);
    expect(await bet.calcSell(10n * EVNT.ONE, 1)).toBeLessThan(liquidityAmount);
});

test('Check AMM Sell from Amount', async () => {
    const testBetId = 'checkAmmSellFromAmount';

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const result = await bet.calcSell(5n * EVNT.ONE, 0);
    const result2 = await bet.calcSell(3n * EVNT.ONE, 0);

    expect(await bet.calcSellFromAmount(result, 0)).toBe(5n * EVNT.ONE);
    expect(await bet.calcSellFromAmount(result2, 0)).toBe(3n * EVNT.ONE);
});

test('Buy Outcome Tokens', async () => {
    const testBetId = 'buyOutcomeTokens';
    const investorWalletId = 'buyOutcomeTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
    await bet.buy(investorWalletId, investAmount, 0, 1n);

    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10n);
});

test('Buy and Sell Outcome Tokens', async () => {
    const testBetId = 'buyAndSellOutcomeTokens';
    const investorWalletId = 'buyAndSellOutcomeTokensInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
    await bet.buy(investorWalletId, investAmount, 0, 1n);

    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10n);

    const expectedOutcomeTokensToSell = await bet.calcSell(5n * EVNT.ONE, 0);
    await bet.sell(investorWalletId, 5n * EVNT.ONE, 0, expectedOutcomeTokensToSell + 1n);

    expect(await EVNT.balanceOf(investorWalletId)).toBeLessThan(expectedOutcomeTokensToSell);
    expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBe(expectedOutcomeTokens - expectedOutcomeTokensToSell);
});

test('Buy and Sell Returns', async () => {
    const testBetId = 'buyAndSellReturns';
    const investorWalletId = 'buyAndSellReturnsInvestor';

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
    const resultBuy = await bet.buy(investorWalletId, investAmount, 0, 1n);
    const newBalanceAfterBuy = await bet.getOutcomeToken(0).balanceOf(investorWalletId)

    expect(newBalanceAfterBuy).toBeGreaterThan(expectedOutcomeTokens - 10n);
    expect(resultBuy[bet.getOutcomeToken(0).symbol]).toBe(newBalanceAfterBuy);
    expect(resultBuy['boughtOutcomeTokens']).toBe(expectedOutcomeTokens);
    expect(resultBuy['spendTokens']).toBe(investAmount);
    expect(resultBuy['isInvested']).toBeTruthy();

    const expectedReturnAmount = await bet.calcSellFromAmount(newBalanceAfterBuy, 0);
    const resultSell = await bet.sellAmount(investorWalletId, newBalanceAfterBuy, 0, 0n);
    const newBalanceAfterSell = await bet.getOutcomeToken(0).balanceOf(investorWalletId);

    expect(await EVNT.balanceOf(investorWalletId)).toBe(expectedReturnAmount);
    expect(newBalanceAfterSell).toBe(0n);
    expect(resultSell[bet.getOutcomeToken(0).symbol]).toBe(newBalanceAfterSell);
    expect(resultSell['soldOutcomeTokens']).toBe(expectedOutcomeTokens);
    expect(resultSell['earnedTokens']).toBe(expectedReturnAmount);
    expect(resultSell['isInvested']).toBeFalsy();
});

test('Buy and Sell from Amount', async () => {
    const testBetId = 'buyAndSellFromAmount';
    const investorWalletId = 'buyAndSellFromAmountTokensInvestor';
    const outcomeIndex1 = 0;
    const outcomeIndex2 = 1;

    await EVNT.mint(investorWalletId, investAmount);
    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, outcomeIndex1);
    await bet.buy(investorWalletId, investAmount, outcomeIndex1, 1n);

    const expectedOutcomeTokensNo = await bet.calcBuy(investAmount, outcomeIndex2);
    await bet.buy(investorWalletId, investAmount, outcomeIndex2, 1n);

    expect(await bet.getOutcomeToken(outcomeIndex1).balanceOf(investorWalletId)).toBe(expectedOutcomeTokens);
    expect(await bet.getOutcomeToken(outcomeIndex2).balanceOf(investorWalletId)).toBe(expectedOutcomeTokensNo);

    const expectedReturnAmount = await bet.calcSellFromAmount(expectedOutcomeTokens, 0);
    await bet.sellAmount(investorWalletId, expectedOutcomeTokens, 0, 0n);

    expect(await EVNT.balanceOf(investorWalletId)).toBe(expectedReturnAmount);
    expect(await bet.getOutcomeToken(outcomeIndex1).balanceOf(investorWalletId)).toBe(0n);
    expect(await bet.getOutcomeToken(outcomeIndex2).balanceOf(investorWalletId)).toBe(expectedOutcomeTokensNo);
});

test('Test Payout', async () => {
    const testBetId = 'testPayout';
    const singlePayoutWallet = 'singlePayoutWallet';
    const outcomeIndex = 0;

    const bet = new Bet(testBetId, 1);

    await EVNT.mint(bet.walletId, investAmount);
    await bet.getOutcomeToken(outcomeIndex).mint(singlePayoutWallet, investAmount);

    await bet.resolveBet('testPayout', outcomeIndex);
    await bet.getPayout(singlePayoutWallet);

    expect(await EVNT.balanceOf(singlePayoutWallet)).toBe(investAmount);
});

test('Test batched Payout', async () => {
    const testBetId = 'testBatchedPayout';
    const investorWalletId1 = 'batchedPayoutWallet1';
    const investorWalletId2 = 'batchedPayoutWallet2';
    const outcomeIndex = 0;

    const bet = new Bet(testBetId, 1);

    await EVNT.mint(bet.walletId, 2n * investAmount);
    await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId1, investAmount);
    await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId2, investAmount);

    await bet.resolveBet('testBatchedPayout', outcomeIndex);
    await bet.getBatchedPayout([investorWalletId1, investorWalletId2]);

    expect(await EVNT.balanceOf(investorWalletId1)).toBe(investAmount);
    expect(await EVNT.balanceOf(investorWalletId2)).toBe(investAmount);
});

test('Test resolve and batched Payout', async () => {
    const testBetId = 'testResolveAndBatchedPayout';
    const investorWalletId1 = 'resolveAndBatchedPayoutWallet1';
    const investorWalletId2 = 'resolveAndBatchedPayoutWallet2';
    const outcomeIndex = 0;

    const bet = new Bet(testBetId, 1);

    await EVNT.mint(bet.walletId, 2n * investAmount);
    await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId1, investAmount);
    await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId2, investAmount);

    await bet.resolveAndPayout('testBatchedPayout', outcomeIndex);

    expect(await EVNT.balanceOf(investorWalletId1)).toBe(investAmount);
    expect(await EVNT.balanceOf(investorWalletId2)).toBe(investAmount);
});

test('Test Refund Bet', async () => {
    const testBetId = 'testRefundBet';
    const investorWalletId = 'testRefundWallet';
    const outcomeIndex = 0;

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(testBetId, 2);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    await bet.buy(investorWalletId, investAmount, outcomeIndex, 1n);

    expect(await EVNT.balanceOf(investorWalletId)).toBe(0n);
    expect(await bet.getOutcomeToken(outcomeIndex).balanceOf(investorWalletId)).toBeGreaterThan(0n);

    await bet.refund();

    expect(await EVNT.balanceOf(investorWalletId)).toBe(investAmount);
    expect(await bet.getOutcomeToken(outcomeIndex).balanceOf(investorWalletId)).toBe(0n);
});
