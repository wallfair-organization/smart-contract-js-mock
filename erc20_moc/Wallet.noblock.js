const ERC20 = require('./Erc20.noblock');
const {
  viewAllBalancesOfUser,
  viewAMMInteractionsOfUser,
} = require('../utils/db_helper');

class Wallet {
  constructor(walletId) {
    this.walletId = walletId;
  }

  allBalances = async () => await viewAllBalancesOfUser(this.walletId);

  balanceOf = async (symbol) =>
    await new ERC20(symbol).balanceOf(this.walletId);

  balanceOfWFAIR = async () => await this.balanceOf('WFAIR');

  getAMMInteractions = async () =>
    await viewAMMInteractionsOfUser(this.walletId);
}

module.exports = Wallet;
