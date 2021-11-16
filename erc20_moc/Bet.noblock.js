const ERC20 = require('./Erc20.noblock');
const NoWeb3Exception = require('./Exception.noblock');
const {
  createDBTransaction,
  commitDBTransaction,
  rollbackDBTransaction
} = require('@wallfair.io/wallfair-commons').utils;
const {
  DIRECTION,
  insertAMMInteraction,
  viewAllBalancesOfToken,
  getAllBalancesOfToken,
  insertReportChain,
  insertReport,
  viewReport,
  getBetInvestors,
  getBetInteractions,
  getBetInteractionsSummary,
  getBetInvestorsChain,
  getAmmPriceActions,
  getLatestPriceActions,
} = require('../utils/db_helper');
const { ceildiv } = require('../utils/utils');

const COLLATERAL_TOKEN = 'WFAIR';
const WALLET_PREFIX = 'BET_';
const FEE_WALLET_PREFIX = 'FEE_';
const OUTCOME_BET_REFUNDED = -1;

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
    this.walletId = betId;
    this.feeWalletId = FEE_WALLET_PREFIX + betId;
    this.outcomes = outcomes || 2;
    this.collateralToken = new ERC20(COLLATERAL_TOKEN);
    this.ONE = this.collateralToken.ONE;
    this.AMM_INTERACTION_TYPE = DIRECTION;
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
      tokens.push(new ERC20(this.getOutcomeKey(i)));
    }
    return tokens;
  };

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
  getPoolBalancesChain = async (dbClient) =>
    await this.getWalletBalancesChain(dbClient, this.walletId);

  /**
   * Get all Investors of a Outcome
   *
   * @param outcome {number}
   * @returns {Promise<*>}
   */
  getInvestorsOfOutcome = async (outcome) =>
    await viewAllBalancesOfToken(this.getOutcomeKey(outcome));

  /**
   * Get all Investors of a Bet, broken by interaction type
   *
   * @returns {Promise<*>}
   */
  getUserAmmInteractions = async () => await getBetInvestors(this.betId);

  /**
   * Get all Interactions of a Bet, broken by interaction type
   *
   * @returns {Promise<*>}
   */
  getBetInteractions = async (startDate, direction) =>
    await getBetInteractions(this.betId, startDate, direction);

  /**
   * Get all Price actions for a bet for time period (7days/30days/24hours)
   *
   * @returns {Promise<*>}
   */
  getAmmPriceActions = (timeOption) => getAmmPriceActions(this.betId, timeOption);

  /**
   * Get all Price actions for a bet for time period (7days/30days/24hours)
   *
   * @returns {Promise<*>}
   */
  getLatestPriceActions = () => getLatestPriceActions(this.betId);

  /**
   * Get Interactions Summary of a Bet until specific date, broken by direction type
   *
   * @returns {Promise<*>}
   */
  getBetInteractionsSummary = async (direction, endDate) =>
    await getBetInteractionsSummary(this.betId, direction, endDate);

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
      balances[token.symbol] = await token.balanceOf(userId, 'bet');
    }
    return balances;
  };

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
      balances[token.symbol] = await token.balanceOfChain(dbClient, userId, 'bet');
    }
    return balances;
  };

  /**
   * Check if a User has invested in this bet
   *
   * @param userId {string}
   * @returns {Promise<boolean>}
   */
  isWalletInvested = async (userId) => {
    const balances = await this.getWalletBalances(userId);
    return this.isWalletInvestedOfBalance(balances);
  };

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
  };

  /**
   * Add more Liquidity to this bet
   *
   * @param provider {string}
   * @param amount {bigint}
   * @param distributionHints {[bigint]}
   * @returns {Promise<void>}
   */
  addLiquidity = async (provider, amount, distributionHints) => {
    const dbClient = await createDBTransaction();
    try {
      const poolBalances = await this.getPoolBalancesChain(dbClient);
      const poolBalanceValues = Object.values(poolBalances);
      const totalOutcomesAmount = poolBalanceValues.reduce((p, c) => p + c, 0n);
      if (totalOutcomesAmount > 0 && distributionHints) {
        throw new Error(`BET-ID: ${this.walletId}: distributionHint may be used only on empty market`);
      }
      // use initial hint if pool balances empty
      const hints = totalOutcomesAmount > 0 ? poolBalanceValues : distributionHints;
      let sendBacksAmounts;
      if (hints) {
        if (hints.length !== this.outcomes) {
          throw new Error(`BET-ID: ${this.walletId}: number of hints ${hints.length} !== number of outcomes ${this.outcomes}`);
        }

        sendBacksAmounts = {}
        const maxHint = Object.values(hints).reduce((p, c) => c > p ? c : p, 0n);

        if (maxHint === 0n) {
          throw new Error(`BET-ID: ${this.walletId}: invalid distribution hint, max value is 0`);
        }

        for (let o = 0; o < hints.length; o += 1) {
          const remaining = (amount * hints[o]) / maxHint;
          if (remaining <= 0n) {
            throw new Error(`BET-ID: ${this.walletId}: invalid distribution at outcome ${o} amount ${a}`);
          }
          sendBacksAmounts[o] = amount - remaining;
          // console.log(`o: ${o} a: ${hints[o]} r: ${remaining} back: ${sendBacksAmounts[o]}`);
        }
      }
      // TODO: implement a method to transfer several tokens in one call (like batch transfer)
      // get the collateral from provides
      await this.collateralToken.transferChain(dbClient, provider, this.walletId, 'eth', 'bet', amount);

      // always mint the `amount` of every outcome tokens
      const tokens = this.getOutcomeTokens();
      for (const token of tokens) {
        await token.mintChain(dbClient, this.walletId, 'bet', amount);
      }

      // send back the tokens to make the market (new market) / keep the price constant (further adds)
      if (sendBacksAmounts) {
        for (const [o, a] of Object.entries(sendBacksAmounts)) {
          if (a > 0n) {
            const token = new ERC20(this.getOutcomeKey(o));
            await token.transferChain(dbClient, this.walletId, provider, 'bet', 'eth', a, 'WFAIR');
          }
        }
      }

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  /**
   * Some big boi BigInt Math to get the Fee Amount
   *
   * @param amount {bigint}
   * @returns {bigint}
   * @private
   */
  _getFee = (amount) => {
    return this.fee === 0.0 ? 0n : amount / BigInt(this.fee * 100) / 100n;
  };

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
      throw new NoWeb3Exception(
        'The outcome needs to be int the range between 0 and ' +
        this.outcomes +
        ', but is "' +
        outcome +
        '"'
      );
    }

    const investmentAmountMinusFees = investmentAmount - this._getFee(investmentAmount);
    const buyTokenPoolBalance = poolBalances[outcomeKey];
    // endingOutcomeBalance below we do a set multiplicalions on this value which are scaled this.ONE^2
    let endingOutcomeBalance = buyTokenPoolBalance * this.ONE;

    for (let i = 0; i < Object.keys(poolBalances).length; i++) {
      const poolBalanceKey = Object.keys(poolBalances)[i];
      if (poolBalanceKey !== outcomeKey) {
        const poolBalance = poolBalances[poolBalanceKey];
        endingOutcomeBalance =
          ceildiv(endingOutcomeBalance * poolBalance, poolBalance + investmentAmountMinusFees);
      }
    }
    const outcomeTokensAmount =
      buyTokenPoolBalance + investmentAmountMinusFees - ceildiv(endingOutcomeBalance, this.ONE);
    if (outcomeTokensAmount < 0) {
      throw new NoWeb3Exception(
        `Assert when buying: outcome token amount was negative: amount: ${investmentAmount} outcome: ${outcomeKey}`
      );
    }

    return outcomeTokensAmount;
  };

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
  };

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
  };

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
      throw new NoWeb3Exception(
        'The outcome needs to be int the range between 0 and ' +
        this.outcomes +
        ', but is "' +
        outcome +
        '"'
      );
    }
    const returnAmountPlusFees = returnAmount + this._getFee(returnAmount);
    const sellTokenPoolBalance = poolBalances[outcomeKey];
    // endingOutcomeBalance below we do a set multiplicalions on this value which are scaled this.ONE^2
    let endingOutcomeBalance = sellTokenPoolBalance * this.ONE;

    for (let i = 0; i < Object.keys(poolBalances).length; i++) {
      const poolBalanceKey = Object.keys(poolBalances)[i];
      if (poolBalanceKey !== outcomeKey) {
        const poolBalance = poolBalances[poolBalanceKey];
        // make sure we can actually compensate with other outcomes
        if (poolBalance <= returnAmountPlusFees) {
          throw new NoWeb3Exception(
            `You cannot sell ${returnAmountPlusFees} (with fees) which is more than ${poolBalance} in outcome ${poolBalanceKey}`
          );
        }
        endingOutcomeBalance =
          ceildiv(endingOutcomeBalance * poolBalance, poolBalance - returnAmountPlusFees);
      }
    }

    return returnAmountPlusFees + ceildiv(endingOutcomeBalance, this.ONE) - sellTokenPoolBalance;
  };

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
  };

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
  };

  /**
   * Calculate the amount of WFAIR-tokens returned for the requested sell amount
   *
   * @param sellAmount {bigint}
   * @param outcome {number}
   * @returns {Promise<bigint>}
   */
  calcSellFromAmount = async (sellAmount, outcome) => {
    const poolBalances = await this.getPoolBalances();
    return this._calcSellFromAmountOfBalance(poolBalances, sellAmount, outcome);
  };

  /**
   * Calculate the amount of WFAIR-tokens returned for the requested sell amount
   *
   * @param dbClient {Client}
   * @param sellAmount {bigint}
   * @param outcome {number}
   * @returns {Promise<bigint>}
   */
  calcSellFromAmountChain = async (dbClient, sellAmount, outcome) => {
    const poolBalances = await this.getPoolBalancesChain(dbClient);
    return this._calcSellFromAmountOfBalance(poolBalances, sellAmount, outcome);
  };

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

    const marginalR =
      this._calcSellOfBalance(poolBalances, this.collateralToken.ONE / 10n, outcome) - 1n;

    let maximumRange = (outcomeToken.ONE * sellAmount) / (marginalR * 10n);

    let minimumRange = 0n;
    let midRange = 0n;
    let oldMidRange = 0n;

    while (maximumRange - minimumRange > 1) {
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
        minimumRange = midRange;
      } else {
        maximumRange = midRange;
      }
      oldMidRange = midRange;
    }

    return midRange;
  };

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
      throw new NoWeb3Exception('The Bet is already resolved!');
    }

    const dbClient = await createDBTransaction();

    try {
      const outcomeTokensToBuy = await this.calcBuyChain(dbClient, investmentAmount, outcome);
      const feeAmount = this._getFee(investmentAmount);
      const tokens = this.getOutcomeTokens();
      const outcomeToken = tokens[outcome];

      if (outcomeTokensToBuy < minOutcomeTokensToBuy) {
        throw new NoWeb3Exception('Minimum buy amount not reached');
      }

      await this.collateralToken.transferChain(dbClient, buyer, this.walletId, 'usr', 'bet', investmentAmount);
      await this.collateralToken.transferChain(
        dbClient,
        this.walletId,
        this.feeWalletId,
        'bet',
        'bet',
        feeAmount
      );

      // mint new outcome tokens that correspond to increased collateral value
      for (const token of tokens) {
        await token.mintChain(dbClient, this.walletId, 'bet', investmentAmount - feeAmount);
      }

      // send out the outcome tokens to the buyer
      await outcomeToken.transferChain(dbClient, this.walletId, buyer, 'bet', 'bet', outcomeTokensToBuy);

      await insertAMMInteraction(
        dbClient,
        buyer,
        this.betId,
        outcome,
        DIRECTION.BUY,
        investmentAmount,
        feeAmount,
        outcomeTokensToBuy,
        new Date()
      );

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
  };

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
      throw new NoWeb3Exception('The Bet is already resolved!');
    }

    const dbClient = await createDBTransaction();

    try {
      const outcomeTokensToSell = await this.calcSellChain(dbClient, returnAmount, outcome);
      const feeAmount = this._getFee(returnAmount);
      const tokens = this.getOutcomeTokens();
      const outcomeToken = tokens[outcome];

      if (outcomeTokensToSell > maxOutcomeTokensToSell) {
        throw new NoWeb3Exception('Maximum sell amount surpassed');
      }
      await outcomeToken.transferChain(dbClient, seller, this.walletId, 'bet', 'bet', outcomeTokensToSell);

      await this.collateralToken.transferChain(dbClient, this.walletId, seller, 'bet', 'usr', returnAmount);
      await this.collateralToken.transferChain(
        dbClient,
        this.walletId,
        this.feeWalletId,
        'bet',
        'bet',
        feeAmount
      );

      // burn the outcome token corresponding to decreased collateral value
      for (const token of tokens) {
        await token.burnChain(dbClient, this.walletId, 'bet', returnAmount + feeAmount);
      }

      await insertAMMInteraction(
        dbClient,
        seller,
        this.betId,
        outcome,
        DIRECTION.SELL,
        returnAmount,
        feeAmount,
        outcomeTokensToSell,
        new Date()
      );

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
  };

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
      throw new NoWeb3Exception('The Bet is already resolved!');
    }

    const dbClient = await createDBTransaction();

    try {
      const returnAmount = await this.calcSellFromAmountChain(dbClient, sellAmount, outcome);
      const feeAmount = this._getFee(returnAmount);
      const outcomeToken = this.getOutcomeTokens()[outcome];

      if (returnAmount < minReturnAmount) {
        throw new NoWeb3Exception('Minimum return amount not reached');
      }

      await outcomeToken.transferChain(dbClient, seller, this.walletId, 'bet', 'bet', sellAmount);
      await this.collateralToken.transferChain(dbClient, this.walletId, seller, 'bet', 'usr', returnAmount);
      await this.collateralToken.transferChain(
        dbClient,
        this.walletId,
        this.feeWalletId,
        'bet',
        'bet',
        feeAmount
      );

      await insertAMMInteraction(
        dbClient,
        seller,
        this.betId,
        outcome,
        DIRECTION.SELL,
        returnAmount,
        feeAmount,
        sellAmount,
        new Date()
      );

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
  };

  getResult = async () => {
    const result = await viewReport(this.betId);
    if (result.length === 0) {
      throw new NoWeb3Exception('The Bet is not resolved yet!');
    } else if (result.length > 1) {
      throw new NoWeb3Exception('The Bet is invalidly resolved!');
    }
    return result[0];
  };

  isResolved = async () => {
    const result = await viewReport(this.betId);
    return result.length !== 0;
  };

  /**
   * @param reporter {string}
   * @param outcome { number }
   * @returns {Promise<void>}
   */
  resolveBet = async (reporter, outcome) => {
    if (await this.isResolved()) {
      throw new NoWeb3Exception('The Bet is already resolved!');
    }
    if (outcome < 0 || outcome > this.outcomes) {
      throw new NoWeb3Exception(
        'The outcome needs to be int the range between 0 and ' +
        this.outcomes +
        ', but is "' +
        outcome +
        '"'
      );
    }
    await insertReport(this.betId, reporter, outcome, new Date());
  };

  /**
   *
   * @param dbClient {Client}
   * @param outcomeToken {ERC20}
   * @param beneficiary {string}
   * @returns {Promise<bigint>}
   * @private
   */
  _payoutChain = async (dbClient, outcomeToken, beneficiary) => {
    const outcomeBalance = await outcomeToken.balanceOfChainForUpdate(dbClient, beneficiary, 'bet');
    await outcomeToken.burnChain(dbClient, beneficiary, 'bet', outcomeBalance);
    await this.collateralToken.transferChain(dbClient, this.walletId, beneficiary, 'bet', 'usr', outcomeBalance);

    await insertAMMInteraction(
      dbClient,
      beneficiary,
      this.betId,
      parseInt(outcomeToken.symbol.replace(this.betId, '')),
      DIRECTION.PAYOUT,
      outcomeBalance,
      0n,
      outcomeBalance,
      new Date()
    );

    return outcomeBalance;
  };

  /**
   * Complete a Payout for a User
   *
   * @param beneficiary {string}
   * @returns {Promise<bigint>}
   */
  getPayout = async (beneficiary) => {
    if (!(await this.isResolved())) {
      throw new NoWeb3Exception('The Bet is not resolved yet!');
    }

    const outcome = (await this.getResult())['outcome'];

    if (outcome === OUTCOME_BET_REFUNDED) {
      throw new NoWeb3Exception('The Bet has been refunded!');
    }

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
  };

  refund = async () => {
    if (await this.isResolved()) {
      throw new NoWeb3Exception('The Bet is already resolved!');
    }

    const dbClient = await createDBTransaction();

    try {
      await insertReportChain(dbClient, this.betId, 'Refund', OUTCOME_BET_REFUNDED, new Date());
      const ammInteractions = await getBetInvestorsChain(dbClient, this.betId);
      const beneficiaries = {};
      const notEligible = [];

      for (const interaction of ammInteractions) {
        const buyer = interaction.buyer;
        if (!notEligible.includes(buyer)) {
          let result = beneficiaries[buyer] || 0n;
          if (
            interaction.direction === DIRECTION.PAYOUT ||
            interaction.direction === DIRECTION.REFUND
          ) {
            notEligible.push(buyer);
          } else if (interaction.direction === DIRECTION.SELL) {
            result -= BigInt(interaction.amount);
          } else if (interaction.direction === DIRECTION.BUY) {
            result += BigInt(interaction.amount);
          }
          beneficiaries[buyer] = result;
        }
      }

      for (const beneficiary in beneficiaries) {
        const refundAmount = beneficiaries[beneficiary];
        if (refundAmount > 0) {
          await this.collateralToken.mintChain(dbClient, beneficiary, 'usr', refundAmount);

          await insertAMMInteraction(
            dbClient,
            beneficiary,
            this.betId,
            OUTCOME_BET_REFUNDED,
            DIRECTION.REFUND,
            refundAmount,
            0n,
            0n,
            new Date()
          );
        }
      }

      await commitDBTransaction(dbClient);
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };

  /**
   * Complete the Payout for a Batch of Users
   *
   * @param reporter {string}
   * @param outcome {number}
   * @returns {Promise<void>}
   */
  resolveAndPayout = async (reporter, outcome) => {
    if (outcome < 0 || outcome > this.outcomes) {
      throw new NoWeb3Exception(
        'The outcome needs to be int the range between 0 and ' +
        this.outcomes +
        ', but is "' +
        outcome +
        '"'
      );
    }

    if (await this.isResolved()) {
      throw new NoWeb3Exception('The Bet is already resolved!');
    }

    const outcomeToken = this.getOutcomeTokens()[outcome];
    const dbClient = await createDBTransaction();

    await insertReportChain(dbClient, this.betId, reporter, outcome, new Date());

    const results = await getAllBalancesOfToken(dbClient, this.getOutcomeKey(outcome));
    const beneficiaries = results.map((x) => x.owner_account);

    try {
      for (const beneficiary of beneficiaries) {
        await this._payoutChain(dbClient, outcomeToken, beneficiary);
      }

      await commitDBTransaction(dbClient);

      return results;
    } catch (e) {
      await rollbackDBTransaction(dbClient);
      throw e;
    }
  };
}

module.exports = Bet;
