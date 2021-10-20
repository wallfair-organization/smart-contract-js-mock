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

/**
 * two people will trade, one will lose, one will win
 */
test('Run a game', async () => {
  const casino = new Casino(casinoWallet);

  // mint players with 5000 WFAIR balance
  await WFAIR.mint(`${BASE_WALLET}_1`, 5000n * WFAIR.ONE);
  await WFAIR.mint(`${BASE_WALLET}_2`, 5000n * WFAIR.ONE);
  await WFAIR.mint(`${BASE_WALLET}_3`, 5000n * WFAIR.ONE);
  await WFAIR.mint(`${BASE_WALLET}_4`, 5000n * WFAIR.ONE);
  await WFAIR.mint(`${BASE_WALLET}_5`, 5000n * WFAIR.ONE);

  // eahc player places a trade
  await casino.placeTrade(`${BASE_WALLET}_1`, 2000n * WFAIR.ONE, 999);
  await casino.placeTrade(`${BASE_WALLET}_2`, 2000n * WFAIR.ONE, 999);
  await casino.placeTrade(`${BASE_WALLET}_3`, 2000n * WFAIR.ONE, 999);
  await casino.placeTrade(`${BASE_WALLET}_4`, 2000n * WFAIR.ONE, 999);
  await casino.placeTrade(`${BASE_WALLET}_5`, 2000n * WFAIR.ONE, 999);

  // lock the trades
  await casino.lockOpenTrades('gameId');

  // don't add await, due we want simulated concurrent transactions !
  setTimeout(() => {
    casino.cashout(`${BASE_WALLET}_1`, 2.1, 'gameId');
    casino.cashout(`${BASE_WALLET}_2`, 2.1, 'gameId');
    casino.cashout(`${BASE_WALLET}_3`, 2.1, 'gameId');
    casino.cashout(`${BASE_WALLET}_4`, 2.1, 'gameId');
    casino.cashout(`${BASE_WALLET}_5`, 2.1, 'gameId');
  }, 1000);
});
