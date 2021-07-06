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
        this.ONE = 10000n;
    }

    /**
     * Calculate the token-balance from the balances
     *
     * @param user {String}
     * @param balances {array}
     * @returns {bigint}
     * @private
     */
    _balanceOf = (user, balances) => {
        let balance = 0n;
        if (balances.length > 0) {
            balance = BigInt(balances[0].balance);
        } else {
            console.debug("[ERC-20-MOC]", "Did not find a balance. Defaulting to 0", user, balances)
        }
        return balance;
    }

    /**
     * Check the token-balance of an address
     *
     * @param user {String}
     * @returns {Promise<bigint>}
     */
    balanceOf = async (user) => {
        const results = await viewBalanceOfUser(user, this.symbol);
        return this._balanceOf(user, results);
    }

    /**
     * Check the token-balance of an address
     * Build for Transactions
     *
     * @param dbClient {Client}
     * @param user
     * @returns {Promise<bigint>}
     */
    balanceOfChain = async (dbClient, user) => {
        const results = await getBalanceOfUser(dbClient, user, this.symbol);
        return this._balanceOf(user, results);
    }

    /**
     * Transfer tokens from one address to another
     *
     * @param sender {String}
     * @param receiver {String}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
    transfer = async (sender, receiver, amount) => {
        if (amount > 0) {
            const dbClient = await createDBTransaction();

            let senderBalance;
            try {
                senderBalance = await this.balanceOfChain(dbClient, sender);
            } catch (e) {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(e.message);
            }

            if (senderBalance >= amount) {
                const trx_time = new Date();

                try {
                    const receiverBalance = await this.balanceOfChain(dbClient, receiver);

                    await updateBalanceOfUser(dbClient, sender, this.symbol, trx_time, senderBalance - amount);
                    await updateBalanceOfUser(dbClient, receiver, this.symbol, trx_time, receiverBalance + amount);
                    await insertTransaction(dbClient, sender, receiver, amount, this.symbol, trx_time);

                    await commitDBTransaction(dbClient);
                } catch (e) {
                    await rollbackDBTransaction(dbClient);
                    throw new NoWeb3Exception(e.message);
                }

            } else {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(sender + " can't spend more than it owns!");
            }
        } else {
            throw new NoWeb3Exception("Spending negative amounts is not possible!");
        }
    }

    /**
     * Transfer tokens from one address to another
     * Build for Transactions
     *
     * @param dbClient {Client}
     * @param sender {String}
     * @param receiver {String}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
    transferChain = async (dbClient, sender, receiver, amount) => {
        if (amount > 0) {
            let senderBalance;
            try {
                senderBalance = await this.balanceOfChain(dbClient, sender);
            } catch (e) {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(e.message);
            }

            if (senderBalance >= amount) {
                const trx_time = new Date();

                try {
                    const receiverBalance = await this.balanceOfChain(dbClient, receiver);

                    await updateBalanceOfUser(dbClient, sender, this.symbol, trx_time, senderBalance - amount);
                    await updateBalanceOfUser(dbClient, receiver, this.symbol, trx_time, receiverBalance + amount);
                    await insertTransaction(dbClient, sender, receiver, amount, this.symbol, trx_time);

                    await commitDBTransaction(dbClient);
                } catch (e) {
                    await rollbackDBTransaction(dbClient);
                    throw new NoWeb3Exception(e.message);
                }

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
     * @param dbClient {Client}
     * @param receiver {String}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
    mintChain = async (dbClient, receiver, amount) => {
        if (amount > 0) {
            const trx_time = new Date();
            const receiverBalance = await this.balanceOfChain(dbClient, receiver);
            await updateBalanceOfUser(dbClient, receiver, this.symbol, trx_time, receiverBalance + amount);
            await insertTransaction(dbClient, "", receiver, amount, this.symbol, trx_time);
        } else {
            throw new NoWeb3Exception("Spending negative amounts is not possible!");
        }
    }

    /**
     * Mint new tokens and add them to an address
     *
     * @param receiver {String}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
    mint = async (receiver, amount) => {
        if (amount > 0) {
            const dbClient = await createDBTransaction();

            try {
                await this.mintChain(dbClient, receiver, amount);
                await commitDBTransaction(dbClient);
            } catch (e) {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(e.message);
            }
        } else {
            throw new NoWeb3Exception("Spending negative amounts is not possible!");
        }
    }

    /**
     * Mint new tokens and add them to an address
     *
     * @param dbClient {Client}
     * @param sponsor {String}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
    burnChain = async (dbClient, sponsor, amount) => {
        if (amount > 0) {
            const trx_time = new Date();
            let senderBalance;
            try {
                senderBalance = await this.balanceOfChain(dbClient, sponsor);
            } catch (e) {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(e.message);
            }

            if (senderBalance >= amount) {
                await updateBalanceOfUser(dbClient, sponsor, this.symbol, trx_time, senderBalance - amount);
                await insertTransaction(dbClient, sponsor, "", amount, this.symbol, trx_time);
            } else {
                throw new NoWeb3Exception(sponsor + " can't burn more than it owns!");
            }

        } else {
            throw new NoWeb3Exception("Spending negative amounts is not possible!");
        }
    }

    /**
     * Burn tokens of a sponsor-address
     *
     * @param sponsor {String}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
    burn = async (sponsor, amount) => {
        if (amount > 0) {
            const dbClient = await createDBTransaction();

            try {
                await this.burnChain(dbClient, sponsor, amount);
                await commitDBTransaction(dbClient);
            } catch (e) {
                await rollbackDBTransaction(dbClient);
                throw new NoWeb3Exception(e.message);
            }
        } else {
            throw new NoWeb3Exception("Burning negative amounts is not possible!");
        }
    }
}

module.exports = ERC20;
