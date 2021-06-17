const {
    viewAllBalancesOfToken
} = require('../utils/db_helper');

class Leaderboard {
    constructor(symbol) {
        this.symbol = symbol;
    }

    getLeaders = async (limit) => await viewAllBalancesOfToken(this.symbol, limit);
}

module.exports = Leaderboard;
