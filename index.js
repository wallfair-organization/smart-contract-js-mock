const ERC20 = require('./erc20_moc/Erc20.noblock');
const Bet = require('./erc20_moc/Bet.noblock');

async function main() {
    const erc20 = new ERC20("EVNT");
    await erc20.mint("konsti", 10000)
    await erc20.transfer("konsti", "notKonsti", 10);
    const balance = await erc20.balanceOf("konsti");
    const notKonstiBalance = await erc20.balanceOf("notKonsti");
    console.log(balance);
    console.log(notKonstiBalance);

    const bet = new Bet("konstanntin_bet2");
    await bet.addLiquidity();

    console.log("🚀 Buy for 1000 EVNT:\t" + await bet.calcBuy(1000, "yes") + " YesToken");
    console.log("❄ Sell for 1000 EVNT:\t" + await bet.calcSell(1000, "yes") + " YesToken");
    console.log("🚀 Buy for 1000 EVNT:\t" + await bet.calcBuy(1000, "no") + " NoToken");
    console.log("❄ Sell for 1000 EVNT:\t" + await bet.calcSell(1000, "no") + " NoToken");

    try {
        console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "yes") + " YesToken");
        await bet.buy("konsti", 100, "yes", 0);
    } catch (e) {
        console.log(e.message);
    }

    console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "yes") + " YesToken");
    console.log("❄ Sell for 100 EVNT:\t" + await bet.calcSell(100, "yes") + " YesToken");
    console.log("🚀 Buy for 100 EVNT:\t" + await bet.calcBuy(100, "no") + " NoToken");
    console.log("❄ Sell for 100 EVNT:\t" + await bet.calcSell(100, "no") + " NoToken");
}

main().then(() => process.exit());
