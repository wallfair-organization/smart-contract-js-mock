const {viewLimitBalancesOfToken} = require('../utils/db_helper');

class Leaderboard {
    constructor(symbol) {
        this.symbol = symbol;
    }

    getLeaders = async (limit) => await viewLimitBalancesOfToken(this.symbol, limit);
}

module.exports = Leaderboard;
