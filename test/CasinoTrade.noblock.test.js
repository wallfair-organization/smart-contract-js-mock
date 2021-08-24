require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Casino = require('../erc20_moc/CasinoTrade.noblock');
const { TestWatcher } = require('@jest/core');

const EVNT = new ERC20('EVNT');
const casinoWallet = 'CASINO';
const liquidityAmount = 1000000n * EVNT.ONE;

jest.setTimeout(1000000);

beforeAll(async () => {
    return await setupDatabase();
});

afterAll(async () => {
    return await teardownDatabase();
});

beforeEach(async () => {
    await EVNT.mint(casinoWallet, liquidityAmount);
});

/**
 * two people will trade, one will lose, one will win
 */
test('Run a game', async () => {
    const casino = new Casino(casinoWallet);

    // mint players with 5000 EVNT balance
    await EVNT.mint("player1", 5000n * EVNT.ONE);
    await EVNT.mint("player2", 5000n * EVNT.ONE);

    // eahc player places a trade
    await casino.placeTrade("player1", 2000n * EVNT.ONE, 15.50); // this trade will lose
    await casino.placeTrade("player2", 2000n * EVNT.ONE, 2.10); // this trade will win 4200 EVNT

    // lock the trades
    await casino.lockOpenTrades("gameId");

    // compute winners
    let winners = await casino.rewardWinners("gameId", 9.99);

    // run tests
    expect(winners.length).toBe(1); // there should be only one winner
    expect(winners[0].userid).toBe("player2"); // that player should be player2
    expect(winners[0].reward).toBe(4200n * EVNT.ONE); // and the reward should be 4200 EVNT
});