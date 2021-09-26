const ERC20 = require('./Erc20.noblock');
const bigDecimal = require('js-big-decimal');

const {
  CASINO_TRADE_STATE,
  createDBTransaction,
  rollbackDBTransaction,
  commitDBTransaction,
  insertCasinoTrade,
  lockOpenCasinoTrades,
  setCasinoTradeOutcomes,
  getCasinoTrades,
  attemptCashout,
} = require('../utils/db_helper');

const WFAIR_TOKEN = 'WFAIR';

class CasinoTrade {
  constructor(casinoWalletAddr) {
    this.casinoWalletAddr = casinoWalletAddr;
    this.CASINO_TRADE_STATE = CASINO_TRADE_STATE;
    this.WFAIRToken = new ERC20(WFAIR_TOKEN);
  }

  placeTrade = async (userWalletAddr, stakedAmount, crashFactor) => {
    const dbClient = await createDBTransaction();

    try {
      // in the same transaction, transfer the funds, and create the casino trade
      await this.WFAIRToken.transferChain(
        dbClient,
        userWalletAddr,
        this.casinoWalletAddr,
        stakedAmount
      );
      await insertCasinoTrade(
        dbClient,
        userWalletAddr,
        crashFactor,
        stakedAmount
      );

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  lockOpenTrades = async (gameId) => {
    const dbClient = await createDBTransaction();

    try {
      await lockOpenCasinoTrades(dbClient, gameId);

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  cashout = async (userWalletAddr, crashFactor, gameId) => {
    const dbClient = await createDBTransaction();

    try {
      let res = await attemptCashout(dbClient, userwalletAddr, gameId, crashFactor);

      if (res.rows.length == 0) {
        throw "Transaction did not succeed";
      }

      let totalReward = 0;

      for (let row of res.rows) {
        let { stakedamount } = row;
        let reward = bigDecimal.multiply(
          BigInt(stakedamount),
          parseFloat(crashFactor)
        );
        reward = BigInt(bigDecimal.round(reward));
        totalReward += reward;
      }

      if (totalReward > 0) {
        await this.WFAIRToken.transferChain(
          dbClient,
          this.casinoWalletAddr,
          userWalletAddr,
          totalReward
        );
        await commitDBTransaction(dbClient);
        return totalReward;
      } else {
        await rollbackDBTransaction(dbClient);
      }

    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  rewardWinners = async (gameId, decidedCrashFactor) => {
    const dbClient = await createDBTransaction();

    try {
      await setCasinoTradeOutcomes(dbClient, gameId, decidedCrashFactor);
      let winners = await getCasinoTrades(
        dbClient,
        gameId,
        CASINO_TRADE_STATE.WIN
      );
      for (let winner of winners) {
        let reward = bigDecimal.multiply(
          BigInt(winner.stakedamount),
          parseFloat(winner.crashfactor)
        );
        reward = BigInt(bigDecimal.round(reward));
        winner.reward = reward;

        await this.WFAIRToken.transferChain(
          dbClient,
          this.casinoWalletAddr,
          winner.userid,
          reward
        );
      }

      await commitDBTransaction(dbClient);
      return winners;
    } catch (e) {
      console.log(e);
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };
}

module.exports = CasinoTrade;
