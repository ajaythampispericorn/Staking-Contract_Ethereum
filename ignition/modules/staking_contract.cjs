const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("Staking_Contract", (m) => {
    
    const myCoin = m.contract("MyCoin");

    const roles = m.contract("Roles", [
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // feeManager (2nd hardhat account)
        "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // rewardManager (3rd hardhat account)
        "0x90F79bf6EB2c4f870365E785982E1f101E93b906"  // feeCollector (4th hardhat account)
    ]);
    
    const staking = m.contract("Staking", [
        myCoin,
        roles,
        Math.floor(Date.now() / 1000) + 86400, // startTime (24 hours from now)
        86400 * 30, // duration (30 days)
        "10000000", // rewardsPerSecond
        "10000000000", // maxTotalStake
        "100000000", // minStakeAmount
        "1000000000", // maxStakePerUser
        500, // feePercentage
        "10000000", // minFee
        "100000000" // maxFee
    ]);

    return { myCoin, roles, staking};
})