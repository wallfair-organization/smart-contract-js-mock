const ERC20 = require("./Erc20.noblock");
const {
    DIRECTION,
    viewAllBalancesOfUser,
    viewTransactionOfUser,
    viewAMMInteractionsOfUser,
    viewUserInvestment,
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

    balanceOfEVNT = async () => await this.balanceOf('EVNT');

    getAMMInteractions = async () => await viewAMMInteractionsOfUser(this.walletId);

    investmentBet = async (betId, outcome) => {
        const interactions = await viewUserInvestment(this.walletId, betId, outcome);
        let result = 0n;
        if (interactions.length > 0) {
            for (const interaction of interactions) {
                if (interaction.direction === DIRECTION.PAYOUT || interaction.direction === DIRECTION.REFUND) {
                    return 0n;
                } else if (interaction.direction === DIRECTION.SELL) {
                    result -= BigInt(interaction.amount);
                } else {
                    result += BigInt(interaction.amount);
                }
            }
        }
        return result;
    }
}

module.exports = Wallet;
