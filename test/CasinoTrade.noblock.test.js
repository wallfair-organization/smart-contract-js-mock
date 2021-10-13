require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Casino = require('../erc20_moc/CasinoTrade.noblock');

const WFAIR = new ERC20('WFAIR');
const casinoWallet = 'CASINO';
const liquidityAmount = 1000000n * WFAIR.ONE;

jest.setTimeout(1000000);

beforeAll(async () => await setupDatabase());

afterAll(async () => await teardownDatabase());

beforeEach(async () => {
  await WFAIR.mint(casinoWallet, liquidityAmount);
});

/**
 * two people will trade, one will lose, one will win
 */
test('Run a game', async () => {
  const casino = new Casino(casinoWallet);

  // mint players with 5000 WFAIR balance
  await WFAIR.mint('player1', 5000n * WFAIR.ONE);
  await WFAIR.mint('player2', 5000n * WFAIR.ONE);

  // eahc player places a trade
  await casino.placeTrade('player1', 2000n * WFAIR.ONE, 15.5); // this trade will lose
  await casino.placeTrade('player2', 2000n * WFAIR.ONE, 2.1); // this trade will win 4200 WFAIR

  // lock the trades
  await casino.lockOpenTrades('gameId');

  // compute winners
  const result = await casino.rewardWinners('gameId', 9.99);
  const winners = result.filter((r) => r.state === 2);

  // run tests
  expect(winners.length).toBe(1); // there should be only one winner
  expect(winners[0].userid).toBe('player2'); // that player should be player2
  expect(winners[0].reward).toBe(4200n * WFAIR.ONE); // and the reward should be 4200 WFAIR
});
