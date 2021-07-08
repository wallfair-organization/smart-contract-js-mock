const {viewLimitBalancesOfToken} = require('../utils/db_helper');

class Leaderboard {
    /**
     * Create a Moc Leaderboard instance
     *
     * @param symbol {string}
     */
    constructor(symbol) {
        this.symbol = symbol;
    }

    /**
     * Get a limited list of the leaders ordered by their EVNT Balance
     *
     * @param limit {number}
     * @returns {Promise<*>}
     */
    getLeaders = async (limit) => await viewLimitBalancesOfToken(this.symbol, limit);
}

module.exports = Leaderboard;
