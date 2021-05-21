const {
    createDBTransaction,
    commitDBTransaction,
    rollbackDBTransaction,
    insertTransaction,
    getBalanceOfUser,
    viewBalanceOfUser,
    updateBalanceOfUser
} = require('../utils/db_helper');
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
        const results = await viewBalanceOfUser(user, this.symbol);
        let balance = 0;
        if (results.length > 0) {
            balance = results[0].balance;
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
            const dbClient = await createDBTransaction();

            const senderBalance = await this._balanceOf(dbClient, sender);
            if (senderBalance >= amount) {
                const receiverBalance = await this._balanceOf(dbClient, receiver);

                const trx_time = new Date();

                await updateBalanceOfUser(dbClient, sender, this.symbol, trx_time, senderBalance - amount);
                await updateBalanceOfUser(dbClient, receiver, this.symbol, trx_time, receiverBalance + amount);
                await insertTransaction(dbClient, sender, receiver, amount, this.symbol, trx_time);

                await commitDBTransaction(dbClient);
            } else {
                await rollbackDBTransaction(dbClient);
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
            const dbClient = await createDBTransaction();

            const trx_time = new Date();
            const receiverBalance = await this._balanceOf(dbClient, receiver);
            await updateBalanceOfUser(dbClient, receiver, this.symbol, trx_time, receiverBalance + amount);
            await insertTransaction(dbClient, "", receiver, amount, this.symbol, trx_time);

            await commitDBTransaction(dbClient);
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
            const dbClient = await createDBTransaction();

            const senderBalance = await this._balanceOf(dbClient, sponsor);
            if (senderBalance >= amount) {
                const trx_time = new Date();

                await updateBalanceOfUser(dbClient, sponsor, this.symbol, trx_time,senderBalance - amount);
                await insertTransaction(dbClient, sponsor, "", amount, this.symbol, trx_time);

                await commitDBTransaction(dbClient);
            } else {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(sponsor + " can't burn more than it owns!");
            }
        } else {
            throw new NoWeb3Exception("Burning negative amounts is not possible!");
        }
    }

    _balanceOf = async (client, user) => {
        const results = await getBalanceOfUser(client, user, this.symbol);
        let balance = 0;
        if (results.length > 0) {
            balance = results[0].balance;
        }
        return balance;
    }
}

module.exports = ERC20;
