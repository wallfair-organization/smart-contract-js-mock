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

    const EVNT = new ERC20('EVNT');

    await EVNT.mint(testMintWallet, tokensToMint);

    expect(await EVNT.balanceOf(testMintWallet)).toBe(tokensToMint);
});

test('Transfer Tokens', async () => {
    const tokensToMint = 1000n;
    const tokensToTransfer = 100n;
    const testSenderWallet = 'testSender';
    const testReceiverWallet = 'testReceiver';

    const EVNT = new ERC20('EVNT');

    await EVNT.mint(testSenderWallet, tokensToMint);
    await EVNT.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer);

    expect(await EVNT.balanceOf(testSenderWallet)).toBe(tokensToMint - tokensToTransfer);
    expect(await EVNT.balanceOf(testReceiverWallet)).toBe(tokensToTransfer);
});

test('Burn Tokens', async () => {
    const tokensToMint = 1000n;
    const tokensToBurn = 100n;
    const testBurnWallet = 'testBurn';

    const EVNT = new ERC20('EVNT');

    await EVNT.mint(testBurnWallet, tokensToMint);
    await EVNT.burn(testBurnWallet, tokensToBurn);

    expect(await EVNT.balanceOf(testBurnWallet)).toBe(tokensToMint - tokensToBurn);
});
