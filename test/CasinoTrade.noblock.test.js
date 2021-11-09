require('dotenv').config();


describe("CasinoTrade", () => {


  const { setupDatabase, teardownDatabase, CASINO_TRADE_STATE } = require('../utils/db_helper');
  const ERC20 = require('../erc20_moc/Erc20.noblock');
  const Casino = require('../erc20_moc/CasinoTrade.noblock');

  const WFAIR = new ERC20('WFAIR');
  const casinoWallet = 'CASINO';
  var casino = new Casino(casinoWallet);
  const BASE_WALLET = 'playerWallet';
  const liquidityAmount = 1000000n * WFAIR.ONE;
  const NoWeb3Exception = require('../erc20_moc/Exception.noblock');

  jest.setTimeout(1000000);

  beforeAll(async () => {
    await setupDatabase();

  });

  afterAll(async () => teardownDatabase());

  beforeEach(async () => {
    //casino = new Casino(casinoWallet);

    //set-up a base number of tokens to be used in the tests
    await WFAIR.mint(casinoWallet, liquidityAmount);
    await WFAIR.mint(BASE_WALLET, 10000n * WFAIR.ONE);
  });
  afterEach(async () => {
    //resets number of tokens in casino and base wallet
    await WFAIR.burn(casinoWallet, await WFAIR.balanceOf(casinoWallet));
    await WFAIR.burn(BASE_WALLET, await WFAIR.balanceOf(BASE_WALLET));

    casino.lockOpenTrades("cleanupGame", "cleanupGame", 100, 100);
  });
  describe("Place a trade", () => {


    it("Place a succesful trade", async () => {
      const tradeAmount = 1000n * WFAIR.ONE;
      await casino.placeTrade(BASE_WALLET, tradeAmount, 1, "sucessfulTradeGame");

      expect(await WFAIR.balanceOf(casinoWallet)).toBe(liquidityAmount + tradeAmount)
      expect(await WFAIR.balanceOf(BASE_WALLET)).toBe(10000n * WFAIR.ONE - tradeAmount)
      expect(await casino.getCasinoTradesByUserIdAndStates(BASE_WALLET, [CASINO_TRADE_STATE.OPEN])).toHaveLength(1);
    });

    it("Throw an exception when there's no sender funds", async () => {
      //Validates that a NoWeb3Exception is thrown if sender has no money
      await expect(casino.placeTrade("noMoneyWallet", 150, 10, "noSenderFundsGame"))
        .rejects.toBeInstanceOf(NoWeb3Exception);

    });

    it("Throw an exception when no game Id is provided", async () => {
      await expect(casino.placeTrade(BASE_WALLET, 1000, 1)).rejects.toThrowError();

    });

  });

  describe("Cancel a Trade", () => {

    it("Successfully cancel an existing trade", async () => {
      const tradeAmount = 1000n * WFAIR.ONE;
      const wallet = 'cancelTradeWallet';
      WFAIR.mint(wallet, 10000n * WFAIR.ONE);
      await casino.placeTrade(wallet, tradeAmount, 1, "cancelTradeGame");

      const casinoTrade = (await casino.getCasinoTradesByUserIdAndStates(wallet, [CASINO_TRADE_STATE.OPEN]))[0];
      const { id } = casinoTrade;
      let openTrade = { stakedamount: tradeAmount, id: id };
      await casino.cancelTrade(wallet, openTrade);

      expect(await WFAIR.balanceOf(casinoWallet)).toBe(liquidityAmount)
      expect(await WFAIR.balanceOf(wallet)).toBe(10000n * WFAIR.ONE)
      expect(await casino.getCasinoTradesByUserIdAndStates(wallet, [CASINO_TRADE_STATE.CANCELED])).toHaveLength(1);
      expect(await casino.getCasinoTradesByUserIdAndStates(wallet, [CASINO_TRADE_STATE.OPEN])).toHaveLength(0);

    });

  });

  describe("Lock trades", () => {

    it("Sucessfully lock a trade", async () => {
      await WFAIR.mint("TestLockWallet", 10000n * WFAIR.ONE);
      const tradeAmount = 1000n * WFAIR.ONE;
      await casino.placeTrade("TestLockWallet", tradeAmount, 1, 'gameId');
      console.log(await casino.getCasinoTradesByUserIdAndStates("TestLockWallet", [CASINO_TRADE_STATE.OPEN]));

      await casino.lockOpenTrades('gameId', 'gameId', 3, 10000);
      console.log(await casino.getCasinoTradesByUserIdAndStates("TestLockWallet", [CASINO_TRADE_STATE.OPEN]));
      expect(await casino.getCasinoTradesByUserIdAndStates("TestLockWallet", [CASINO_TRADE_STATE.LOCKED])).toHaveLength(1);

    });

  });

  describe("Cashout money", () => {
    it("Sucessfully cashout money for one player", async () => {

      await WFAIR.mint(`${BASE_WALLET}_cashout`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_cashout`, 2000n * WFAIR.ONE, 3, 'gameIdSingle');

      await casino.lockOpenTrades('gameIdSingle', 'gameIdSingle', 3, 10000);

      const result = (await casino.cashout(`${BASE_WALLET}_cashout`, 3, 'gameIdSingle'));
      expect(result.totalReward).toBe(2000n * WFAIR.ONE * 3n);
      expect(result.stakedAmount).toBe(2000n * WFAIR.ONE);

    });

    //ToDo test for rounding cases, how does the reward is calculated if it's bigInt?

    it('Sucessfully cashout money for several players', async () => {

      for (let i = 1; i <= 5; i++) {
        // mint players with 5000 WFAIR balance
        await WFAIR.mint(`${BASE_WALLET}_${i}`, 5000n * WFAIR.ONE);

        // each player places a trade
        await casino.placeTrade(`${BASE_WALLET}_${i}`, 2000n * WFAIR.ONE, 3, 'gameIdMultiple');
      }

      // lock the trades
      await casino.lockOpenTrades('gameIdMultiple', 'gameIdMultiple', 3, 10000);

      // cashout
      for (let i = 1; i <= 5; i++) {
        const result = (await casino.cashout(`${BASE_WALLET}_${i}`, 3, 'gameIdMultiple'));
        expect(result.totalReward).toBe(2000n * WFAIR.ONE * 3n);
        expect(result.stakedAmount).toBe(2000n * WFAIR.ONE);
      }
    });

    it("Fail to cashout due to missing game", async () => {
      await WFAIR.mint(`${BASE_WALLET}_cashout`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_cashout`, 2000n * WFAIR.ONE, 3, 'gameIdFail');

      await casino.lockOpenTrades('gameIdFail', 'gameIdFail', 3, 10000);

      await expect(casino.cashout(`${BASE_WALLET}_cashout`, 3, 'gameIdInexistent')).rejects.toMatch('Transaction did not succeed: Bet was not found');
    });

    it("Fail to cashout due to wrong wallet address", async () => {
      await WFAIR.mint(`${BASE_WALLET}_cashout`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_cashout`, 2000n * WFAIR.ONE, 3, 'gameIdFailWallet');

      await casino.lockOpenTrades('gameIdFailWallet', 'gameIdFailWallet', 3, 10000);

      await expect(casino.cashout(`${BASE_WALLET}_cashout_wrong`, 3, 'gameIdFailWallet')).rejects.toMatch('Transaction did not succeed: Bet was not found');

    });

    it("Fail to cashout due to reward lower than 1", async () => {
      await WFAIR.mint(`${BASE_WALLET}_cashout_low`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_cashout_low`, 2000n * WFAIR.ONE, 3, 'gameIdFailLow');

      await casino.lockOpenTrades('gameIdFailLow', 'gameIdFailLow', 3, 10000);

      await expect(casino.cashout(`${BASE_WALLET}_cashout_low`, 0, 'gameIdFailLow')).rejects.toMatch('Total reward lower than 1: 0');

    });
  });

  describe("Get Bets", () => {
    it("Get existing current bet", async () => {
      await WFAIR.mint(`${BASE_WALLET}_currentBets`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_currentBets`, 2000n * WFAIR.ONE, 3, 'gameIdBetsCurrent');
      await casino.lockOpenTrades('gameIdBetsCurrent', 'gameIdBetsCurrent', 3, 10000);

      const result = await casino.getBets("gameIdBetsCurrent", 'gameIdBetsCurrent');

      //Ensure only 1 currentBet is retrieved
      expect(result.cashedOutBets).toHaveLength(0);
      expect(result.upcomingBets).toHaveLength(0);
      expect(result.currentBets).toHaveLength(1);
    });

    it("Get existing multiple current bets", async () => {
      await WFAIR.mint(`${BASE_WALLET}_multipleCurrentBets`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_multipleCurrentBets`, 2000n * WFAIR.ONE, 3, 'multipleCurrentBets');
      await casino.placeTrade(BASE_WALLET, 2000n * WFAIR.ONE, 3, 'multipleCurrentBets');

      await casino.lockOpenTrades('multipleCurrentBets', 'multipleCurrentBets', 3, 10000);

      const result = await casino.getBets("multipleCurrentBets", 'multipleCurrentBets');

      //Ensure multiple currentBets can be retrieved
      expect(result.cashedOutBets).toHaveLength(0);
      expect(result.upcomingBets).toHaveLength(0);
      expect(result.currentBets).toHaveLength(2);
    });

    it("Get existing upcoming bet", async () => {
      await WFAIR.mint(`${BASE_WALLET}_upcomingBets`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_upcomingBets`, 2000n * WFAIR.ONE, 3, "gameIdBetsUpcoming");

      const result = await casino.getBets("gameIdBetsUpcoming", "gameIdBetsUpcoming");

      //Ensure only 1 upcoming bet is retrieved
      expect(result.cashedOutBets).toHaveLength(0);
      expect(result.upcomingBets).toHaveLength(1);
      expect(result.currentBets).toHaveLength(0);
    });

    it("Get existing multiple upcoming bets", async () => {
      await WFAIR.mint(`${BASE_WALLET}_multipleupcomingBets`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_multipleupcomingBets`, 2000n * WFAIR.ONE, 3, "gameIdMultipleBetsUpcoming");
      await casino.placeTrade(BASE_WALLET, 2000n * WFAIR.ONE, 3, "gameIdMultipleBetsUpcoming");

      const result = await casino.getBets("gameIdMultipleBetsUpcoming", "gameIdMultipleBetsUpcoming");

      //Ensure only multiple upcoming bet are retrieved
      expect(result.cashedOutBets).toHaveLength(0);
      expect(result.upcomingBets).toHaveLength(2);
      expect(result.currentBets).toHaveLength(0);
    });

    it("Get existing cashed out bet", async () => {
      await WFAIR.mint(`${BASE_WALLET}_cashedOutBet`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_cashedOutBet`, 2000n * WFAIR.ONE, 3, "cashedOutBet");

      await casino.lockOpenTrades('cashedOutBet', 'cashedOutBet', 3, 10000);

      await casino.cashout(`${BASE_WALLET}_cashedOutBet`, 3, 'cashedOutBet');

      const result = await casino.getBets("cashedOutBet", "cashedOutBet");

      //Ensure only 1 cashedOutBet is retrieved
      expect(result.cashedOutBets).toHaveLength(1);
      expect(result.upcomingBets).toHaveLength(0);
      expect(result.currentBets).toHaveLength(0);
    });

    it("Get existing multiple cashed out bets", async () => {
      await WFAIR.mint(`${BASE_WALLET}_multipleCashedOutBet`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_multipleCashedOutBet`, 2000n * WFAIR.ONE, 3, 'multipleCashedOutBet');
      await casino.placeTrade(BASE_WALLET, 2000n * WFAIR.ONE, 3, 'multipleCashedOutBet');

      await casino.lockOpenTrades('multipleCashedOutBet', 'multipleCashedOutBet', 3, 10000);

      await casino.cashout(`${BASE_WALLET}_multipleCashedOutBet`, 3, 'multipleCashedOutBet');
      await casino.cashout(BASE_WALLET, 3, 'multipleCashedOutBet');

      const result = await casino.getBets("multipleCashedOutBet", "multipleCashedOutBet");

      //Ensure only multiple cashedOutBets are retrieved
      expect(result.cashedOutBets).toHaveLength(2);
      expect(result.upcomingBets).toHaveLength(0);
      expect(result.currentBets).toHaveLength(0);
    });

  });
  describe("Reward winners", () => {
    it("Successfully reward one winner", async () => {
      await WFAIR.mint(`${BASE_WALLET}_rewardWinners`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_rewardWinners`, 2000n * WFAIR.ONE, 3, 'rewardWinners');

      await casino.lockOpenTrades('rewardWinners', 'rewardWinners', 5, 10000);

      const result = await casino.rewardWinners("rewardWinners", 5);
      const winners = result.filter((item) => {
        return item.state === CASINO_TRADE_STATE.WIN
      });

      const losers = result.filter((item) => {
        return item.state === CASINO_TRADE_STATE.LOSS
      });

      //Expect 1 winner
      expect(winners).toHaveLength(1);
      //Expect no loser
      expect(losers).toHaveLength(0);

      expect(winners[0].reward).toBe(2000n * WFAIR.ONE * 3n);
    });

    it("Successfully reward multiple winners", async () => {
      await WFAIR.mint(`${BASE_WALLET}_rewardWinners`, 5000n * WFAIR.ONE);
      await WFAIR.mint(`${BASE_WALLET}_rewardLoser`, 5000n * WFAIR.ONE);
      await WFAIR.mint(`${BASE_WALLET}_rewardWinnersTwo`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_rewardWinners`, 2000n * WFAIR.ONE, 3, 'rewardMultipleWinners');
      await casino.placeTrade(`${BASE_WALLET}_rewardLoser`, 2000n * WFAIR.ONE, 10, 'rewardMultipleWinners');
      await casino.placeTrade(`${BASE_WALLET}_rewardWinnersTwo`, 2000n * WFAIR.ONE, 4, 'rewardMultipleWinners');


      await casino.lockOpenTrades('rewardMultipleWinners', 'rewardMultipleWinners', 5, 10000);

      const result = await casino.rewardWinners("rewardMultipleWinners", 5);
      const winners = result.filter((item) => {
        return item.state === CASINO_TRADE_STATE.WIN
      });
      const losers = result.filter((item) => {
        return item.state === CASINO_TRADE_STATE.LOSS
      });

      //Expect 2 winners
      expect(winners).toHaveLength(2);
      //Expect 1 loser
      expect(losers).toHaveLength(1);

      expect(winners[0].reward).toBe(2000n * WFAIR.ONE * 3n);
      expect(winners[1].reward).toBe(2000n * WFAIR.ONE * 4n);

    });

    it("Successfully reward one winner", async () => {
      await WFAIR.mint(`${BASE_WALLET}_rewardWinners`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_rewardWinners`, 2000n * WFAIR.ONE, 10, 'rewardSingleWinner');

      await casino.lockOpenTrades('rewardSingleWinner', 'rewardSingleWinner', 5, 10000);

      const result = await casino.rewardWinners("rewardSingleWinner", 5);
      const winners = result.filter((item) => {
        return item.state === CASINO_TRADE_STATE.WIN
      });

      const losers = result.filter((item) => {
        return item.state === CASINO_TRADE_STATE.LOSS
      });

      //Expect no winners
      expect(winners).toHaveLength(0);
      //Expect 1 loser
      expect(losers).toHaveLength(1);

    });

    /**
    it("Fail to reward winners due to wrong gameHash", async () => {
      await WFAIR.mint(`${BASE_WALLET}_rewardWinners`, 5000n * WFAIR.ONE);

      await casino.placeTrade(`${BASE_WALLET}_rewardWinners`, 2000n * WFAIR.ONE, 10);

      await casino.lockOpenTrades('rewardWinnersFail', 'rewardWinnersFail', 5, 10000);

      expect(await casino.rewardWinners("rewardWinnersFail", null)).toHaveLength(0);

    });*/
  });
});
