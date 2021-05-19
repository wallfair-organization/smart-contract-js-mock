const ERC20 = require('./Erc20.noblock');
const NoWeb3Exception = require('./Exception.noblock');
const { insertReport, getReport } = require('../utils/db_helper');

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
    }

    addLiquidity = async (provider, amount) => {
        await this.collateralToken.transfer(provider, this.walletId, amount);
        await this.yesToken.mint(this.walletId, amount);
        await this.noToken.mint(this.walletId, amount);
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

        const investmentAmountMinusFees = investmentAmount - (investmentAmount * this.fee);
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
        const outcomeTokensToBuy = await this.calcBuy(investmentAmount, outcome);
        const feeAmount = investmentAmount * this.fee;
        const outcomeToken = { "yes": this.yesToken, "no": this.noToken }[outcome];

        if (outcomeTokensToBuy < minOutcomeTokensToBuy) {
            throw new NoWeb3Exception("Minimum buy amount not reached");
        }

        await this.collateralToken.transfer(buyer, this.walletId, investmentAmount);
        await this.collateralToken.transfer(this.walletId, this.feeWalletId, feeAmount);
        await outcomeToken.transfer(this.walletId, buyer, outcomeTokensToBuy);
    }

    getResult = async () => {
        const result = await getReport(this.betId);
        if (result.length === 0) {
            throw new NoWeb3Exception("The Bet is not resolved yet!");
        } else if (result.length > 1) {
            throw new NoWeb3Exception("The Bet is invalidly resolved!");
        }
        return result[0];
    }

    isResolved = async () => {
        const result = await getReport(this.betId);
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
        const outcomeToken = { "yes": this.yesToken, "no": this.noToken }[outcome];

        const outcomeBalance = await outcomeToken.balanceOf(beneficiary);

        await outcomeToken.burn(beneficiary, outcomeBalance);
        await this.collateralToken.transfer(this.walletId, beneficiary, outcomeBalance);

    }
}

module.exports = Bet;
