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
  getMatchById,
  getMatchByGameHash,
  getMatchesForUpdateMissingValues,
  updateMatchesMissingValues,
  getUserPlayedLastXDaysInRow,
  getAllTradesByGameHash,
  getNextMatchByGameHash,
  getPrevMatchByGameHash,
  setLostTrades,
  getOpenTrade,
  countTradesByLastXHours,
  insertCasinoSingleGameTrade
} = require('../utils/db_helper');

const WFAIR_TOKEN = 'WFAIR';

class CasinoTrade {
  constructor(casinoWalletAddr) {
    this.casinoWalletAddr = casinoWalletAddr;
    this.CASINO_TRADE_STATE = CASINO_TRADE_STATE;
    this.WFAIRToken = new ERC20(WFAIR_TOKEN);
  }

  placeTrade = async (userWalletAddr, stakedAmount, crashFactor, gameId) => {
    const dbClient = await createDBTransaction();

    try {
      // in the same transaction, transfer the funds, and create the casino trade
      await this.WFAIRToken.transferChain(
        dbClient,
        userWalletAddr,
        this.casinoWalletAddr,
        stakedAmount
      );
      await insertCasinoTrade(dbClient, userWalletAddr, crashFactor, stakedAmount, gameId);

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };


  /**
   * For simple games, so we can insert all at once to casino_trades.
   * Handle won / lost for single trades
   */
  placeSingleGameTrade = async (userWalletAddr, stakedAmount, multiplier, gameId, state, gameHash) => {
    const dbClient = await createDBTransaction();

    try {
      if(state === CASINO_TRADE_STATE.LOSS) {
        // if user lost, just transfer the funds to casino
        await this.WFAIRToken.transferChain(
            dbClient,
            userWalletAddr,
            this.casinoWalletAddr,
            stakedAmount
        );
      }

      if(state === CASINO_TRADE_STATE.WIN) {
        // if user won, stakedamount*multiplier as reward for the user
        let reward = bigDecimal.multiply(BigInt(stakedAmount), parseFloat(multiplier));
        const totalReward = BigInt(bigDecimal.round(reward));
        await this.WFAIRToken.transferChain(
            dbClient,
            this.casinoWalletAddr,
            userWalletAddr,
            totalReward
        );
      }

      await insertCasinoSingleGameTrade(dbClient, userWalletAddr, multiplier, stakedAmount, gameId, state, gameHash);

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

  getBets = async (gameHash) => {
    if(!gameHash){
      const upcomingBets = await getUpcomingBets()
      return {cashedOutBets: [], upcomingBets, currentBets: []}
    }

    const cashedOutBets = await getCashedOutBets(gameHash)
    const upcomingBets = await getUpcomingBets()
    const currentBets = await getCurrentBets(gameHash)

    return {cashedOutBets, upcomingBets, currentBets}
  }

  getLuckyWins = async (lastHours, limit, gameId) => await getLuckyBetsInInterval(lastHours, limit, gameId)

  getHighWins = async (lastHours, limit, gameId) => await getHighBetsInInterval(lastHours, limit, gameId)

  getMatches = async (page, perPage, gameId) => await getMatches(page, perPage, gameId)

  getMatch = async (matchId) => getMatchById(matchId)

  getMatchByHash = async (gameHash) => getMatchByGameHash(gameHash)
  getMatchesForUpdateMissingValues = async () => getMatchesForUpdateMissingValues()

  updateMatchesMissingValues = async (gameHash) => updateMatchesMissingValues(gameHash)

  getUserPlayedLastXDaysInRow = async (userId, lastDays) => getUserPlayedLastXDaysInRow(userId, lastDays)

  getAllTradesByGameHash = async (gameHash) => getAllTradesByGameHash(gameHash)

  getNextMatchByGameHash = async (gameHash, gameId) => getNextMatchByGameHash(gameHash, gameId)
  getPrevMatchByGameHash = async (gameHash, gameId) => getPrevMatchByGameHash(gameHash, gameId)

  setLostTrades = async (gameHash, crashFactor) => setLostTrades(gameHash, crashFactor)

  getOpenTrade = async (userId, gameId) => getOpenTrade(userId, gameId)

  countTradesByLastXHours = async (lastHours) => countTradesByLastXHours(lastHours)
}

module.exports = CasinoTrade;
