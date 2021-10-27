const BetContract = require('./erc20_moc/Bet.noblock');
const CasinoTradeContract = require('./erc20_moc/CasinoTrade.noblock');
const Erc20 = require('./erc20_moc/Erc20.noblock');
const Leaderboard = require('./erc20_moc/Leaderboard.noblock');
const Wallet = require('./erc20_moc/Wallet.noblock');
const NoWeb3Exception = require('./erc20_moc/Exception.noblock');
const { pool,
  CASINO_TRADE_STATE
} = require('./utils/db_helper');

module.exports = {
  pool,
  BetContract,
  CasinoTradeContract,
  Erc20,
  Leaderboard,
  Wallet,
  NoWeb3Exception,
  CASINO_TRADE_STATE
};
