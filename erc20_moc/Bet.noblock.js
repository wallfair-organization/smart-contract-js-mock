const ERC20 = require('./Erc20.noblock');
const NoWeb3Exception = require('./Exception.noblock');
const Wallet = require("./Wallet.noblock");
const {
    createDBTransaction,
    rollbackDBTransaction,
    commitDBTransaction,
    insertAMMInteraction,
    viewAllBalancesOfToken,
    getAllBalancesOfToken,
    insertReportChain,
    insertReport, viewReport
} = require('../utils/db_helper');

const COLLATERAL_TOKEN = 'EVNT';
const WALLET_PREFIX = 'BET_';
const FEE_WALLET_PREFIX = 'FEE_';


class Bet {
    /**
     * Create a Moc Bet instance
     *
     * @param betId {string}
     * @param outcomes {number}
     */
    constructor(betId, outcomes) {
        this.betId = betId;
        this.fee = 0.01;
        this.walletId = WALLET_PREFIX + betId;
        this.feeWalletId = FEE_WALLET_PREFIX + betId;
        this.outcomes = outcomes || 2;
        this.collateralToken = new ERC20(COLLATERAL_TOKEN);
        this.ONE = this.collateralToken.ONE;
    }

    /**
     * Get the symbol of a Outcome Token
     *
     * @param outcome {number}
     * @returns {string}
     */
    getOutcomeKey = (outcome) => outcome.toString() + '_' + this.betId;

    /**
     * Get a List with all Outcome Tokens as ERC20
     *
     * @returns {*[]}
     */
    getOutcomeTokens = () => {
        const tokens = [];
        for (let i = 0; i < this.outcomes; i++) {
            tokens.push(new ERC20(this.getOutcomeKey(i)))
        }
        return tokens;
    }

    /**
     * Get the ERC20 of the Outcome index
     *
     * @param index {number}
     * @returns {ERC20}
     */
    getOutcomeToken = (index) => this.getOutcomeTokens()[index];

    /**
     * Get the OutcomeToken-Balances of the Market Maker
     *
     * @returns {Promise<{}>}
     */
    getPoolBalances = async () => await this.getWalletBalances(this.walletId);

    /**
     * Get the OutcomeToken-Balances of the Market Maker
     * Build for Transactions
     *
     * @param dbClient {Client}
     * @returns {Promise<{}>}
     */
    getPoolBalancesChain = async (dbClient) => await this.getWalletBalancesChain(dbClient, this.walletId);

    /**
     * Get all Investors of a Outcome
     *
     * @param outcome {number}
     * @returns {Promise<*>}
     */
    getInvestorsOfOutcome = async (outcome) => await viewAllBalancesOfToken(this.getOutcomeKey(outcome));

    /**
     * Get the OutcomeToken-Balances of a user
     *
     * @param userId {string}
     * @returns {Promise<{}>}
     */
    getWalletBalances = async (userId) => {
        const balances = {};
        const tokens = this.getOutcomeTokens();
        for (const token of tokens) {
            balances[token.symbol] = await token.balanceOf(userId);
        }
        return balances;
    }

    /**
     * Get the OutcomeToken-Balances of a user
     * Build for Transactions
     *
     * @param dbClient {Client}
     * @param userId {string}
     * @returns {Promise<{}>}
     */
    getWalletBalancesChain = async (dbClient, userId) => {
        const balances = {};
        const tokens = this.getOutcomeTokens();
        for (const token of tokens) {
            balances[token.symbol] = await token.balanceOfChain(dbClient, userId);
        }
        return balances;
    }

    /**
     * Check if a User has invested in this bet
     *
     * @param userId {string}
     * @returns {Promise<boolean>}
     */
    isWalletInvested = async (userId) => {
        const balances = await this.getWalletBalances(userId);
        return this.isWalletInvestedOfBalance(balances);
    }

    /**
     * Check if any of the balances is larger than 0
     *
     * @param balances {{}}
     * @returns {boolean}
     */
    isWalletInvestedOfBalance = (balances) => {
        for (const balance of Object.values(balances)) {
            if (balance > 0n) return true;
        }
        return false;
    }

    /**
     * Add more Liquidity to this bet
     *
     * @param provider {string}
     * @param amount {bigint}
     * @returns {Promise<void>}
     */
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
     * @param buyer {string}
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
     * @param seller {string}
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
     * @param seller {string}
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
     * @param reporter {string}
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
     *
     * @param dbClient {Client}
     * @param outcomeToken {ERC20}
     * @param beneficiary {string}
     * @returns {Promise<bigint>}
     * @private
     */
    _payoutChain = async (dbClient, outcomeToken, beneficiary) => {
        const outcomeBalance = await outcomeToken.balanceOfChain(dbClient, beneficiary);
        await outcomeToken.burnChain(dbClient, beneficiary, outcomeBalance);
        await this.collateralToken.transferChain(dbClient, this.walletId, beneficiary, outcomeBalance);
        return outcomeBalance;
    }

    /**
     * Complete a Payout for a User
     *
     * @param beneficiary {string}
     * @returns {Promise<bigint>}
     */
    getPayout = async (beneficiary) => {
        if (!(await this.isResolved())) {
            throw new NoWeb3Exception("The Bet is not resolved yet!");
        }
        const outcome = (await this.getResult())['outcome'];
        const outcomeToken = this.getOutcomeTokens()[outcome];

        const dbClient = await createDBTransaction();

        try {
            const outcomeBalance = await this._payoutChain(dbClient, outcomeToken, beneficiary);

            await commitDBTransaction(dbClient);
            return outcomeBalance;
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    refund = async () => {
        const dbClient = await createDBTransaction();

        try {
            await insertReportChain(dbClient, this.betId, "Refund", -1, new Date());
            for (let outcome = 0; outcome < this.outcomes; outcome++) {
                const beneficiaries = (await getAllBalancesOfToken(dbClient, this.getOutcomeKey(outcome))).map(x => {
                    return {"owner": x.owner, "balance": BigInt(x.balance)}
                }).filter(x => !x.owner.startsWith(WALLET_PREFIX));

                for (const beneficiary of beneficiaries) {
                    const wallet = new Wallet(beneficiary.owner);
                    const refundAmount = await wallet.investmentBet(this.betId, outcome);
                    console.log(refundAmount);
                    await this.getOutcomeToken(outcome).burnChain(dbClient, beneficiary.owner, beneficiary.balance);
                    await this.collateralToken.mintChain(dbClient, wallet.walletId, refundAmount);
                }
            }

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     * Complete the Payout for a Batch of Users
     *
     * @param beneficiaries {string[]}
     * @returns {Promise<void>}
     */
    getBatchedPayout = async (beneficiaries) => {
        if (!(await this.isResolved())) {
            throw new NoWeb3Exception("The Bet is not resolved yet!");
        }
        const outcome = (await this.getResult())['outcome'];
        const outcomeToken = this.getOutcomeTokens()[outcome];

        const dbClient = await createDBTransaction();

        try {
            for (const beneficiary of beneficiaries) {
                await this._payoutChain(dbClient, outcomeToken, beneficiary);
            }

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    /**
     * Complete the Payout for a Batch of Users
     *
     * @param reporter {string}
     * @param outcome {number}
     * @returns {Promise<void>}
     */
    resolveAndPayout = async (reporter, outcome) => {
        if (outcome < 0 || outcome > this.outcomes) {
            throw new NoWeb3Exception("The outcome needs to be int the range between 0 and " + this.outcomes + ", but is \"" + outcome + "\"");
        }

        if (await this.isResolved()) {
            throw new NoWeb3Exception("The Bet is already resolved!");
        }

        const outcomeToken = this.getOutcomeTokens()[outcome];
        const dbClient = await createDBTransaction();

        await insertReportChain(dbClient, this.betId, reporter, outcome, new Date());

        const beneficiaries = (await getAllBalancesOfToken(dbClient, this.getOutcomeKey(outcome))).map(x => x.owner);

        try {
            for (const beneficiary of beneficiaries) {
                await this._payoutChain(dbClient, outcomeToken, beneficiary);
            }

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }
}

module.exports = Bet;
