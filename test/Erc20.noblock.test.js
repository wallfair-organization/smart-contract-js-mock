require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');

beforeAll(async () => {
    return await setupDatabase();
});

afterAll(async () => {
    return await teardownDatabase();
});

test('Mint Tokens', async () => {
    const tokensToMint = 1000n;
    const testMintWallet = 'testMint';

    const WFAIR = new ERC20('WFAIR');

    await WFAIR.mint(testMintWallet, tokensToMint);

    expect(await WFAIR.balanceOf(testMintWallet)).toBe(tokensToMint);
});

test('Transfer Tokens', async () => {
    const tokensToMint = 1000n;
    const tokensToTransfer = 100n;
    const testSenderWallet = 'testSender';
    const testReceiverWallet = 'testReceiver';

    const WFAIR = new ERC20('WFAIR');

    await WFAIR.mint(testSenderWallet, tokensToMint);
    await WFAIR.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer);

    expect(await WFAIR.balanceOf(testSenderWallet)).toBe(tokensToMint - tokensToTransfer);
    expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(tokensToTransfer);
});

test('Burn Tokens', async () => {
    const tokensToMint = 1000n;
    const tokensToBurn = 100n;
    const testBurnWallet = 'testBurn';

    const WFAIR = new ERC20('WFAIR');

    await WFAIR.mint(testBurnWallet, tokensToMint);
    await WFAIR.burn(testBurnWallet, tokensToBurn);

    expect(await WFAIR.balanceOf(testBurnWallet)).toBe(tokensToMint - tokensToBurn);
});
