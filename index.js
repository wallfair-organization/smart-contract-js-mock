const ERC20 = require('./erc20_moc/Erc20.noblock');
const Bet = require('./erc20_moc/Bet.noblock');

async function main() {
    const erc20 = new ERC20("EVNT");
    await erc20.mint("konsti", 100000000)

    const bet = new Bet("konstanntin_bet2");
    await bet.addLiquidity('konsti', 1000);
    console.log(await bet.isResolved());

    console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "yes") + " YesToken");
    console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "no") + " NoToken");

    try {
        await bet.buy("konsti", 100, "yes", 0);
    } catch (e) {
        console.log(e.message);
    }

    console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "yes") + " YesToken");
    console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "no") + " NoToken");
}

main().then(() => process.exit());
