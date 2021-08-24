require('dotenv').config();

const { setupDatabase, teardownDatabase } = require('../utils/db_helper');
const ERC20 = require('../erc20_moc/Erc20.noblock');
const Leaderboard = require('../erc20_moc/Leaderboard.noblock');

const tokenName = 'EVNT';
const EVNT = new ERC20(tokenName);
const tokensToMint = 100n * EVNT.ONE;

beforeEach(async () => {
    return await setupDatabase();
});

afterEach(async () => {
    return await teardownDatabase();
});

test('Get Leader', async () => {
    const testWallet1 = 'getLeaderWallet1';
    const testWallet2 = 'getLeaderWallet2';

    await EVNT.mint(testWallet1, tokensToMint);
    await EVNT.mint(testWallet2, tokensToMint / 2n);
    const leaderboard = new Leaderboard(tokenName);
    const leaders = await leaderboard.getLeaders(5);

    expect(leaders.length).toBe(2);
    expect(leaders[0].owner).toBe(testWallet1);
    expect(leaders[1].owner).toBe(testWallet2);
});

test('Get Leader and sort by userID', async () => {
    const testWallet1 = 'getLeaderWallet1';
    const testWallet2 = 'getLeaderWallet2';
    const testWallet3 = 'getLeaderWallet3';

    await EVNT.mint(testWallet1, tokensToMint);
    await EVNT.mint(testWallet2, tokensToMint);
    await EVNT.mint(testWallet3, tokensToMint / 2n);
    const leaderboard = new Leaderboard(tokenName);
    const leaders = await leaderboard.getLeaders(5);

    expect(leaders.length).toBe(3);
    expect(leaders[0].owner).toBe(testWallet1);
    expect(leaders[1].owner).toBe(testWallet2);
    expect(leaders[2].owner).toBe(testWallet3);
});
