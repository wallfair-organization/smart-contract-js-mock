require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('./db/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');

beforeAll(async () => await setupDatabase());

afterAll(async () => await teardownDatabase());

test('Mint Tokens', async () => {
  const tokensToMint = 10000n;
  const testMintWallet = '615bf607f04fbb15aa5dd367';

  const WFAIR = new ERC20('WFAIR');

  await WFAIR.mint(testMintWallet, 'usr', tokensToMint);

  expect(await WFAIR.balanceOf(testMintWallet)).toBe(tokensToMint);

  await WFAIR.burn(testMintWallet, 'usr', tokensToMint);
});

test('Transfer Tokens', async () => {
  const tokensToMint = 1000n;
  const tokensToTransfer = 100n;
  const testSenderWallet = '615bf607f04fbb15aa5dd367';
  const testReceiverWallet = '615bfb7df04fbb15aa5dd368';

  const WFAIR = new ERC20('WFAIR');

  await WFAIR.mint(testSenderWallet, 'usr', tokensToMint);
  await WFAIR.transfer(testSenderWallet, testReceiverWallet, 'usr', 'usr', tokensToTransfer);

  expect(await WFAIR.balanceOf(testSenderWallet)).toBe(
    tokensToMint - tokensToTransfer
  );
  expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(tokensToTransfer);

  await WFAIR.burn(testSenderWallet, 'usr', tokensToMint - tokensToTransfer);
  await WFAIR.burn(testReceiverWallet, 'usr', tokensToTransfer);
});

test('Burn Tokens', async () => {
  const tokensToMint = 1000n;
  const tokensToBurn = 100n;
  const testBurnWallet = '615bf607f04fbb15aa5dd367';

  const WFAIR = new ERC20('WFAIR');

  await WFAIR.mint(testBurnWallet, 'usr', tokensToMint);
  await WFAIR.burn(testBurnWallet, 'usr', tokensToBurn);

  expect(await WFAIR.balanceOf(testBurnWallet)).toBe(
    tokensToMint - tokensToBurn
  );

  await WFAIR.burn(testBurnWallet, 'usr', tokensToMint - tokensToBurn);
});
