const ERC20 = require('./Erc20.noblock');
const NoWeb3Exception = require('./Exception.noblock');
const bigDecimal = require("js-big-decimal");

const {
    CASINO_TRADE_STATE,
    createDBTransaction,
    rollbackDBTransaction,
    commitDBTransaction,
    insertCasinoTrade,
    lockOpenCasinoTrades,
    setCasinoTradeOutcomes,
    getCasinoTrades
} = require('../utils/db_helper');

const EVNT_TOKEN = 'EVNT';

class CasinoTrade {
    constructor(casinoWalletAddr) {
        this.casinoWalletAddr = casinoWalletAddr;
        this.CASINO_TRADE_STATE = CASINO_TRADE_STATE;
        this.EVNTToken = new ERC20(EVNT_TOKEN);
    }

    placeTrade = async (userWalletAddr, stakedAmount, crashFactor) => {
        const dbClient = await createDBTransaction();

        try {
            // in the same transaction, transfer the funds, and create the casino trade
            await this.EVNTToken.transferChain(dbClient, userWalletAddr, this.casinoWalletAddr, stakedAmount);
            await insertCasinoTrade(dbClient, userWalletAddr, crashFactor, stakedAmount);

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    lockOpenTrades = async (gameId) => {
        const dbClient = await createDBTransaction();

        try {
            await lockOpenCasinoTrades(dbClient, gameId);

            await commitDBTransaction(dbClient);
        } catch (e) {
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }

    rewardWinners = async (gameId, decidedCrashFactor) => {
        const dbClient = await createDBTransaction();

        try {
            await setCasinoTradeOutcomes(dbClient, gameId, decidedCrashFactor);
            let winners = await getCasinoTrades(dbClient, gameId, CASINO_TRADE_STATE.WIN);
            for (let winner of winners) {
                let reward = bigDecimal.multiply(BigInt(winner.stakedamount), parseFloat(winner.crashfactor));
                reward = BigInt(bigDecimal.round(reward));
                winner.reward = reward;

                await this.EVNTToken.transferChain(dbClient, this.casinoWalletAddr, winner.userid, reward);
            }

            await commitDBTransaction(dbClient);
            return winners;
        } catch (e) {
            console.log(e);
            await rollbackDBTransaction(dbClient);
            throw e;
        }
    }
}

module.exports = CasinoTrade;