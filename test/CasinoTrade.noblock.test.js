require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Casino = require('../erc20_moc/CasinoTrade.noblock');

const WFAIR = new ERC20('WFAIR');
const casinoWallet = 'CASINO';
const BASE_WALLET = 'playerWallet';
const liquidityAmount = 1000000n * WFAIR.ONE;

jest.setTimeout(1000000);

beforeAll(async () => await setupDatabase());

afterAll(async () => await teardownDatabase());

beforeEach(async () => {
  await WFAIR.mint(casinoWallet, liquidityAmount);
});

test('Run a game', async () => {
  const casino = new Casino(casinoWallet);

  for (let i = 1; i <= 5; i++) {
    // mint players with 5000 WFAIR balance
    await WFAIR.mint(`${BASE_WALLET}_${i}`, 5000n * WFAIR.ONE);

    // each player places a trade
    await casino.placeTrade(`${BASE_WALLET}_${i}`, 2000n * WFAIR.ONE, 999, 'gameId');
  }

  // lock the trades
  await casino.lockOpenTrades('gameId', 'gameId', 3, 10000);

  // cashout
  for (let i = 1; i <= 5; i++) {
    expect((await casino.cashout(`${BASE_WALLET}_${i}`, 2.1, 'gameId')).totalReward).toBe(
      42000000n
    );
  }
});
