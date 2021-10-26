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
  // getCasinoTrades,
  attemptCashout,
  getCasinoTradesByUserAndStates,
  cancelCasinoTrade,
  getCashedOutBets,
  getUpcomingBets,
  getCurrentBets,
  getLuckyBetsInInterval,
  getHighBetsInInterval,
  getMatches,
  getMatchById
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
      await insertCasinoTrade(dbClient, userWalletAddr, crashFactor, stakedAmount);

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  cancelTrade = async (userWalletAddr, openTrade) => {
    const dbClient = await createDBTransaction();
    try {
      // reverse actions in placeTrade
      await this.WFAIRToken.transferChain(
        dbClient,
        this.casinoWalletAddr,
        userWalletAddr,
        parseInt(openTrade.stakedamount)
      );
      await cancelCasinoTrade(dbClient, openTrade.id);

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  lockOpenTrades = async (gameId, gameHash, crashFactor, gameLengthMS) => {
    const dbClient = await createDBTransaction();

    try {
      await lockOpenCasinoTrades(dbClient, gameId, gameHash, crashFactor, gameLengthMS);

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  cashout = async (userWalletAddr, crashFactor, gameHash) => {
    const dbClient = await createDBTransaction();

    try {
      let res = await attemptCashout(dbClient, userWalletAddr, crashFactor, gameHash);

      if (res.rows.length == 0) {
        throw 'Transaction did not succeed: Bet was not found';
      }

      let totalReward = 0n;
      let stakedAmount = 0n;

      for (let row of res.rows) {
        let { stakedamount } = row;
        let reward = bigDecimal.multiply(BigInt(stakedamount), parseFloat(crashFactor));
        reward = BigInt(bigDecimal.round(reward));
        totalReward += reward;

        stakedAmount += BigInt(stakedamount);
      }

      if (totalReward > 0n) {
        await this.WFAIRToken.transferChain(
          dbClient,
          this.casinoWalletAddr,
          userWalletAddr,
          totalReward
        );
        await commitDBTransaction(dbClient);

        return { totalReward, stakedAmount };
      } else {
        await rollbackDBTransaction(dbClient);
        throw `Total reward lower than 1: ${totalReward}`;
      }
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  rewardWinners = async (gameHash, decidedCrashFactor) => {
    const dbClient = await createDBTransaction();

    try {
      let result = await setCasinoTradeOutcomes(dbClient, gameHash, decidedCrashFactor);
      let winners = result.rows;
      /*let winners = await getCasinoTrades(
        dbClient,
        gameHash,
        CASINO_TRADE_STATE.WIN
      );*/
      for (let winner of winners) {
        let reward = bigDecimal.multiply(
          BigInt(winner.stakedamount),
          parseFloat(winner.crashfactor)
        );
        reward = BigInt(bigDecimal.round(reward));
        winner.reward = reward;

        await this.WFAIRToken.transferChain(dbClient, this.casinoWalletAddr, winner.userid, reward);
      }

      await commitDBTransaction(dbClient);
      return winners;
    } catch (e) {
      console.log(e);
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  getCasinoTradesByUserIdAndStates = async (userId, states) =>
    await getCasinoTradesByUserAndStates(userId, states);

  getBets = async (matchId) => {
    const cashedOutBets = await getCashedOutBets(matchId)
    const upcomingBets = await getUpcomingBets()
    const currentBets = await getCurrentBets(matchId)

    return {cashedOutBets, upcomingBets, currentBets}
  }

  getLuckyWins = async () => await getLuckyBetsInInterval('24 hours')

  getHighWins = async () => await getHighBetsInInterval('24 hours')

  getMatches = async () => await getMatches()

  getMatch = async (matchId) => getMatchById(matchId)

}

module.exports = CasinoTrade;
