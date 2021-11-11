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
        symbol: symbol
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
        symbol: symbol
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
      const failToMintWallet = 'FailToMintWallet';
      await expect(WFAIR.mint(failToMintWallet, -1000n))
        .rejects.toBeInstanceOf(NoWeb3Exception);

      //Ensure the balance for the user hasn't been changed
      expect(await WFAIR.balanceOf(failToMintWallet)).toBe(0n);

    });

    it("Fail to mint new tokens due to no symbol specified", async () => {
      const noSymbol = new ERC20(null);
      const failNoSymbolWallet = 'FailNoSymbolWallet'
      await expect(noSymbol.mint(failNoSymbolWallet, 1000n))
        .rejects.toBeInstanceOf(NoWeb3Exception);

      //Ensure the balance for the user hasn't been changed
      expect(await WFAIR.balanceOf(failNoSymbolWallet)).toBe(0n);

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

      //Sender should have 2 transactions, one for the mint and one for the transfer
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

      //Sender should have 2 transactions, one for the mint and one for the transfer
      expect(resultTransactionSender).toHaveLength(2);
      expect(resultTransactionSender[1]).toEqual(expect.objectContaining(transaction));

      //Receiver should only have 1 transaction related the transfer
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

  describe('Burn Tokens', () => {
    it('Sucessfully burn Tokens', async () => {
      const tokensToMint = 1000n;
      const testBurnWallet = 'sucessfullyBurnWallet';
      const tokensToBurn = 100n;
      const symbol = 'WFAIR';
      const transaction = {
        sender: testBurnWallet,
        receiver: '',
        amount: tokensToBurn,
        symbol: symbol
      };
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testBurnWallet, tokensToMint);
      await WFAIR.burn(testBurnWallet, tokensToBurn);

      //Check the balance of the user has been updated
      expect(await WFAIR.balanceOf(testBurnWallet)).toBe(tokensToMint - tokensToBurn);

      //There should be 2 transactions, one for the mint and one for the burn
      const resultTransaction = await viewTransactionOfUser(testBurnWallet);
      expect(resultTransaction).toHaveLength(2);
      expect(resultTransaction[1]).toEqual(expect.objectContaining(transaction));
    });

    it('Sucessfully burn huge amount of Tokens', async () => {
      const tokensToMint = BigInt(Number.MAX_SAFE_INTEGER * 100);
      const testBurnWallet = 'sucessfullyBurnHugeWallet';
      const tokensToBurn = BigInt(Number.MAX_SAFE_INTEGER * 99);
      const symbol = 'WFAIR';
      const transaction = {
        sender: testBurnWallet,
        receiver: '',
        amount: tokensToBurn,
        symbol: symbol
      };
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testBurnWallet, tokensToMint);
      await WFAIR.burn(testBurnWallet, tokensToBurn);

      //Check the balance of the user has been updated
      expect(await WFAIR.balanceOf(testBurnWallet)).toBe(tokensToMint - tokensToBurn);

      //There should be 2 transactions, one for the mint and one for the burn
      const resultTransaction = await viewTransactionOfUser(testBurnWallet);
      expect(resultTransaction).toHaveLength(2);
      expect(resultTransaction[1]).toEqual(expect.objectContaining(transaction));
    });

    it('Validate the owner doesnt have enough funds to burn ', async () => {
      const tokensToMint = 1000n;
      const testBurnWallet = 'negativeAmountFundsBurnWallet';
      const tokensToBurn = 1001n;
      const symbol = 'WFAIR';
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testBurnWallet, tokensToMint);
      await expect(WFAIR.burn(testBurnWallet, tokensToBurn))
        .rejects.toBeInstanceOf(NoWeb3Exception);

      //Check the balance of the user hasn't been updated
      expect(await WFAIR.balanceOf(testBurnWallet)).toBe(tokensToMint);

      //There should be only the mint transaction, one for the mint and one for the burn
      const resultTransaction = await viewTransactionOfUser(testBurnWallet);
      expect(resultTransaction).toHaveLength(1);

      //Mint transactions should have an empty sender
      expect(resultTransaction[0]).toEqual(expect.objectContaining({ sender: '' }));
    });

    it('Validate the amount provided is negative', async () => {
      const tokensToMint = 1000n;
      const testBurnWallet = 'insufficientOwnerFundsBurnWallet';
      const tokensToBurn = -999n;
      const symbol = 'WFAIR';
      const WFAIR = new ERC20(symbol);

      await WFAIR.mint(testBurnWallet, tokensToMint);
      await expect(WFAIR.burn(testBurnWallet, tokensToBurn))
        .rejects.toBeInstanceOf(NoWeb3Exception);

      //Check the balance of the user hasn't been updated
      expect(await WFAIR.balanceOf(testBurnWallet)).toBe(tokensToMint);

      //There should be only the mint transaction, one for the mint and one for the burn
      const resultTransaction = await viewTransactionOfUser(testBurnWallet);
      expect(resultTransaction).toHaveLength(1);

      //Mint transactions should have an empty sender
      expect(resultTransaction[0]).toEqual(expect.objectContaining({ sender: '' }));
    });
  });

});
