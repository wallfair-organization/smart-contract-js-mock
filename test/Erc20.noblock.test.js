require('dotenv').config();

const { setupDatabase, teardownDatabase, viewTransactionOfUser } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const NoWeb3Exception = require('../erc20_moc/Exception.noblock');

beforeAll(async () => await setupDatabase());

afterAll(async () => await teardownDatabase());
describe("ERC 20", () => {

  describe("Mint tokens", () => {
    //To check with Mussi, transaction returns amount as string
    it('Sucessfully mint Tokens', async () => {
      const tokensToMint = 1000n;
      const testMintWallet = 'testMint';
      const symbol = 'WFAIR';
      const transaction = {
        sender: '',
        receiver: testMintWallet,
        amount: tokensToMint,
        symbol: 'WFAIR'
      };
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testMintWallet, tokensToMint);
      //Check the balance of the user has been updated
      expect(await WFAIR.balanceOf(testMintWallet)).toBe(tokensToMint);

      //Check if the transaction has been properly recorded
      const resultTransaction = await viewTransactionOfUser(testMintWallet);
      expect(resultTransaction).toHaveLength(1);
      expect(resultTransaction[0]).toEqual(expect.objectContaining(transaction));
    });
    //To check with Mussi, transaction returns amount as string instead of bigint
    it('Sucessfully mint huge number of Tokens', async () => {
      const tokensToMint = BigInt(Number.MAX_SAFE_INTEGER * 100);
      const testMintWallet = 'testMintHugeNumber';
      const symbol = 'WFAIR';
      const transaction = {
        sender: '',
        receiver: testMintWallet,
        amount: tokensToMint,
        symbol: 'WFAIR'
      };
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testMintWallet, tokensToMint);

      //Check the balance of the user has been updated
      expect(await WFAIR.balanceOf(testMintWallet)).toBe(tokensToMint);
      //Check if the transaction has been properly recorded
      const resultTransaction = await viewTransactionOfUser(testMintWallet);

      expect(resultTransaction).toHaveLength(1);
      expect(resultTransaction[0]).toEqual(expect.objectContaining(transaction));
    });

    it("Fail to mint new tokens due to negative amount specified", async () => {
      const WFAIR = new ERC20('WFAIR');

      await expect(WFAIR.mint("FailToMintWallet", -1000n))
        .rejects.toBeInstanceOf(NoWeb3Exception);

    });

    it("Fail to mint new tokens due to no symbol specified", async () => {
      const noSymbol = new ERC20(null);

      await expect(noSymbol.mint("FailNoSymbolWallet", 1000n))
        .rejects.toBeInstanceOf(NoWeb3Exception);

    });
    describe('Transfer tokens', () => {
      it('Successfully transfer Tokens', async () => {
        const tokensToMint = 1000n;
        const tokensToTransfer = 100n;
        const testSenderWallet = 'testSender';
        const testReceiverWallet = 'testReceiver';

        const WFAIR = new ERC20('WFAIR');

        await WFAIR.mint(testSenderWallet, tokensToMint);
        await WFAIR.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer);

        expect(await WFAIR.balanceOf(testSenderWallet)).toBe(
          tokensToMint - tokensToTransfer
        );
        expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(tokensToTransfer);
      });
    })

  });




  test('Burn Tokens', async () => {
    const tokensToMint = 1000n;
    const tokensToBurn = 100n;
    const testBurnWallet = 'testBurn';

    const WFAIR = new ERC20('WFAIR');

    await WFAIR.mint(testBurnWallet, tokensToMint);
    await WFAIR.burn(testBurnWallet, tokensToBurn);

    expect(await WFAIR.balanceOf(testBurnWallet)).toBe(
      tokensToMint - tokensToBurn
    );
  });
});
