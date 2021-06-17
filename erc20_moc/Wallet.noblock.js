const ERC20 = require("./Erc20.noblock");
const {
    viewAllBalancesOfUser,
    viewTransactionOfUser,
    viewTransactionOfUserBySymbol
} = require('../utils/db_helper');

class Wallet {
    constructor(walletId) {
        this.walletId = walletId;
    }

    getTransactions = async () => await viewTransactionOfUser(this.walletId);

    getTransactionsOfSymbol = async (symbol) => await viewTransactionOfUserBySymbol(this.walletId, symbol);

    allBalances = async () => await viewAllBalancesOfUser(this.walletId);

    balanceOf = async (symbol) => await new ERC20(symbol).balanceOf(this.walletId);

    balanceOfEVNT = async () => this.balanceOf('EVNT');
}

module.exports = Wallet;
