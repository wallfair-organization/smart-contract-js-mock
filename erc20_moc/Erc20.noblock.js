const {
  createDBTransaction,
  commitDBTransaction,
  rollbackDBTransaction,
  getBalanceOfUser,
  getBalanceOfUserForUpdate,
  viewBalanceOfUser,
  updateBalanceOfUser,
} = require('../utils/db_helper');
const NoWeb3Exception = require('./Exception.noblock');

class ERC20 {
  /**
   * Create a Moc ERC20 instance
   *
   * @param symbol {string}
   */
  constructor(symbol) {
    this.symbol = symbol;
    this.ONE = 10000n;
  }

  /**
   * Calculate the token-balance from the balances
   *
   * @param user {string}
   * @param balances {array}
   * @returns {bigint}
   * @private
   */
  _balanceOf = (user, balances) => {
    let balance = 0n;
    if (balances.length > 0) {
      balance = BigInt(balances[0].balance);
    }
    return balance;
  };

  /**
   * Check the token-balance of an address
   * Build for Transactions
   *
   * @param dbClient {Client}
   * @param user {string}
   * @returns {Promise<bigint>}
   */
  balanceOfChain = async (dbClient, user, namespace) => {
    const results = await getBalanceOfUser(dbClient, user, this.symbol, namespace);
    return this._balanceOf(user, results);
  };

  /**
   * Check the token-balance of an address
   * Build for Transactions while locking a row for modifying
   *
   * @param dbClient {Client}
   * @param user {string}
   * @returns {Promise<bigint>}
   */
  balanceOfChainForUpdate = async (dbClient, user, namespace) => {
    const results = await getBalanceOfUserForUpdate(dbClient, user, this.symbol, namespace);
    return this._balanceOf(user, results);
  }

  /**
   * Check the token-balance of an address
   *
   * @param user {string}
   * @returns {Promise<bigint>}
   */
  balanceOf = async (user, namespace = 'usr') => {
    const results = await viewBalanceOfUser(user, this.symbol, namespace);
    return this._balanceOf(user, results);
  };

  /**
   * Transfer tokens from one address to another
   * Build for Transactions
   *
   * @param dbClient {Client}
   * @param sender {string}
   * @param receiver {string}
   * @param amount {bigint}
   * @returns {Promise<void>}
   */
  transferChain = async (dbClient, sender, receiver, senderNamespace, receiverNamespace, amount, _symbol) => {
    if (amount >= 0n) {
      const senderBalanceRes = await updateBalanceOfUser(
        dbClient,
        sender,
        this.symbol,
        -amount,
        senderNamespace
      );
      const senderBalance = this._balanceOf(sender, senderBalanceRes);

      if (senderBalance < 0n) {
        throw new NoWeb3Exception(
          `Sender can't spend more than it owns! Sender: ${sender} -- Receiver: ${receiver} -- senderBalance: ${senderBalance} -- amount: ${amount}`
        );
      }

      await updateBalanceOfUser(
        dbClient,
        receiver,
        _symbol || this.symbol,
        amount,
        receiverNamespace
      );
    } else {
      throw new NoWeb3Exception(
        `Spending negative amounts is not possible! : ${sender} -- Receiver: ${receiver} -- amount: ${amount}`
      );
    }
  };

  /**
   * Transfer tokens from one address to another
   *
   * @param sender {string}
   * @param receiver {string}
   * @param amount {bigint}
   * @returns {Promise<void>}
   */
  transfer = async (sender, receiver, senderNamespace, receiverNamespace, amount) => {
    const dbClient = await createDBTransaction();
    try {
      await this.transferChain(dbClient, sender, receiver, senderNamespace, receiverNamespace, amount);
      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw new NoWeb3Exception(e.message);
    }
  };

  /**
   * Mint new tokens and add them to an address
   * Build for Transactions
   *
   * @param dbClient {Client}
   * @param receiver {string}
   * @param amount {bigint}
   * @returns {Promise<void>}
   */
  mintChain = async (dbClient, receiver, namespace, amount) => {
    if (amount >= 0n) {
      await updateBalanceOfUser(
        dbClient,
        receiver,
        this.symbol,
        amount,
        namespace
      );
    } else {
      throw new NoWeb3Exception('Minting negative amounts is not possible!');
    }
  };

  /**
   * Mint new tokens and add them to an address
   *
   * @param receiver {string}
   * @param amount {bigint}
   * @returns {Promise<void>}
   */
  mint = async (receiver, namespace, amount) => {
    const dbClient = await createDBTransaction();
    try {
      await this.mintChain(dbClient, receiver, namespace, amount);
      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw new NoWeb3Exception(e.message);
    }
  };

  /**
   * Mint new tokens and add them to an address
   * Build for Transactions
   *
   * @param dbClient {Client}
   * @param sponsor {string}
   * @param amount {bigint}
   * @returns {Promise<void>}
   */
  burnChain = async (dbClient, sponsor, namespace, amount) => {
    if (amount >= 0n) {
      const userBalance = this.balanceOf(sponsor);

      if (userBalance < 0n) {
        throw new NoWeb3Exception(
          `Owner can't burn more than it owns! -- Owner: ${sponsor} owns: ${balance} burns: ${amount}`
        );
      }

      await updateBalanceOfUser(
        dbClient,
        sponsor,
        this.symbol,
        -amount,
        namespace
      );
    } else {
      throw new NoWeb3Exception('Burning negative amounts is not possible!');
    }
  };

  /**
   * Burn tokens of a sponsor-address
   *
   * @param sponsor {string}
   * @param amount {bigint}
   * @returns {Promise<void>}
   */
  burn = async (sponsor, namespace, amount) => {
    const dbClient = await createDBTransaction();
    try {
      await this.burnChain(dbClient, sponsor, namespace, amount);
      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw new NoWeb3Exception(e.message);
    }
  };
}

module.exports = ERC20;
