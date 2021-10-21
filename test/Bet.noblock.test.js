require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');

const WFAIR = new ERC20('WFAIR');
const liquidityProviderWallet = 'liquidity_provider';
const liquidityAmount = 100n * WFAIR.ONE;
const investAmount = 10n * WFAIR.ONE;

jest.setTimeout(1000000);

beforeAll(async () => await setupDatabase());

afterAll(async () => await teardownDatabase());

beforeEach(async () => {
  await WFAIR.mint(liquidityProviderWallet, liquidityAmount);
});

test('Add Liquidity', async () => {
  const testBetId = 'addLiquidity';

  const bet = new Bet(testBetId, 3);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  expect(await WFAIR.balanceOf(liquidityProviderWallet)).toBe(0n);
  expect(await bet.getOutcomeToken(0).balanceOf(bet.walletId)).toBe(
    liquidityAmount
  );
  expect(await bet.getOutcomeToken(1).balanceOf(bet.walletId)).toBe(
    liquidityAmount
  );
  expect(await bet.getOutcomeToken(2).balanceOf(bet.walletId)).toBe(
    liquidityAmount
  );
});

test('Add Liquidity with hint, equal split, 4 outcomes', async () => {
  const testBetId = String(Math.random());
  const liquidityWalletId = String(Math.random());
  const liquidity = 100000n * WFAIR.ONE;

  // this hint is compatible with 25%:25%:25%:25%
  const hint = [25n, 25n, 25n, 25n];

  await WFAIR.mint(liquidityWalletId, liquidity);

  const bet = new Bet(testBetId, 4);
  await bet.addLiquidity(liquidityWalletId, liquidity, hint);

  expect(await WFAIR.balanceOf(liquidityWalletId)).toBe(0n);
  for (let o = 0; o < 4; o += 1) {
    expect(await bet.getOutcomeToken(o).balanceOf(bet.walletId)).toBe(
      liquidity
    );
    // all outcome tokens remain in the market
    expect(await bet.getOutcomeToken(o).balanceOf(liquidityWalletId)).toBe(
      0n
    );
  }
});

function probToHint(hintPercentages) {
  // TODO: this imo should be a part of backend code, not smart contract mock
  // the predicted probability of the outcome N to happen is
  // (number of N outcome tokens in pool) / (sum (all outcome tokens in the pool))
  // in case of binary market p = 1 - price (where price of YES option is NO/(YES+NO))
  // hintPercentages a dictionary {outcome_idx: percentage (BigInt)}
  const total = hintPercentages.reduce((p, c) => p + c, 0n);
  if (total != 100n) {
    // TODO: use other exception class here
    throw new Error(`Percentages must sum to 100, received ${total}`);
  }
  // hints are used as proportions so percentages are as good as any other
  return hintPercentages;
}

test('Add Liquidity with hint, non equal split, 3 outcomes', async () => {
  const testBetId = String(Math.random())
  const liquidityWalletId = String(Math.random());
  // provide huge liquidity so there's almost no slippage
  const liquidity = 224444n * WFAIR.ONE;

  // probabilities are 25%:25%:50%
  const hint = [liquidity / 2n, liquidity / 2n, liquidity];
  // those hints have same effect (same proportions)
  const hintPerc = probToHint([25n, 25n, 50n]);

  await WFAIR.mint(liquidityWalletId, liquidity);

  const bet = new Bet(testBetId, 3);
  // set fee to 0 to not impact the prices
  bet.fee = 0.0
  await bet.addLiquidity(liquidityWalletId, liquidity, hintPerc);

  const pricesRev = {};
  for (let o = 0; o < 3; o += 1) {
    // buy 1 WFAIR
    const expectedOutcomeTokens = await bet.calcBuy(1n * WFAIR.ONE, o);
    // price (denominated in WFAIR) is 1 WFAIR / expectedOutcomeTokens, use reverse
    // because we have only integers
    pricesRev[o] = expectedOutcomeTokens;
    // console.log(`buy ${o} for 1n ${expectedOutcomeTokens} ${1 / Number(expectedOutcomeTokens)}`)
  }
  // prices of o 0 and 1 must be equal
  expect(pricesRev[0]).toEqual(pricesRev[1]);
  // prices of o 2 must be twice lower than o 0 (because it's 2x less probable)
  // so reverse price must be 2x higher than o 0 price
  expect(pricesRev[2] / 2n).toEqual(pricesRev[1]);

  let totalOutcomeAmount = 0n
  for (let o = 0; o < 3; o += 1) {
    let inAMM = await bet.getOutcomeToken(o).balanceOf(bet.walletId);
    expect(inAMM).toBe(hint[o]);
    // rest of the outcome tokens sent back to the liquidity provider
    // (mind that we always mint the `liquidity` amount of outcome tokens - for all outcomes)
    expect(await bet.getOutcomeToken(o).balanceOf(liquidityWalletId)).toBe(
      liquidity - inAMM
    );
    totalOutcomeAmount += inAMM;
  }
  // the option with max hint (50%) fully stays in the market, the other option
  // are minted to `liquidity` and half is sent back to liquidity provider
  expect(totalOutcomeAmount).toEqual(liquidity + 2n * liquidity / 2n);
});

test("Add liquidity, binary market 90%:10%", async () => {
  const testBetId = String(Math.random());
  const liquidityWalletId = String(Math.random());
  // huge liquidity so there's almost no slippage
  const liquidity = 1211231n * WFAIR.ONE;

  // those hints have same effect (same proportions)
  const hint = probToHint([90n, 10n]);

  await WFAIR.mint(liquidityWalletId, liquidity);

  const bet = new Bet(testBetId, 2);
  // set fee to 0 to not impact the prices
  bet.fee = 0;
  await bet.addLiquidity(liquidityWalletId, liquidity, hint);

  const pricesRev = {
    0: await bet.calcBuy(1n * WFAIR.ONE, 0),
    1: await bet.calcBuy(1n * WFAIR.ONE, 1),
  };
  // prices must be like in binary market
  // YES price NO/(YES + NO) = NO/100 so rev 100/NO
  // add 1 to correct for slippage
  expect(pricesRev[0] + 1n).toEqual((100n * WFAIR.ONE / hint[1]))
  // same for NO
  expect(pricesRev[1]).toEqual((100n * WFAIR.ONE / hint[0]))
});

test("Add liqudity in active market should not change prices", async () => {
  const testBetId = String(Math.random())
  const liquidityWalletId = String(Math.random());
  const liquidity = 1444n * WFAIR.ONE;

  // those hints have same effect (same proportions)
  const hintPerc = probToHint([35n, 25n, 40n]);

  await WFAIR.mint(liquidityWalletId, liquidity);

  const bet = new Bet(testBetId, 3);
  bet.fee = 0.0
  await bet.addLiquidity(liquidityWalletId, liquidity, hintPerc);

  let pricesRev = {};
  for (let o = 0; o < 3; o += 1) {
    // buy 1 WFAIR
    const expectedOutcomeTokens = await bet.calcBuy(1n * WFAIR.ONE, o);
    // store prices for comparison
    pricesRev[o] = expectedOutcomeTokens;
  }

  // provide a lot of liquidity, if it's not provided correctly that will disturb the prices
  await WFAIR.mint(liquidityWalletId, 6251n * WFAIR.ONE);
  // hints not allowed for established markets
  // TODO: migrate from jest to chai before it's not too late, use chai-as-promise
  // await expect(bet.addLiquidity(liquidityWalletId, 516251n * WFAIR.ONE, hintPerc)).to.eventually.be.rejectedWith(Error);
  await bet.addLiquidity(liquidityWalletId, 6251n * WFAIR.ONE);
  for (let o = 0; o < 3; o += 1) {
    const expectedOutcomeTokens = await bet.calcBuy(1n * WFAIR.ONE, o);
    // we increased liquidity so there's less slippage so we get more tokens now
    expect(expectedOutcomeTokens).toBeGreaterThan(pricesRev[o]);
    // still difference is insignificant for 1 WFAIR
    expect(pricesRev[o] - expectedOutcomeTokens).toBeLessThan(10n);
  }

  // investors buy and change prices
  const investorWalletId = String(Math.random());
  await WFAIR.mint(investorWalletId, 1000000n * WFAIR.ONE);
  await bet.buy(investorWalletId, 2121n * WFAIR.ONE, 0, 1n);
  await bet.buy(investorWalletId, 1121n * WFAIR.ONE, 1, 1n);
  await bet.buy(investorWalletId, 4611n * WFAIR.ONE, 2, 1n);

  pricesRev = {};
  for (let o = 0; o < 3; o += 1) {
    const expectedOutcomeTokens = await bet.calcBuy(1n * WFAIR.ONE, o);
    // console.log(`buy ${o} for 1n ${expectedOutcomeTokens} old ${pricesRev[o]}`)
    pricesRev[o] = expectedOutcomeTokens;
  }

  // add liquidity again
  await WFAIR.mint(liquidityWalletId, 126251n * WFAIR.ONE);
  await bet.addLiquidity(liquidityWalletId, 126251n * WFAIR.ONE);
  for (let o = 0; o < 3; o += 1) {
    const expectedOutcomeTokens = await bet.calcBuy(1n * WFAIR.ONE, o);
    expect(expectedOutcomeTokens).toBeGreaterThan(pricesRev[o]);
    expect(pricesRev[o] - expectedOutcomeTokens).toBeLessThan(10n);
  }
});


test("Cannot buy all outcome tokens", async () => {
  const testBetId = String(Math.random())
  const liquidityWalletId = String(Math.random());
  const liquidity = 100n * WFAIR.ONE;

  await WFAIR.mint(liquidityWalletId, liquidity);

  const bet = new Bet(testBetId, 3);
  await bet.addLiquidity(liquidityWalletId, liquidity);

  const investorWalletId = String(Math.random());
  await WFAIR.mint(investorWalletId, 1000000n * WFAIR.ONE);
  await bet.buy(investorWalletId, 1000000n * WFAIR.ONE, 0, 1n);

  const pools = await bet.getPoolBalances()
  // at least 1 `wei` of token stays
  expect(pools[`0_${testBetId}`]).toEqual(1n);
});

test('Resolve Bet', async () => {
  const testBetId = 'resolveBet';
  const betResolver = 'WallfairBetResolver';
  const resolvedOutcome = 1;

  const bet = new Bet(testBetId, 2);
  await bet.resolveBet(betResolver, resolvedOutcome);

  expect(await bet.isResolved()).toBe(true);

  const result = await bet.getResult();
  expect(result.reporter).toBe(betResolver);
  expect(result.outcome).toBe(resolvedOutcome);
});

test('Check AMM', async () => {
  const testBetId = 'checkAmm';

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  expect(await bet.calcBuy(10n * WFAIR.ONE, 0)).toBeLessThan(liquidityAmount);
  expect(await bet.calcBuy(10n * WFAIR.ONE, 1)).toBeLessThan(liquidityAmount);
  expect(await bet.calcSell(10n * WFAIR.ONE, 0)).toBeLessThan(liquidityAmount);
  expect(await bet.calcSell(10n * WFAIR.ONE, 1)).toBeLessThan(liquidityAmount);
});

test('Check AMM Sell from Amount', async () => {
  const testBetId = 'checkAmmSellFromAmount';

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  const result = await bet.calcSell(34n * WFAIR.ONE, 0);
  const result2 = await bet.calcSell(3n * WFAIR.ONE, 0);

  // do the reverse operations. and see if we get same value, be aware that exact reverse may be impossible
  expect(await bet.calcSellFromAmount(result, 0)).toBe(34n * WFAIR.ONE);
  expect(await bet.calcSellFromAmount(result2, 0)).toBe(3n * WFAIR.ONE);
});

test('Buy Outcome Tokens', async () => {
  const testBetId = 'buyOutcomeTokens';
  const investorWalletId = 'buyOutcomeTokensInvestor';

  await WFAIR.mint(investorWalletId, investAmount);

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
  await bet.buy(investorWalletId, investAmount, 0, 1n);

  expect(
    await bet.getOutcomeToken(0).balanceOf(investorWalletId)
  ).toBeGreaterThan(expectedOutcomeTokens - 10n);
});

test('Buy Outcome Tokens - custom amounts', async () => {
  const testBetId = 'buyOutcomeTokensCustomAmount';
  const investorWalletId = 'buyOutcomeTokensCustomAmountInvestor';
  const investorMintAmount = 1336568n * WFAIR.ONE;
  const liquidityAmount = 214748n * WFAIR.ONE;
  const customInvestAmount = 299999n * WFAIR.ONE;

  await WFAIR.mint(investorWalletId, investorMintAmount);
  await WFAIR.mint(liquidityProviderWallet, liquidityAmount);

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  const expectedOutcomeTokens = await bet.calcBuy(customInvestAmount, 0);

  await bet.buy(investorWalletId, customInvestAmount, 0, 10000n);

  expect(
    await bet.getOutcomeToken(0).balanceOf(investorWalletId)
  ).toBeGreaterThan(expectedOutcomeTokens - 1000n);
});

test('Buy and Sell Outcome Tokens', async () => {
  const testBetId = 'buyAndSellOutcomeTokens';
  const investorWalletId = 'buyAndSellOutcomeTokensInvestor';

  await WFAIR.mint(investorWalletId, investAmount);

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
  await bet.buy(investorWalletId, investAmount, 0, 1n);

  expect(
    await bet.getOutcomeToken(0).balanceOf(investorWalletId)
  ).toBeGreaterThan(expectedOutcomeTokens - 10n);

  const expectedOutcomeTokensToSell = await bet.calcSell(5n * WFAIR.ONE, 0);
  await bet.sell(
    investorWalletId,
    5n * WFAIR.ONE,
    0,
    expectedOutcomeTokensToSell + 1n
  );

  expect(await WFAIR.balanceOf(investorWalletId)).toBeLessThan(
    expectedOutcomeTokensToSell
  );
  expect(await bet.getOutcomeToken(0).balanceOf(investorWalletId)).toBe(
    expectedOutcomeTokens - expectedOutcomeTokensToSell
  );
});

test('Buy and Sell Returns', async () => {
  const testBetId = 'buyAndSellReturns';
  const investorWalletId = 'buyAndSellReturnsInvestor';

  await WFAIR.mint(investorWalletId, investAmount);

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  const expectedOutcomeTokens = await bet.calcBuy(investAmount, 0);
  const resultBuy = await bet.buy(investorWalletId, investAmount, 0, 1n);
  const newBalanceAfterBuy = await bet
    .getOutcomeToken(0)
    .balanceOf(investorWalletId);

  expect(newBalanceAfterBuy).toBeGreaterThan(expectedOutcomeTokens - 10n);
  expect(resultBuy[bet.getOutcomeToken(0).symbol]).toBe(newBalanceAfterBuy);
  expect(resultBuy.boughtOutcomeTokens).toBe(expectedOutcomeTokens);
  expect(resultBuy.spendTokens).toBe(investAmount);
  expect(resultBuy.isInvested).toBeTruthy();

  const expectedReturnAmount = await bet.calcSellFromAmount(
    newBalanceAfterBuy,
    0
  );
  const resultSell = await bet.sellAmount(
    investorWalletId,
    newBalanceAfterBuy,
    0,
    0n
  );
  const newBalanceAfterSell = await bet
    .getOutcomeToken(0)
    .balanceOf(investorWalletId);

  expect(await WFAIR.balanceOf(investorWalletId)).toBe(expectedReturnAmount);
  expect(newBalanceAfterSell).toBe(0n);
  expect(resultSell[bet.getOutcomeToken(0).symbol]).toBe(newBalanceAfterSell);
  expect(resultSell.soldOutcomeTokens).toBe(expectedOutcomeTokens);
  expect(resultSell.earnedTokens).toBe(expectedReturnAmount);
  expect(resultSell.isInvested).toBeFalsy();
});

test('Buy and Sell from Amount', async () => {
  const testBetId = 'buyAndSellFromAmount';
  const investorWalletId = 'buyAndSellFromAmountTokensInvestor';
  const outcomeIndex1 = 0;
  const outcomeIndex2 = 1;

  await WFAIR.mint(investorWalletId, investAmount);
  await WFAIR.mint(investorWalletId, investAmount);

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  const expectedOutcomeTokens = await bet.calcBuy(investAmount, outcomeIndex1);
  await bet.buy(investorWalletId, investAmount, outcomeIndex1, 1n);

  const expectedOutcomeTokensNo = await bet.calcBuy(
    investAmount,
    outcomeIndex2
  );
  await bet.buy(investorWalletId, investAmount, outcomeIndex2, 1n);

  expect(
    await bet.getOutcomeToken(outcomeIndex1).balanceOf(investorWalletId)
  ).toBe(expectedOutcomeTokens);
  expect(
    await bet.getOutcomeToken(outcomeIndex2).balanceOf(investorWalletId)
  ).toBe(expectedOutcomeTokensNo);

  const expectedReturnAmount = await bet.calcSellFromAmount(
    expectedOutcomeTokens,
    0
  );
  await bet.sellAmount(investorWalletId, expectedOutcomeTokens, 0, 0n);

  expect(await WFAIR.balanceOf(investorWalletId)).toBe(expectedReturnAmount);
  expect(
    await bet.getOutcomeToken(outcomeIndex1).balanceOf(investorWalletId)
  ).toBe(0n);
  expect(
    await bet.getOutcomeToken(outcomeIndex2).balanceOf(investorWalletId)
  ).toBe(expectedOutcomeTokensNo);
});

test('Test Payout', async () => {
  const testBetId = 'testPayout';
  const singlePayoutWallet = 'singlePayoutWallet';
  const outcomeIndex = 0;

  const bet = new Bet(testBetId, 1);

  await WFAIR.mint(bet.walletId, investAmount);
  await bet
    .getOutcomeToken(outcomeIndex)
    .mint(singlePayoutWallet, investAmount);

  await bet.resolveBet('testPayout', outcomeIndex);
  await bet.getPayout(singlePayoutWallet);

  expect(await WFAIR.balanceOf(singlePayoutWallet)).toBe(investAmount);
});

test('Test batched Payout', async () => {
  const testBetId = 'testBatchedPayout';
  const investorWalletId1 = 'batchedPayoutWallet1';
  const investorWalletId2 = 'batchedPayoutWallet2';
  const outcomeIndex = 0;

  const bet = new Bet(testBetId, 1);

  await WFAIR.mint(bet.walletId, 2n * investAmount);
  await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId1, investAmount);
  await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId2, investAmount);

  await bet.resolveBet('testBatchedPayout', outcomeIndex);
  await bet.getBatchedPayout([investorWalletId1, investorWalletId2]);

  expect(await WFAIR.balanceOf(investorWalletId1)).toBe(investAmount);
  expect(await WFAIR.balanceOf(investorWalletId2)).toBe(investAmount);
});

test('Test resolve and batched Payout', async () => {
  const testBetId = 'testResolveAndBatchedPayout';
  const investorWalletId1 = 'resolveAndBatchedPayoutWallet1';
  const investorWalletId2 = 'resolveAndBatchedPayoutWallet2';
  const outcomeIndex = 0;

  const bet = new Bet(testBetId, 1);

  await WFAIR.mint(bet.walletId, 2n * investAmount);
  await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId1, investAmount);
  await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId2, investAmount);

  await bet.resolveAndPayout('testBatchedPayout', outcomeIndex);

  expect(await WFAIR.balanceOf(investorWalletId1)).toBe(investAmount);
  expect(await WFAIR.balanceOf(investorWalletId2)).toBe(investAmount);
});

test('Test Refund Bet', async () => {
  const testBetId = 'testRefundBet';
  const investorWalletId1 = 'testRefundWallet1';
  const investorWalletId2 = 'testRefundWallet2';
  const investorWalletId3 = 'testRefundWallet3';
  const outcomeIndex = 0;

  await WFAIR.mint(investorWalletId1, investAmount);
  await WFAIR.mint(investorWalletId2, investAmount);
  await WFAIR.mint(investorWalletId3, investAmount);

  const bet = new Bet(testBetId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  await bet.buy(investorWalletId1, investAmount, outcomeIndex, 1n);

  expect(await WFAIR.balanceOf(investorWalletId1)).toBe(0n);
  expect(
    await bet.getOutcomeToken(outcomeIndex).balanceOf(investorWalletId1)
  ).toBeGreaterThan(0n);

  await bet.buy(investorWalletId2, investAmount, outcomeIndex, 1n);
  await bet.sell(
    investorWalletId2,
    investAmount / 2n,
    outcomeIndex,
    investAmount
  );

  expect(await WFAIR.balanceOf(investorWalletId2)).toBe(investAmount / 2n);
  expect(
    await bet.getOutcomeToken(outcomeIndex).balanceOf(investorWalletId2)
  ).toBeGreaterThan(0n);

  await bet.getOutcomeToken(outcomeIndex).mint(investorWalletId3, investAmount);
  await bet.buy(investorWalletId3, investAmount, outcomeIndex, 1n);
  await bet.sell(
    investorWalletId3,
    investAmount + bet.ONE,
    outcomeIndex,
    investAmount * 2n
  );

  expect(await WFAIR.balanceOf(investorWalletId3)).toBe(investAmount + bet.ONE);
  expect(
    await bet.getOutcomeToken(outcomeIndex).balanceOf(investorWalletId3)
  ).toBeGreaterThan(0n);

  await bet.refund();

  expect(await WFAIR.balanceOf(investorWalletId1)).toBe(investAmount);
  expect(await WFAIR.balanceOf(investorWalletId2)).toBe(investAmount);
  expect(await WFAIR.balanceOf(investorWalletId3)).toBe(investAmount + bet.ONE);
});

async function prepareAMMInteractions(betId, wallet) {
  await WFAIR.mint(wallet, investAmount * 2n);

  const bet = new Bet(betId, 2);
  await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

  await bet.buy(wallet, investAmount, 0, 1n);
  await bet.buy(wallet, investAmount / 2n, 1, 1n);
  await bet.sell(wallet, investAmount / 2n, 0, investAmount);

  await bet.resolveBet('testPayout', 0);
  await bet.getPayout(wallet);

  return bet;
}

test('Get User AMM Aggregated Interactions', async () => {
  const testBetId = 'getAmmInteractionsBet';
  const investorWalletId1 = 'wallet1';
  const bet = await prepareAMMInteractions(testBetId, investorWalletId1);

  const ammInteractions = await bet.getUserAmmInteractions();
  expect(ammInteractions.length).toEqual(3);

  expectInteraction = (f) =>
    expect(ammInteractions).toEqual(
      expect.arrayContaining([expect.objectContaining(f)])
    );

  // we expect to have BUY, SELL & PAYOUT interaction
  expectInteraction({ buyer: investorWalletId1, direction: 'BUY' });
  expectInteraction({ buyer: investorWalletId1, direction: 'SELL' });
  expectInteraction({ buyer: investorWalletId1, direction: 'PAYOUT' });
});

test('Get All AMM Interactions', async () => {
  const testBetId = 'getBetInteractions';
  const investorWalletId1 = 'wallet1';
  const bet = await prepareAMMInteractions(testBetId, investorWalletId1);

  const ammInteractions = await bet.getBetInteractions();
  expect(ammInteractions.length).toEqual(4);

  expectInteraction = (f) =>
    expect(ammInteractions).toEqual(
      expect.arrayContaining([expect.objectContaining(f)])
    );

  // we expect to have BUY, SELL & PAYOUT interaction
  expectInteraction({
    buyer: investorWalletId1,
    direction: 'BUY',
    outcome: 0,
    investmentamount: '100000',
  });
  expectInteraction({
    buyer: investorWalletId1,
    direction: 'BUY',
    outcome: 1,
    investmentamount: '50000',
  });
  expectInteraction({ buyer: investorWalletId1, direction: 'SELL' });
  expectInteraction({ buyer: investorWalletId1, direction: 'PAYOUT' });
});

test('Get AMM Interactions for specific direction and with start date', async () => {
  const testBetId = 'getBetInteractionsSpecificDirection';
  const investorWalletId1 = 'wallet1';
  const direction = 'BUY';
  const startDate = new Date('2021-01-01');
  const bet = await prepareAMMInteractions(testBetId, investorWalletId1);

  const ammInteractions = await bet.getBetInteractions(startDate, direction);
  expect(ammInteractions.length).toEqual(2);

  expectInteraction = (f) =>
    expect(ammInteractions).toEqual(
      expect.arrayContaining([expect.objectContaining(f)])
    );

  // we expect to receive BUY interactions only
  expectInteraction({
    buyer: investorWalletId1,
    direction: 'BUY',
    outcome: 0,
    investmentamount: '100000',
  });
  expectInteraction({
    buyer: investorWalletId1,
    direction: 'BUY',
    outcome: 1,
    investmentamount: '50000',
  });
});

test('Get AMM Interactions summary for specific direction and end date', async () => {
  const testBetId = 'getBetInteractionsSummartSpecificDirection';
  const investorWalletId1 = 'wallet1';
  const direction = 'BUY';
  const endDate = new Date('2021-12-12');
  const bet = await prepareAMMInteractions(testBetId, investorWalletId1);

  const ammInteractions = await bet.getBetInteractionsSummary(
    direction,
    endDate
  );
  expect(ammInteractions.length).toEqual(2);

  expectInteraction = (f) =>
    expect(ammInteractions).toEqual(
      expect.arrayContaining([expect.objectContaining(f)])
    );

  // we expect to receive BUY interactions only, with aggregated amount per outcome
  expectInteraction({ amount: '100000', outcome: 0 });
  expectInteraction({ amount: '50000', outcome: 1 });
});

test('Test Weird Jonas Case', async () => {
  const testBetId = 'JonasBet';

  const bet = new Bet(testBetId, 2);

  await bet.getOutcomeToken(0).mint(bet.walletId, 2146490114n);
  await bet.getOutcomeToken(1).mint(bet.walletId, 2147480000n);

  expect(await bet.calcSellFromAmount(989886n, 0)).toBe(490100n);
});
