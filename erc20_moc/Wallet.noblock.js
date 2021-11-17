const {
  viewAMMInteractionsOfUser,
} = require('../utils/db_helper');

class Wallet {
  constructor(walletId) {
    this.walletId = walletId;
  }

  getAMMInteractions = async () =>
    await viewAMMInteractionsOfUser(this.walletId);
}

module.exports = Wallet;
