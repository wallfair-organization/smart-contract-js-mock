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

  });
  describe('Transfer tokens', () => {
    it('Successfully transfer Tokens', async () => {
      const tokensToMint = 1000n;
      const tokensToTransfer = 100n;
      const testSenderWallet = 'successfulTestSender';
      const testReceiverWallet = 'successfulTestReceiver';
      const symbol = 'WFAIR';
      const transaction = {
        sender: testSenderWallet,
        receiver: testReceiverWallet,
        amount: tokensToTransfer,
        symbol: symbol
      };
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testSenderWallet, tokensToMint);
      await WFAIR.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer);

      //Validate the balance of the sender has decreased by the right amount
      expect(await WFAIR.balanceOf(testSenderWallet)).toBe(
        tokensToMint - tokensToTransfer
      );

      //Validate the balance of the received has increased by the right amount
      expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(tokensToTransfer);

      const resultTransaction = await viewTransactionOfUser(testSenderWallet);

      //Validate the transaction is created and with correct content
      expect(resultTransaction).toHaveLength(2);
      expect(resultTransaction[1]).toEqual(expect.objectContaining(transaction));

    });

    it('Successfully transfer a huge amount of Tokens', async () => {
      const tokensToMint = BigInt(Number.MAX_SAFE_INTEGER * 100);
      const tokensToTransfer = BigInt(Number.MAX_SAFE_INTEGER * 99);
      const testSenderWallet = 'successfulTestHugeSender';
      const testReceiverWallet = 'successfulTestHugeReceiver';
      const symbol = 'WFAIR';
      const transaction = {
        sender: testSenderWallet,
        receiver: testReceiverWallet,
        amount: tokensToTransfer,
        symbol: symbol
      };
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testSenderWallet, tokensToMint);
      await WFAIR.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer);

      //Validate the balance of the sender has decreased by the right amount
      expect(await WFAIR.balanceOf(testSenderWallet)).toBe(
        tokensToMint - tokensToTransfer
      );

      //Validate the balance of the received has increased by the right amount
      expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(tokensToTransfer);

      const resultTransactionSender = await viewTransactionOfUser(testSenderWallet);
      const resultTransactionReceiver = await viewTransactionOfUser(testReceiverWallet);

      //Validate the transaction is created and with correct content for the sender
      expect(resultTransactionSender).toHaveLength(2);
      expect(resultTransactionSender[1]).toEqual(expect.objectContaining(transaction));

      //Validate the transaction is created and with correct content for the sender
      expect(resultTransactionReceiver).toHaveLength(1);
      expect(resultTransactionReceiver[0]).toEqual(expect.objectContaining(transaction));

    });

    it("Validate that the sender hasn't got enough funds to transfer", async () => {
      const tokensToMint = 1000n;
      const tokensToTransfer = 1001n;
      const testSenderWallet = 'insufficientSenderFunds';
      const testReceiverWallet = 'insufficientSenderReceiver';
      const symbol = 'WFAIR';
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testSenderWallet, tokensToMint);
      await expect(WFAIR.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer))
        .rejects.toBeInstanceOf(NoWeb3Exception);

      const resultTransactionSender = await viewTransactionOfUser(testSenderWallet);
      const resultTransactionReceiver = await viewTransactionOfUser(testReceiverWallet);

      //Balance for receiver and sender should remain unchanged
      expect(await WFAIR.balanceOf(testSenderWallet)).toBe(tokensToMint);
      expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(0n);

      //Only Mint transaction should be in the history
      expect(resultTransactionSender).toHaveLength(1);
      //Mint transactions have the sender as empty
      expect(resultTransactionSender[0]).toEqual(expect.objectContaining({ sender: '' }));

      //No transaction should be found for the receiver
      expect(resultTransactionReceiver).toHaveLength(0);

    });

    it("Validate that the transaction has negative amount", async () => {
      const tokensToMint = 1000n;
      const tokensToTransfer = -100n;
      const testSenderWallet = 'negativeTransactionSenderFunds';
      const testReceiverWallet = 'negativeTransactionReceiver';
      const symbol = 'WFAIR';
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testSenderWallet, tokensToMint);
      await expect(WFAIR.transfer(testSenderWallet, testReceiverWallet, tokensToTransfer))
        .rejects.toBeInstanceOf(NoWeb3Exception);

      const resultTransactionSender = await viewTransactionOfUser(testSenderWallet);
      const resultTransactionReceiver = await viewTransactionOfUser(testReceiverWallet);

      //Balance for receiver and sender should remain unchanged
      expect(await WFAIR.balanceOf(testSenderWallet)).toBe(tokensToMint);
      expect(await WFAIR.balanceOf(testReceiverWallet)).toBe(0n);

      //Only Mint transaction should be in the history
      expect(resultTransactionSender).toHaveLength(1);
      //Mint transactions have the sender as empty
      expect(resultTransactionSender[0]).toEqual(expect.objectContaining({ sender: '' }));

      //No transaction should be found for the receiver
      expect(resultTransactionReceiver).toHaveLength(0);

    });
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
