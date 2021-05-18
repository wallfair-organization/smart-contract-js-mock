class AutomatedMarketMaker {
    constructor() {
        this.balance = {
            "yes": 1000,
            "no": 10000
        };
        this.fee = 0.01;
    }

    clacBuy(investmentAmount, outcome) {
        const poolBalances = this.balance;
        const investmentAmountMinusFees = investmentAmount - (investmentAmount * this.fee);
        const buyTokenPoolBalance = poolBalances[outcome];
        let endingOutcomeBalance = buyTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcome) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance + investmentAmountMinusFees));
            }
        }

        return buyTokenPoolBalance + investmentAmountMinusFees - endingOutcomeBalance;
    }

    clacSell(returnAmount, outcome) {
        const poolBalances = this.balance;
        const returnAmountPlusFees = returnAmount + (returnAmount * this.fee);
        const sellTokenPoolBalance = poolBalances[outcome];
        let endingOutcomeBalance = sellTokenPoolBalance;

        for (let i = 0; i < Object.keys(poolBalances).length; i++) {
            const poolBalanceKey = Object.keys(poolBalances)[i];
            if (poolBalanceKey !== outcome) {
                const poolBalance = poolBalances[poolBalanceKey];
                endingOutcomeBalance = Math.ceil((endingOutcomeBalance * poolBalance) / (poolBalance - returnAmountPlusFees));
            }
        }

        return returnAmountPlusFees + endingOutcomeBalance - sellTokenPoolBalance;
    }
}

function main() {
    const amm = new AutomatedMarketMaker();

    console.log("🚀 Buy for 1 EVNT:\t" + amm.clacBuy(1, "yes") + " YesToken");
    console.log("❄ Sell for 1 EVNT:\t" + amm.clacSell(1, "yes") + " YesToken");
    console.log("🚀 Buy for 1 EVNT:\t" + amm.clacBuy(1, "no") + " NoToken");
    console.log("❄ Sell for 1 EVNT:\t" + amm.clacSell(1, "no") + " NoToken");
}

main();
