const ERC20 = require('./Erc20.noblock');
const NoWeb3Exception = require('./Exception.noblock');
const {
    createDBTransaction,
    rollbackDBTransaction,
    commitDBTransaction,
    insertAMMInteraction,
    insertReport, viewReport
} = require('../utils/db_helper');

const COLLATERAL_TOKEN = "EVNT";

const WALLET_PREFIX = "BET_";
const FEE_WALLET_PREFIX = "FEE_";


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

    getOutcomeKey = (outcome) => outcome.toString() + this.betId;

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
            balances[token.symbol] =  await token.balanceOfChain(dbClient, this.walletId);
        }
        return balances;
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
            if (balance > 0) return true;
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
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     * Calculate the amount of outcome-tokens able to buy using the investment amount
     *
     * @param investmentAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcBuy = async (investmentAmount, outcome) => {
        const poolBalances = await this.getPoolBalances();
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const investmentAmountMinusFees = investmentAmount - Math.ceil(investmentAmount * this.fee);
        const buyTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = buyTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance + investmentAmountMinusFees));
            }
        }

        return buyTokenPoolBalance + investmentAmountMinusFees - endingOutcomeBalance;
    }

    /**
     * Calculate the amount of outcome-tokens able to buy using the investment amount
     *
     * @param dbClient {Client}
     * @param investmentAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcBuyChain = async (dbClient, investmentAmount, outcome) => {
        const poolBalances = await this.getPoolBalancesChain(dbClient);
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const investmentAmountMinusFees = investmentAmount - Math.ceil(investmentAmount * this.fee);
        const buyTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = buyTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance + investmentAmountMinusFees));
            }
        }

        return buyTokenPoolBalance + investmentAmountMinusFees - endingOutcomeBalance;
    }

    /**
     * Calculate the amount of outcome-tokens required to sell for the requested return amount
     *
     * @param dbClient {Client}
     * @param returnAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcSellChain = async (dbClient, returnAmount, outcome) => {
        const poolBalances = await this.getPoolBalancesChain(dbClient);
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const returnAmountPlusFees = returnAmount + (returnAmount * this.fee);
        const sellTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance - returnAmountPlusFees));
            }
        }

        return returnAmountPlusFees + endingOutcomeBalance - sellTokenPoolBalance;
    }

    /**
     * Calculate the amount of outcome-tokens required to sell for the requested return amount
     *
     * @param returnAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcSellOfBalance = async (poolBalances, returnAmount, outcome) => {
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const returnAmountPlusFees = returnAmount + (returnAmount * this.fee);
        const sellTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance - returnAmountPlusFees));
            }
        }

        return returnAmountPlusFees + endingOutcomeBalance - sellTokenPoolBalance;
    }

    /**
     * Calculate the amount of outcome-tokens required to sell for the requested return amount
     *
     * @param returnAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcSell = async (returnAmount, outcome) => {
        const poolBalances = await this.getPoolBalances();
        const outcomeKey = this.getOutcomeKey(outcome);

        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        const returnAmountPlusFees = returnAmount + (returnAmount * this.fee);
        const sellTokenPoolBalance = poolBalances[outcomeKey];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcomeKey) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance - returnAmountPlusFees));
            }
        }

        return returnAmountPlusFees + endingOutcomeBalance - sellTokenPoolBalance;
    }

    /**
     * Calculate the amount of EVNT-tokens returned for the requested sell amount
     *
     * @param sellAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcSellFromAmount = async (sellAmount, outcome) => {
        const poolBalances = await this.getPoolBalances();
        const outcomeToken = this.getOutcomeTokens()[outcome];

        const marginalR = Math.ceil(await this.calcSellOfBalance(poolBalances, this.collateralToken.ONE, outcome));
        const marginalPrice = Math.ceil(outcomeToken.ONE / marginalR);

        let maximumRange = marginalPrice * sellAmount
        let minimumRange = 0
        let midRange = 0;
        let oldMidRange = 0;

        while (minimumRange <= maximumRange) {
            midRange = Math.ceil((minimumRange + maximumRange) / 2)

            const approxSell = Math.ceil(await this.calcSellOfBalance(poolBalances, midRange, outcome));
            if (approxSell === sellAmount || (approxSell < sellAmount && sellAmount - approxSell <= 1)) {
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
     * Calculate the amount of EVNT-tokens returned for the requested sell amount
     *
     * @param dbClient {Client}
     * @param sellAmount {number}
     * @param outcome {number}
     * @returns {Promise<number>}
     */
    calcSellFromAmountChain = async (dbClient, sellAmount, outcome) => {
        const poolBalances = await this.getPoolBalancesChain(dbClient);
        const outcomeToken = this.getOutcomeTokens()[outcome];

        const marginalR = Math.ceil(await this.calcSellOfBalance(poolBalances, this.collateralToken.ONE, outcome));
        const marginalPrice = Math.ceil(outcomeToken.ONE / marginalR);

        let maximumRange = marginalPrice * sellAmount
        let minimumRange = 0
        let midRange = 0;
        let oldMidRange = 0;

        while (minimumRange <= maximumRange) {
            midRange = Math.ceil((minimumRange + maximumRange) / 2)

            const approxSell = Math.ceil(await this.calcSellOfBalance(poolBalances, midRange, outcome));
            if (approxSell === sellAmount || (approxSell < sellAmount && sellAmount - approxSell <= 1)) {
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
     * @param investmentAmount {number}
     * @param outcome {number}
     * @param minOutcomeTokensToBuy {number}
     * @returns {Promise<any>}
     */
    buy = async (buyer, investmentAmount, outcome, minOutcomeTokensToBuy) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {

            const outcomeTokensToBuy = await this.calcBuyChain(dbClient, investmentAmount, outcome);
            const feeAmount = Math.ceil(investmentAmount * this.fee);
            const outcomeToken = this.getOutcomeTokens()[outcome];

            if (outcomeTokensToBuy < minOutcomeTokensToBuy) {
                throw new NoWeb3Exception("Minimum buy amount not reached");
            }

            await this.collateralToken.transferChain(dbClient, buyer, this.walletId, investmentAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);
            await outcomeToken.transferChain(dbClient, this.walletId, buyer, outcomeTokensToBuy);

            await insertAMMInteraction(dbClient, buyer, this.betId, outcome, "BUY", investmentAmount, feeAmount, outcomeTokensToBuy, new Date());

            const newBalances = await this.getWalletBalancesChain(dbClient, buyer);
            newBalances['isInvested'] = this.isWalletInvestedOfBalance(newBalances);
            newBalances['boughtOutcomeTokens'] = outcomeTokensToBuy;
            newBalances['spendTokens'] = investmentAmount;

            await commitDBTransaction(dbClient);

            return newBalances;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     *
     * @param seller {String}
     * @param returnAmount {number}
     * @param outcome {number}
     * @param maxOutcomeTokensToSell {number}
     * @returns {Promise<any>}
     */
    sell = async (seller, returnAmount, outcome, maxOutcomeTokensToSell) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {

            const outcomeTokensToSell = await this.calcSellChain(dbClient, returnAmount, outcome);
            const feeAmount = Math.ceil(returnAmount * this.fee);
            const outcomeToken = this.getOutcomeTokens()[outcome];

            if (outcomeTokensToSell > maxOutcomeTokensToSell) {
                throw new NoWeb3Exception("Maximum sell amount surpassed");
            }

            await outcomeToken.transferChain(dbClient, seller, this.walletId, outcomeTokensToSell);
            await this.collateralToken.transferChain(dbClient, this.walletId, seller, returnAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);

            await insertAMMInteraction(dbClient, seller, this.betId, outcome, "SELL", returnAmount, feeAmount, outcomeTokensToSell, new Date());

            const newBalances = await this.getWalletBalancesChain(dbClient, seller);
            newBalances['isInvested'] = this.isWalletInvestedOfBalance(newBalances);
            newBalances['soldOutcomeTokens'] = outcomeTokensToSell;
            newBalances['earnedTokens'] = returnAmount;

            await commitDBTransaction(dbClient);

            return newBalances;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     *
     * @param seller {String}
     * @param sellAmount {number}
     * @param outcome {number}
     * @param minReturnAmount {number}
     * @returns {Promise<any>}
     */
    sellAmount = async (seller, sellAmount, outcome, minReturnAmount) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {
            const returnAmount = await this.calcSellFromAmountChain(dbClient, sellAmount, outcome);
            const feeAmount = Math.ceil(returnAmount * this.fee);
            const outcomeToken = this.getOutcomeTokens()[outcome];

            if (returnAmount < minReturnAmount) {
                throw new NoWeb3Exception("Minimum return amount not reached");
            }

            await outcomeToken.transferChain(dbClient, seller, this.walletId, sellAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, seller, returnAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);

            await insertAMMInteraction(dbClient, seller, this.betId, outcome, "SELL", returnAmount, feeAmount, sellAmount, new Date());

            const newBalances = await this.getWalletBalancesChain(dbClient, seller);
            newBalances['isInvested'] = this.isWalletInvestedOfBalance(newBalances);
            newBalances['soldOutcomeTokens'] = sellAmount;
            newBalances['earnedTokens'] = returnAmount;

            await commitDBTransaction(dbClient);

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
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }
}

module.exports = Bet;
