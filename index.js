const BetContract = require('./erc20_moc/Bet.noblock');
const Erc20 = require('./erc20_moc/Erc20.noblock');
const Wallet = require("./erc20_moc/Wallet.noblock");
const NoWeb3Exception = require('./erc20_moc/Exception.noblock');

module.exports = {
    BetContract,
    Erc20,
    Wallet,
    NoWeb3Exception
}
