const ERC20 = require('./Erc20.noblock');
const NoWeb3Exception = require('./Exception.noblock');
const {
    createDBTransaction,
    rollbackDBTransaction,
    commitDBTransaction,
    insertAMMInteraction,
    viewAllBalancesOfToken,
    insertReport, viewReport
} = require('../utils/db_helper');

const COLLATERAL_TOKEN = 'EVNT';
const WALLET_PREFIX = 'BET_';
const FEE_WALLET_PREFIX = 'FEE_';


class Bet {
    constructor(betId, outcomes) {
        this.betId = betId;
        this.fee = 0.01;
        this.walletId = WALLET_PREFIX + betId;
        this.feeWalletId = FEE_WALLET_PREFIX + betId;
        this.outcomes = outcomes || 2;
        this.collateralToken = new ERC20(COLLATERAL_TOKEN);
        this.ONE = this.collateralToken.ONE;
    }

    getOutcomeKey = (outcome) => outcome.toString() + '_' + this.betId;

    getOutcomeTokens = () => {
        const tokens = [];
        for (let i = 0; i < this.outcomes; i++) {
            tokens.push(new ERC20(this.getOutcomeKey(i)))
        }
        return tokens;
    }

    getOutcomeToken = (index) => this.getOutcomeTokens()[index];

    getPoolBalances = async () => {
        const balances = {};
        const tokens = this.getOutcomeTokens();
        for (const token of tokens) {
            balances[token.symbol] = await token.balanceOf(this.walletId);
        }
        return balances;
    }

    getPoolBalancesChain = async (dbClient) => {
        const balances = {};
        const tokens = this.getOutcomeTokens();
        for (const token of tokens) {
            balances[token.symbol] = await token.balanceOfChain(dbClient, this.walletId);
        }
        return balances;
    }

    getInvestorsOfOutcome = async (outcome) => {
        return await viewAllBalancesOfToken(this.getOutcomeKey(outcome));
    }

    getWalletBalances = async (userId) => {
        const balances = {};
        const tokens = this.getOutcomeTokens();
        for (const token of tokens) {
            balances[token.symbol] = await token.balanceOf(userId);
        }
        return balances;
    }

    getWalletBalancesChain = async (dbClient, userId) => {
        const balances = {};
        const tokens = this.getOutcomeTokens();
        for (const token of tokens) {
            balances[token.symbol] = await token.balanceOfChain(dbClient, userId);
        }
        return balances;
    }

    isWalletInvested = async (userId) => {
        const balances = await this.getWalletBalances(userId);
        return this.isWalletInvestedOfBalance(balances);
    }

    isWalletInvestedOfBalance = (balances) => {
        for (const balance of Object.values(balances)) {
            if (balance > 0n) return true;
        }
        return false;
    }

    addLiquidity = async (provider, amount) => {
        const dbClient = await createDBTransaction();
        try {
            await this.collateralToken.transferChain(dbClient, provider, this.walletId, amount);
            const tokens = this.getOutcomeTokens();
            for (const token of tokens) {
                await token.mintChain(dbClient, this.walletId, amount);
            }

            await commitDBTransaction(dbClient);
        } catch (e) {
            console.error(e);
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     * Some big boi BigInt Math to get the Fee Amount
     *
     * @param amount {bigint}
     * @returns {bigint}
     * @private
     */
    _getFee = (amount) => {
        return (amount / BigInt(this.fee * 100)) / 100n;
    }

    /**
     * Calculate the amount of outcome-tokens able to buy using the investment amount
     *
     * @param poolBalances
     * @param investmentAmount {bigint}
     * @param outcome {number}
     * @returns {bigint}
     */
    _calcBuyOfBalance = (poolBalances, investmentAmount, outcome) => {
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const investmentAmountMinusFees = investmentAmount - this._getFee(investmentAmount);
        const buyTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = buyTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = (endingOutcomeBalance * poolBalance) / (poolBalance + investmentAmountMinusFees);
            }
        }

        return buyTokenPoolBalance + investmentAmountMinusFees - endingOutcomeBalance;
    }

    /**
     * Calculate the amount of outcome-tokens able to buy using the investment amount
     *
     * @param investmentAmount {bigint}
     * @param outcome {number}
     * @returns {Promise<bigint>}
     */
    calcBuy = async (investmentAmount, outcome) => {
        const poolBalances = await this.getPoolBalances();
        return this._calcBuyOfBalance(poolBalances, investmentAmount, outcome);
    }

    /**
     * Calculate the amount of outcome-tokens able to buy using the investment amount
     *
     * @param dbClient {Client}
     * @param investmentAmount {bigint}
     * @param outcome {number}
     * @returns {Promise<bigint>}
     */
    calcBuyChain = async (dbClient, investmentAmount, outcome) => {
        const poolBalances = await this.getPoolBalancesChain(dbClient);
        return this._calcBuyOfBalance(poolBalances, investmentAmount, outcome);
    }

    /**
     * Calculate the amount of outcome-tokens required to sell for the requested return amount
     *
     * @param poolBalances
     * @param returnAmount {bigint}
     * @param outcome {number}
     * @returns {bigint}
     */
    _calcSellOfBalance = (poolBalances, returnAmount, outcome) => {
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const returnAmountPlusFees = returnAmount + this._getFee(returnAmount);
        const sellTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = (endingOutcomeBalance * poolBalance) / (poolBalance - returnAmountPlusFees);
            }
        }

        return returnAmountPlusFees + endingOutcomeBalance - sellTokenPoolBalance;
    }

    /**
     * Calculate the amount of outcome-tokens required to sell for the requested return amount
     *
     * @param dbClient {Client}
     * @param returnAmount {bigint}
     * @param outcome {number}
     * @returns {Promise<bigint>}
     */
    calcSellChain = async (dbClient, returnAmount, outcome) => {
        const poolBalances = await this.getPoolBalancesChain(dbClient);
        return this._calcSellOfBalance(poolBalances, returnAmount, outcome);
    }

    /**
     * Calculate the amount of outcome-tokens required to sell for the requested return amount
     *
     * @param returnAmount {bigint}
     * @param outcome {number}
     * @returns {Promise<bigint>}
     */
    calcSell = async (returnAmount, outcome) => {
        const poolBalances = await this.getPoolBalances();
        return this._calcSellOfBalance(poolBalances, returnAmount, outcome);
    }

    /**
     * Calculate the amount of EVNT-tokens returned for the requested sell amount
     *
     * @param sellAmount {bigint}
     * @param outcome {number}
     * @returns {Promise<bigint>}
     */
    calcSellFromAmount = async (sellAmount, outcome) => {
        const poolBalances = await this.getPoolBalances();
        return this._calcSellFromAmountOfBalance(poolBalances, sellAmount, outcome);
    }

    /**
     * Calculate the amount of EVNT-tokens returned for the requested sell amount
     *
     * @param dbClient {Client}
     * @param sellAmount {bigint}
     * @param outcome {number}
     * @returns {Promise<bigint>}
     */
    calcSellFromAmountChain = async (dbClient, sellAmount, outcome) => {
        const poolBalances = await this.getPoolBalancesChain(dbClient);
        return this._calcSellFromAmountOfBalance(poolBalances, sellAmount, outcome);
    }

    /**
     *
     * @param poolBalances
     * @param sellAmount {bigint}
     * @param outcome {number}
     * @returns {bigint}
     * @private
     */
    _calcSellFromAmountOfBalance = (poolBalances, sellAmount, outcome) => {
        const outcomeToken = this.getOutcomeTokens()[outcome];

        const marginalR = this._calcSellOfBalance(poolBalances, this.collateralToken.ONE, outcome);

        let maximumRange = outcomeToken.ONE * sellAmount / marginalR + 1n;
        let minimumRange = 0n;
        let midRange = 0n;
        let oldMidRange = 0n;

        while (minimumRange <= maximumRange) {
            midRange = (minimumRange + maximumRange) / 2n;

            const approxSell = this._calcSellOfBalance(poolBalances, midRange, outcome);
            if (approxSell === sellAmount || (approxSell < sellAmount && sellAmount - approxSell <= 1n)) {
                break;
            }
            if (oldMidRange === midRange) {
                if (minimumRange === maximumRange) {
                    break;
                }
                minimumRange = maximumRange;
            }
            if (approxSell < sellAmount) {
                minimumRange = midRange
            } else {
                maximumRange = midRange
            }
            oldMidRange = midRange;
        }

        return midRange;
    }

    /**
     *
     * @param buyer {String}
     * @param investmentAmount {bigint}
     * @param outcome {number}
     * @param minOutcomeTokensToBuy {bigint}
     * @returns {Promise<any>}
     */
    buy = async (buyer, investmentAmount, outcome, minOutcomeTokensToBuy) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {
            const outcomeTokensToBuy = await this.calcBuyChain(dbClient, investmentAmount, outcome);
            const feeAmount = this._getFee(investmentAmount);
            const outcomeToken = this.getOutcomeTokens()[outcome];

            if (outcomeTokensToBuy < minOutcomeTokensToBuy) {
                throw new NoWeb3Exception("Minimum buy amount not reached");
            }

            await this.collateralToken.transferChain(dbClient, buyer, this.walletId, investmentAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);
            await outcomeToken.transferChain(dbClient, this.walletId, buyer, outcomeTokensToBuy);

            await insertAMMInteraction(dbClient, buyer, this.betId, outcome, "BUY", investmentAmount, feeAmount, outcomeTokensToBuy, new Date());

            await commitDBTransaction(dbClient);

            const newBalances = await this.getWalletBalances(buyer);
            newBalances['isInvested'] = this.isWalletInvestedOfBalance(newBalances);
            newBalances['boughtOutcomeTokens'] = outcomeTokensToBuy;
            newBalances['spendTokens'] = investmentAmount;

            return newBalances;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     *
     * @param seller {String}
     * @param returnAmount {bigint}
     * @param outcome {number}
     * @param maxOutcomeTokensToSell {bigint}
     * @returns {Promise<any>}
     */
    sell = async (seller, returnAmount, outcome, maxOutcomeTokensToSell) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {

            const outcomeTokensToSell = await this.calcSellChain(dbClient, returnAmount, outcome);
            const feeAmount = this._getFee(returnAmount);
            const outcomeToken = this.getOutcomeTokens()[outcome];

            if (outcomeTokensToSell > maxOutcomeTokensToSell) {
                throw new NoWeb3Exception("Maximum sell amount surpassed");
            }

            await outcomeToken.transferChain(dbClient, seller, this.walletId, outcomeTokensToSell);
            await this.collateralToken.transferChain(dbClient, this.walletId, seller, returnAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);

            await insertAMMInteraction(dbClient, seller, this.betId, outcome, "SELL", returnAmount, feeAmount, outcomeTokensToSell, new Date());

            await commitDBTransaction(dbClient);

            const newBalances = await this.getWalletBalances(seller);
            newBalances['isInvested'] = this.isWalletInvestedOfBalance(newBalances);
            newBalances['soldOutcomeTokens'] = outcomeTokensToSell;
            newBalances['earnedTokens'] = returnAmount;

            return newBalances;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     *
     * @param seller {String}
     * @param sellAmount {bigint}
     * @param outcome {number}
     * @param minReturnAmount {bigint}
     * @returns {Promise<any>}
     */
    sellAmount = async (seller, sellAmount, outcome, minReturnAmount) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {
            const returnAmount = await this.calcSellFromAmountChain(dbClient, sellAmount, outcome);
            const feeAmount = this._getFee(returnAmount);
            const outcomeToken = this.getOutcomeTokens()[outcome];

            if (returnAmount < minReturnAmount) {
                throw new NoWeb3Exception("Minimum return amount not reached");
            }

            await outcomeToken.transferChain(dbClient, seller, this.walletId, sellAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, seller, returnAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);

            await insertAMMInteraction(dbClient, seller, this.betId, outcome, "SELL", returnAmount, feeAmount, sellAmount, new Date());

            await commitDBTransaction(dbClient);

            const newBalances = await this.getWalletBalances(seller);
            newBalances['isInvested'] = this.isWalletInvestedOfBalance(newBalances);
            newBalances['soldOutcomeTokens'] = sellAmount;
            newBalances['earnedTokens'] = returnAmount;

            return newBalances;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    getResult = async () => {
        const result = await viewReport(this.betId);
        if (result.length === 0) {
            throw new NoWeb3Exception("The Bet is not resolved yet!");
        } else if (result.length > 1) {
            throw new NoWeb3Exception("The Bet is invalidly resolved!");
        }
        return result[0];
    }

    isResolved = async () => {
        const result = await viewReport(this.betId);
        return result.length !== 0;
    }

    /**
     * @param reporter {String}
     * @param outcome { number }
     * @returns {Promise<void>}
     */
    resolveBet = async (reporter, outcome) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }
        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }
        await insertReport(this.betId, reporter, outcome, new Date());
    }

    /**
     * Complete a Payout for a User
     *
     * @param beneficiary {String}
     * @returns {Promise<number>}
     */
    getPayout = async (beneficiary) => {
        if (!(await this.isResolved())) {
            throw new NoWeb3Exception("The Bet is not resolved yet!");
        }
        const outcome = (await this.getResult())['outcome'];
        const outcomeToken = this.getOutcomeTokens()[outcome];

        const dbClient = await createDBTransaction();

        try {
            const outcomeBalance = await outcomeToken.balanceOfChain(dbClient, beneficiary);

            await outcomeToken.burnChain(dbClient, beneficiary, outcomeBalance);
            await this.collateralToken.transferChain(dbClient, this.walletId, beneficiary, outcomeBalance);

            await commitDBTransaction(dbClient);
            return outcomeBalance;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }
}

module.exports = Bet;
