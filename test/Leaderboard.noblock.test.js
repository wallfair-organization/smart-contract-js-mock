const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Leaderboard = require('../erc20_moc/Leaderboard.noblock');

const tokenName = 'EVNT';
const EVNT = new ERC20(tokenName);
const tokensToMint = 100 * EVNT.ONE;

beforeAll(async () => {
    return await setupDatabase();
});

afterAll(async () => {
    return await teardownDatabase();
});

test('Get Leader', async () => {
    const testWallet1 = 'getLeaderWallet1';
    const testWallet2 = 'getLeaderWallet2';

    await EVNT.mint(testWallet1, tokensToMint);
    await EVNT.mint(testWallet2, tokensToMint / 2);
    const leaderboard = new Leaderboard(tokenName);
    const leaders = await leaderboard.getLeaders(1000);

    expect(leaders.length).toBe(2);
    expect(leaders[0].owner).toBe(testWallet1);
    expect(leaders[1].owner).toBe(testWallet2);
});
