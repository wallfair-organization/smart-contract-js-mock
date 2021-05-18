const {insertTransaction, getTransactionOfUser} = require('../utils/db_helper.js');
const NoWeb3Exception = require('./Exception.noblock');

class ERC20 {
    /**
     * Create a Moc ERC20 instance
     *
     * @param symbol {String}
     */
    constructor(symbol) {
        this.symbol = symbol;
    }

    /**
     * Check the token-balance of an address
     *
     * @param user {String}
     * @returns {Promise<number>}
     */
    balanceOf = async (user) => {
        const results = await getTransactionOfUser(user, this.symbol);
        let balance = 0;
        for (const result_index in results) {
            const result = results[result_index];
            if (result.sender === user) {
                balance -= result.amount;
            } else if(result.receiver === user) {
                balance += result.amount;
            }
        }
        return balance;
    }

    /**
     * Transfer tokens from one address to another
     *
     * @param sender {String}
     * @param receiver {String}
     * @param amount {number}
     * @returns {Promise<void>}
     */
    transfer = async (sender, receiver, amount) => {
        if (amount > 0) {
            const senderBalance = await this.balanceOf(sender);
            if (senderBalance >= amount) {
                await insertTransaction(sender, receiver, amount, this.symbol, new Date());
            } else {
                throw new NoWeb3Exception(sender + " can't spend more than it owns!");
            }
        } else {
            throw new NoWeb3Exception("Spending negative amounts is not possible!");
        }
    }

    /**
     * Mint new tokens and add them to an address
     *
     * @param receiver {String}
     * @param amount {number}
     * @returns {Promise<void>}
     */
    mint = async (receiver, amount) => {
        if (amount > 0) {
            await insertTransaction("", receiver, amount, this.symbol, new Date());
        } else {
            throw new NoWeb3Exception("Spending negative amounts is not possible!");
        }
    }

    /**
     * Burn tokens of a sponsor-address
     *
     * @param sponsor {String}
     * @param amount {number}
     * @returns {Promise<void>}
     */
    burn = async (sponsor, amount) => {
        if (amount > 0) {
            const senderBalance = await this.balanceOf(sponsor);
            if (senderBalance >= amount) {
                await insertTransaction(sponsor, "", amount, this.symbol, new Date());
            } else {
                throw new NoWeb3Exception(sponsor + " can't burn more than it owns!");
            }
        } else {
            throw new NoWeb3Exception("Burning negative amounts is not possible!");
        }
    }
}

module.exports = ERC20;
