const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Bet = require('../erc20_moc/Bet.noblock');

const EVNT = new ERC20('EVNT');
const liquidityProviderWallet = 'liquidity_provider';
const initialLiquidityProviderBalance = 1000 * EVNT.ONE;

jest.setTimeout(10000);

beforeEach(async () => {
    await setupDatabase();

    await EVNT.mint(liquidityProviderWallet, initialLiquidityProviderBalance);
});

afterEach(async () => {
    return await teardownDatabase();
});

test('Add Liquidity', async () => {
   const addLiquidityBetId = 'addLiquidity';
   const liquidityAmount = 1000;

   const bet = new Bet(addLiquidityBetId);
   await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

   expect(await EVNT.balanceOf(liquidityProviderWallet)).toBe(initialLiquidityProviderBalance - liquidityAmount);
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
    const liquidityAmount = 100 * EVNT.ONE;

    const bet = new Bet(checkAmmBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    expect(await bet.calcBuy(10 * EVNT.ONE, "yes")).toBeLessThan(liquidityAmount);
    expect(await bet.calcBuy(10 * EVNT.ONE, "no")).toBeLessThan(liquidityAmount);
});

test('Buy Outcome Tokens', async () => {
    const buyOutcomeTokensBetId = 'buyOutcomeTokens';
    const investorWalletId = 'buyOutcomeTokensInvestor';
    const liquidityAmount = 100 * EVNT.ONE;
    const investAmount = 10 * EVNT.ONE;

    await EVNT.mint(investorWalletId, investAmount);

    const bet = new Bet(buyOutcomeTokensBetId);
    await bet.addLiquidity(liquidityProviderWallet, liquidityAmount);

    const expectedOutcomeTokens = await bet.calcBuy(investAmount, "yes");
    await bet.buy(investorWalletId, investAmount, "yes", 1);

    expect(await bet.yesToken.balanceOf(investorWalletId)).toBeGreaterThan(expectedOutcomeTokens - 10);
});
