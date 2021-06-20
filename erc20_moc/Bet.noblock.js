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

const YES_TOKEN_PREFIX = "YES_";
const NO_TOKEN_PREFIX = "NO_";
const WALLET_PREFIX = "BET_";
const FEE_WALLET_PREFIX = "FEE_";


class Bet {
    constructor(betId) {
        this.betId = betId;
        this.fee = 0.01;
        this.walletId = WALLET_PREFIX + betId;
        this.feeWalletId = FEE_WALLET_PREFIX + betId;
        this.yesToken = new ERC20(YES_TOKEN_PREFIX + this.betId);
        this.noToken = new ERC20(NO_TOKEN_PREFIX + this.betId);
        this.collateralToken = new ERC20(COLLATERAL_TOKEN);
        this.ONE = this.collateralToken.ONE;
    }

    addLiquidity = async (provider, amount) => {
        const dbClient = await createDBTransaction();
        try {
            await this.collateralToken.transferChain(dbClient, provider, this.walletId, amount);
            await this.yesToken.mintChain(dbClient, this.walletId, amount);
            await this.noToken.mintChain(dbClient, this.walletId, amount);

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
     * @param outcome {"yes" | "no"}
     * @returns {Promise<number>}
     */
    calcBuy = async (investmentAmount, outcome) => {
        const poolBalances = {
            "yes": await this.yesToken.balanceOf(this.walletId),
            "no": await this.noToken.balanceOf(this.walletId),
        };

        if (!Object.keys(poolBalances).includes(outcome)) {
            throw new NoWeb3Exception("The outcome needs to be either \"yes\" or \"no\", but is \"" + outcome + "\"");
        }

        const investmentAmountMinusFees = investmentAmount - Math.ceil(investmentAmount * this.fee);
        const buyTokenPoolBalance = poolBalances[outcome];
        let endingOutcomeBalance = buyTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcome) {
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
     * @param outcome {"yes" | "no"}
     * @returns {Promise<number>}
     */
    calcBuyChain = async (dbClient, investmentAmount, outcome) => {
        const poolBalances = {
            "yes": await this.yesToken.balanceOfChain(dbClient, this.walletId),
            "no": await this.noToken.balanceOfChain(dbClient, this.walletId),
        };

        if (!Object.keys(poolBalances).includes(outcome)) {
            throw new NoWeb3Exception("The outcome needs to be either \"yes\" or \"no\", but is \"" + outcome + "\"");
        }

        const investmentAmountMinusFees = investmentAmount - Math.ceil(investmentAmount * this.fee);
        const buyTokenPoolBalance = poolBalances[outcome];
        let endingOutcomeBalance = buyTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcome) {
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
     * @param outcome {"yes" | "no"}
     * @returns {Promise<number>}
     */
    calcSellChain = async (dbClient, returnAmount, outcome) => {
        const poolBalances = {
            "yes": await this.yesToken.balanceOfChain(dbClient, this.walletId),
            "no": await this.noToken.balanceOfChain(dbClient, this.walletId),
        };

        if (!Object.keys(poolBalances).includes(outcome)) {
            throw new NoWeb3Exception("The outcome needs to be either \"yes\" or \"no\", but is \"" + outcome + "\"");
        }

        const returnAmountPlusFees = returnAmount + (returnAmount * this.fee);
        const sellTokenPoolBalance = poolBalances[outcome];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcome) {
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
     * @param outcome {"yes" | "no"}
     * @returns {Promise<number>}
     */
    calcSell = async (returnAmount, outcome) => {
        const poolBalances = {
            "yes": await this.yesToken.balanceOf(this.walletId),
            "no": await this.noToken.balanceOf(this.walletId),
        };

        if (!Object.keys(poolBalances).includes(outcome)) {
            throw new NoWeb3Exception("The outcome needs to be either \"yes\" or \"no\", but is \"" + outcome + "\"");
        }

        const returnAmountPlusFees = returnAmount + (returnAmount * this.fee);
        const sellTokenPoolBalance = poolBalances[outcome];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcome) {
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
     * @param outcome {"yes" | "no"}
     * @returns {Promise<number>}
     */
    calcSellFromAmount = async (sellAmount, outcome) => {
        const outcomeToken = {"yes": this.yesToken, "no": this.noToken}[outcome];

        const precision = 5;
        const marginalR = Math.ceil(await this.calcSell(this.collateralToken.ONE, outcome));
        const marginalPrice = Math.ceil(outcomeToken.ONE / marginalR);

        let maximumRange = marginalPrice * sellAmount
        let minimumRange = 0
        let midRange = 0;

        while (minimumRange <= maximumRange) {
            midRange = Math.ceil((minimumRange + maximumRange) / 2)

            const approxSell = Math.ceil(await this.calcSell(midRange, outcome));
            if (approxSell === sellAmount || (approxSell < sellAmount && sellAmount - approxSell <= precision)) {
                break;
            }
            if (approxSell < sellAmount) {
                minimumRange = midRange
            } else {
                maximumRange = midRange
            }
        }

        return midRange;
    }

    /**
     * Calculate the amount of EVNT-tokens returned for the requested sell amount
     *
     * @param dbClient {Client}
     * @param sellAmount {number}
     * @param outcome {"yes" | "no"}
     * @returns {Promise<number>}
     */
    calcSellFromAmountChain = async (dbClient, sellAmount, outcome) => {
        const outcomeToken = {"yes": this.yesToken, "no": this.noToken}[outcome];

        const precision = 5;
        const marginalR = Math.ceil(await this.calcSellChain(dbClient, this.collateralToken.ONE, outcome));
        const marginalPrice = Math.ceil(outcomeToken.ONE / marginalR);

        let maximumRange = marginalPrice * sellAmount
        let minimumRange = 0
        let midRange = 0;

        while (minimumRange <= maximumRange) {
            midRange = Math.ceil((minimumRange + maximumRange) / 2)

            const approxSell = Math.ceil(await this.calcSellChain(dbClient, midRange, outcome));
            if (approxSell === sellAmount || (approxSell < sellAmount && sellAmount - approxSell <= precision)) {
                break;
            }
            if (approxSell < sellAmount) {
                minimumRange = midRange
            } else {
                maximumRange = midRange
            }
        }

        return midRange;
    }

    /**
     *
     * @param buyer {String}
     * @param investmentAmount {number}
     * @param outcome {"yes" | "no"}
     * @param minOutcomeTokensToBuy {number}
     * @returns {Promise<void>}
     */
    buy = async (buyer, investmentAmount, outcome, minOutcomeTokensToBuy) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {

            const outcomeTokensToBuy = await this.calcBuyChain(dbClient, investmentAmount, outcome);
            const feeAmount = Math.ceil(investmentAmount * this.fee);
            const outcomeToken = {"yes": this.yesToken, "no": this.noToken}[outcome];

            if (outcomeTokensToBuy < minOutcomeTokensToBuy) {
                throw new NoWeb3Exception("Minimum buy amount not reached");
            }

            await this.collateralToken.transferChain(dbClient, buyer, this.walletId, investmentAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);
            await outcomeToken.transferChain(dbClient, this.walletId, buyer, outcomeTokensToBuy);

            await insertAMMInteraction(dbClient, buyer, this.betId, outcome, "BUY", investmentAmount, feeAmount, outcomeTokensToBuy, new Date());

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     *
     * @param seller {String}
     * @param returnAmount {number}
     * @param outcome {"yes" | "no"}
     * @param maxOutcomeTokensToSell {number}
     * @returns {Promise<void>}
     */
    sell = async (seller, returnAmount, outcome, maxOutcomeTokensToSell) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {

            const outcomeTokensToSell = await this.calcSellChain(dbClient, returnAmount, outcome);
            const feeAmount = Math.ceil(returnAmount * this.fee);
            const outcomeToken = {"yes": this.yesToken, "no": this.noToken}[outcome];

            if (outcomeTokensToSell > maxOutcomeTokensToSell) {
                throw new NoWeb3Exception("Maximum sell amount surpassed");
            }

            await outcomeToken.transferChain(dbClient, seller, this.walletId, outcomeTokensToSell);
            await this.collateralToken.transferChain(dbClient, this.walletId, seller, returnAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);

            await insertAMMInteraction(dbClient, seller, this.betId, outcome, "SELL", returnAmount, feeAmount, outcomeTokensToSell, new Date());

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     *
     * @param seller {String}
     * @param sellAmount {number}
     * @param outcome {"yes" | "no"}
     * @param minReturnAmount {number}
     * @returns {Promise<void>}
     */
    sellAmount = async (seller, sellAmount, outcome, minReturnAmount) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const dbClient = await createDBTransaction();

        try {
            const returnAmount = await this.calcSellFromAmountChain(dbClient, sellAmount, outcome);
            const feeAmount = Math.ceil(sellAmount * this.fee);
            const outcomeToken = {"yes": this.yesToken, "no": this.noToken}[outcome];

            if (returnAmount < minReturnAmount) {
                throw new NoWeb3Exception("Minimum return amount not reached");
            }

            await outcomeToken.transferChain(dbClient, seller, this.walletId, sellAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, seller, returnAmount);
            await this.collateralToken.transferChain(dbClient, this.walletId, this.feeWalletId, feeAmount);

            await insertAMMInteraction(dbClient, seller, this.betId, outcome, "SELL", returnAmount, feeAmount, sellAmount, new Date());

            await commitDBTransaction(dbClient);
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
     * @param outcome { "yes" | "no" }
     * @returns {Promise<void>}
     */
    resolveBet = async (reporter, outcome) => {
        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }
        if (!["yes", "no"].includes(outcome)) {
            throw new NoWeb3Exception("The outcome needs to be either \"yes\" or \"no\", but is \"" + outcome + "\"");
        }
        await insertReport(this.betId, reporter, outcome, new Date());
    }

    getPayout = async (beneficiary) => {
        if (!(await this.isResolved())) {
            throw new NoWeb3Exception("The Bet is not resolved yet!");
        }
        const outcome = (await this.getResult())['outcome'];
        const outcomeToken = {"yes": this.yesToken, "no": this.noToken}[outcome];

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
