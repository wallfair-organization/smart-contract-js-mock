const ERC20 = require('./Erc20.noblock');
const bigDecimal = require('js-big-decimal');
const {
  createDBTransaction,
  commitDBTransaction,
  rollbackDBTransaction
} = require('@wallfair.io/wallfair-commons').utils;
const {
  CASINO_TRADE_STATE,
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
  insertCasinoSingleGameTrade,
  getLastCasinoTradesByGameType,
  getLastMatchByGameType,
  createMinesMatch,
  getUsersMinesMatch,
  updateUsersMinesMatch,
  getFairRecord,
  createFairRecord,
  updateFairRecord,
  incrementFairNonce,
  getTradeWithFairness
} = require('../utils/db_helper');

const WFAIR_TOKEN = 'WFAIR';

class CasinoTrade {
  constructor(casinoWalletAddr) {
    this.casinoWalletAddr = casinoWalletAddr;
    this.CASINO_TRADE_STATE = CASINO_TRADE_STATE;
    this.WFAIRToken = new ERC20(WFAIR_TOKEN);
  }

  placeTrade = async (userWalletAddr, stakedAmount, crashFactor, gameId) => {
    if(!gameId) throw new Error('Game id is required to place a trade');
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
  placeSingleGameTrade = async (userWalletAddr, stakedAmount, multiplier, gameId, state, gameHash, riskFactor, fairnessId, fairnessNonce) => {
    const dbClient = await createDBTransaction();

    try {
      const parsedMultiplier = parseFloat(multiplier);
      let reward = bigDecimal.multiply(BigInt(stakedAmount), parsedMultiplier);
      const totalReward = BigInt(bigDecimal.round(reward));
      const difference = totalReward - stakedAmount;

      if(difference < 0) {
        const amount = BigInt(bigDecimal.negate(difference));
        // lock rest funds
        await this.WFAIRToken.transferChain(
          dbClient,
          userWalletAddr,
          this.casinoWalletAddr,
          amount
        );
      } else {
        const amount = BigInt(difference);

        await this.WFAIRToken.transferChain(
          dbClient,
          this.casinoWalletAddr,
          userWalletAddr,
          amount
        );
      }

      await insertCasinoSingleGameTrade(dbClient, userWalletAddr, multiplier, stakedAmount, gameId, state, gameHash, riskFactor, fairnessId, fairnessNonce);

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

  lockOpenTrades = async (gameId, gameHash, crashFactor, gameLengthMS, currentHashLine) => {
    const dbClient = await createDBTransaction();

    try {
      await lockOpenCasinoTrades(dbClient, gameId, gameHash, crashFactor, gameLengthMS, currentHashLine);

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

  getBets = async (gameHash, gameId) => {
    if(!gameHash){
      const upcomingBets = await getUpcomingBets(gameId)
      return {cashedOutBets: [], upcomingBets, currentBets: []}
    }

    const cashedOutBets = await getCashedOutBets(gameHash)
    const upcomingBets = await getUpcomingBets(gameId)
    const currentBets = await getCurrentBets(gameHash)

    return { cashedOutBets, upcomingBets, currentBets }
  }

  getLuckyWins = async (lastHours, limit, gameId) => await getLuckyBetsInInterval(lastHours, limit, gameId)

  getHighWins = async (lastHours, limit, gameId) => await getHighBetsInInterval(lastHours, limit, gameId)

  getMatches = async (page, perPage, gameId) => await getMatches(page, perPage, gameId)

  getMatch = async (matchId) => getMatchById(matchId)

  getMatchByHash = async (gameHash, gameId) => getMatchByGameHash(gameHash, gameId)
  getMatchesForUpdateMissingValues = async () => getMatchesForUpdateMissingValues()

  updateMatchesMissingValues = async (gameHash) => updateMatchesMissingValues(gameHash)

  getUserPlayedLastXDaysInRow = async (userId, lastDays) => getUserPlayedLastXDaysInRow(userId, lastDays)

  getAllTradesByGameHash = async (gameHash, gameId) => getAllTradesByGameHash(gameHash, gameId)

  getNextMatchByGameHash = async (gameHash, gameId) => getNextMatchByGameHash(gameHash, gameId)
  getPrevMatchByGameHash = async (gameHash, gameId) => getPrevMatchByGameHash(gameHash, gameId)

  setLostTrades = async (gameHash, crashFactor) => setLostTrades(gameHash, crashFactor)

  getOpenTrade = async (userId, gameId) => getOpenTrade(userId, gameId)

  countTradesByLastXHours = async (lastHours) => countTradesByLastXHours(lastHours)

  getLastCasinoTradesByGameType = async (gameId, userId, limit) => getLastCasinoTradesByGameType(gameId, userId, limit)
  getLastMatchByGameType = async (gameId) => getLastMatchByGameType(gameId)

  createMinesMatch = async (gameId, userId, stakedAmount, gameHash, gamePayload) => {
    const dbClient = await createDBTransaction();
    try{
      await this.WFAIRToken.transferChain(
        dbClient,
        userId,
        this.casinoWalletAddr,
        stakedAmount
      );
      await createMinesMatch(dbClient, userId, stakedAmount, gameId, gameHash, JSON.stringify(gamePayload));
      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  }

  getUsersMinesMatch = async (userId) => {
    if(!userId) throw 'No userId provided';
    const res = await getUsersMinesMatch(userId);
    if(!res) return null;
    return res;
  }

  updateUsersMinesMatch = async (userId, gamePayload, isLost) => {
    if(!userId) throw 'No userId provided';
    const res = await getUsersMinesMatch(userId);
    if(!res) throw 'Match not found'
    return await updateUsersMinesMatch(res.id, gamePayload, isLost)
  }

  getFairRecord = async (userId, gameId) => getFairRecord(userId, gameId)
  createFairRecord = async (userId, gameId, serverSeed, nextServerSeed, clientSeed, nonce, currentHashLine) => createFairRecord(userId, gameId, serverSeed, nextServerSeed, clientSeed, nonce, currentHashLine)
  updateFairRecord = async (userId, gameId, serverSeed, clientSeed, nonce, currentHashLine) => updateFairRecord(userId, gameId, serverSeed, clientSeed, nonce, currentHashLine)
  incrementFairNonce = async (userId, gameId) => incrementFairNonce(userId, gameId)
  getTradeWithFairness = async (gameHash, gameId) => getTradeWithFairness(gameHash, gameId)
}

module.exports = CasinoTrade;
