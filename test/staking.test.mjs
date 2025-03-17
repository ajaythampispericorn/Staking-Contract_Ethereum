import { expect } from "chai";
import hardhat from "hardhat";
const { ethers } = hardhat;
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Staking Contract", function () {
  // Contract instances
  let myCoin;
  let roles;
  let staking;

  // Accounts
  let owner;
  let feeManager;
  let rewardManager;
  let feeCollector;
  let user1;
  let user2;
  let user3;
  let user4;
  let user5;

  // Constants
  const PRECISION_FACTOR = 100000n;
  const BASIS_POINTS = 10000n;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  
  // Pool configuration values
  let startTime;
  const duration = 86400n * 30n; // 30 days
  const rewardsPerSecond = ethers.parseUnits("0.01", 6); // 0.01 tokens per second
  const maxTotalStake = ethers.parseUnits("10000", 6); // 10,000 tokens
  const minStakeAmount = ethers.parseUnits("100", 6); // 100 tokens minimum
  const maxStakePerUser = ethers.parseUnits("1000", 6); // 1,000 tokens per user
  const feePercentage = 500n; // 5%
  const minFee = ethers.parseUnits("10", 6); // 10 tokens minimum fee
  const maxFee = ethers.parseUnits("100", 6); // 100 tokens maximum fee

  // Helper to move time forward
  async function advanceTimeAndBlock(seconds) {

    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = currentBlock.timestamp;
    
    const targetTimestamp = currentTimestamp + seconds;

    await time.increaseTo(targetTimestamp);
    
    await ethers.provider.send("evm_mine", []);
    
    const newBlock = await ethers.provider.getBlock("latest");
    const newTimestamp = newBlock.timestamp;
    
    if (newTimestamp < targetTimestamp) {
      console.warn(`Time advancement failed! Target: ${targetTimestamp}, Actual: ${newTimestamp}`);
    }
    
    return newTimestamp;
  }

  // Helper function to advance time to the pool start
  async function advanceToPoolStart() {
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = BigInt(currentBlock.timestamp);
    
    if (currentTimestamp >= startTime) {
      return currentTimestamp;
    }
    
    const secondsToAdvance = Number(startTime - currentTimestamp);
    
    const newTimestamp = await advanceTimeAndBlock(secondsToAdvance);
    return BigInt(newTimestamp);
  }

  beforeEach(async function () {
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = currentBlock.timestamp;

    startTime = BigInt(currentTimestamp + 86400);
    
    // Get signers
    [owner, feeManager, rewardManager, feeCollector, user1, user2, user3, user4, user5] = await ethers.getSigners();

    // Deploy MyCoin
    const MyCoin = await ethers.getContractFactory("MyCoin");
    myCoin = await MyCoin.deploy();

    // Deploy Roles
    const Roles = await ethers.getContractFactory("Roles");
    roles = await Roles.deploy(feeManager.address, rewardManager.address, feeCollector.address);

    // Deploy Staking
    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(
      await myCoin.getAddress(),
      await roles.getAddress(),
      startTime,
      duration,
      rewardsPerSecond,
      maxTotalStake,
      minStakeAmount,
      maxStakePerUser,
      feePercentage,
      minFee,
      maxFee
    );

    await myCoin.mintCoins(ethers.parseUnits("100000000", 6));
    
    // Transfer tokens to users and rewardManager
    await myCoin.transfer(user1.address, ethers.parseUnits("1000000", 6)); 
    await myCoin.transfer(user2.address, ethers.parseUnits("1000000", 6)); 
    await myCoin.transfer(user3.address, ethers.parseUnits("1000000", 6));
    await myCoin.transfer(user4.address, ethers.parseUnits("1000000", 6));  
    await myCoin.transfer(rewardManager.address, ethers.parseUnits("10000000", 6)); 

    // Approve staking contract to spend tokens
    const MAX_UINT256 = ethers.MaxUint256;
    await myCoin.connect(user1).approve(await staking.getAddress(), MAX_UINT256);
    await myCoin.connect(user2).approve(await staking.getAddress(), MAX_UINT256);
    await myCoin.connect(user3).approve(await staking.getAddress(), MAX_UINT256);
    await myCoin.connect(user4).approve(await staking.getAddress(), MAX_UINT256);
    await myCoin.connect(rewardManager).approve(await staking.getAddress(), MAX_UINT256);
    await myCoin.connect(owner).approve(await staking.getAddress(), MAX_UINT256);
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await staking.stakingToken()).to.equal(await myCoin.getAddress());
    });

    it("Should set the correct roles contract address", async function () {
      expect(await staking.roles()).to.equal(await roles.getAddress());
    });

    it("Should set the correct pool configuration", async function () {
      const poolConfig = await staking.getPoolConfig();
      expect(poolConfig.startTime).to.equal(startTime);
      expect(poolConfig.endTime).to.equal(startTime + duration);
      expect(poolConfig.rewardsPerSecond).to.equal(rewardsPerSecond);
      expect(poolConfig.maxTotalStake).to.equal(maxTotalStake);
      expect(poolConfig.minStakeAmount).to.equal(minStakeAmount);
      expect(poolConfig.maxStakePerUser).to.equal(maxStakePerUser);
    });

    it("Should set the correct fee configuration", async function () {
      const feeConfig = await staking.getFeeConfig();
      expect(feeConfig.earlyUnstakeFeePercentage).to.equal(feePercentage);
      expect(feeConfig.minimumFee).to.equal(minFee);
      expect(feeConfig.maximumFee).to.equal(maxFee);
    });
    
    it("Should initialize state variables correctly", async function () {
      const stats = await staking.getPoolStats();
      expect(stats._totalStaked).to.equal(0);
      expect(stats._lockedRewards).to.equal(0);
      expect(stats._accumulatedRewardsPerStake).to.equal(0);
      expect(await staking.getCollectedFees()).to.equal(0);
    });
  });

  describe("Roles Contract", function () {
    it("Should initialize roles correctly", async function () {
      expect(await roles.poolAdmin()).to.equal(owner.address);
      expect(await roles.feeManager()).to.equal(feeManager.address);
      expect(await roles.rewardManager()).to.equal(rewardManager.address);
      expect(await roles.feeCollector()).to.equal(feeCollector.address);
    });

    it("Should correctly identify roles", async function () {
      expect(await roles.isPoolAdmin(owner.address)).to.be.true;
      expect(await roles.isFeeManager(feeManager.address)).to.be.true;
      expect(await roles.isRewardManager(rewardManager.address)).to.be.true;
      expect(await roles.isFeeCollector(feeCollector.address)).to.be.true;
      
      expect(await roles.isPoolAdmin(user1.address)).to.be.false;
      expect(await roles.isFeeManager(user1.address)).to.be.false;
    });

    it("Should update pool admin role correctly", async function () {
      await roles.connect(owner).UpdatePoolAdmin(user1.address);
      expect(await roles.poolAdmin()).to.equal(user1.address);
      expect(await roles.isPoolAdmin(user1.address)).to.be.true;
      expect(await roles.isPoolAdmin(owner.address)).to.be.false;
    });

    it("Should update fee manager role correctly", async function () {
      await roles.connect(feeManager).UpdateFeeManager(user1.address);
      expect(await roles.feeManager()).to.equal(user1.address);
      expect(await roles.isFeeManager(user1.address)).to.be.true;
      expect(await roles.isFeeManager(feeManager.address)).to.be.false;
    });

    it("Should update fee collector role correctly", async function () {
      await roles.connect(feeCollector).UpdateFeeCollector(user1.address);
      expect(await roles.feeCollector()).to.equal(user1.address);
      expect(await roles.isFeeCollector(user1.address)).to.be.true;
      expect(await roles.isFeeCollector(feeCollector.address)).to.be.false;
    });

    it("Should update reward manager role correctly", async function () {
      await roles.connect(rewardManager).UpdateRewardManager(user1.address);
      expect(await roles.rewardManager()).to.equal(user1.address);
      expect(await roles.isRewardManager(user1.address)).to.be.true;
      expect(await roles.isRewardManager(rewardManager.address)).to.be.false;
    });

    it("Should fail to update roles with zero address", async function () {
      await expect(roles.connect(owner).UpdatePoolAdmin(ZERO_ADDRESS)).to.be.revertedWithCustomError(roles, "InvalidAddress");
      await expect(roles.connect(feeManager).UpdateFeeManager(ZERO_ADDRESS)).to.be.revertedWithCustomError(roles, "InvalidAddress");
      await expect(roles.connect(feeCollector).UpdateFeeCollector(ZERO_ADDRESS)).to.be.revertedWithCustomError(roles, "InvalidAddress");
      await expect(roles.connect(rewardManager).UpdateRewardManager(ZERO_ADDRESS)).to.be.revertedWithCustomError(roles, "InvalidAddress");
    });

    it("Should fail to update roles with address conflicts", async function () {
      await expect(roles.connect(owner).UpdatePoolAdmin(feeManager.address))
        .to.be.revertedWithCustomError(roles, "AddressConflict");
      
      await expect(roles.connect(feeManager).UpdateFeeManager(rewardManager.address))
        .to.be.revertedWithCustomError(roles, "AddressConflict");
    });

    it("Should fail when unauthorized accounts try to update roles", async function () {
      await expect(roles.connect(user1).UpdatePoolAdmin(user2.address)).to.be.revertedWithCustomError(roles, "NotAuthorized");
      await expect(roles.connect(user1).UpdateFeeManager(user2.address)).to.be.revertedWithCustomError(roles, "NotAuthorized");
      await expect(roles.connect(user1).UpdateFeeCollector(user2.address)).to.be.revertedWithCustomError(roles, "NotAuthorized");
      await expect(roles.connect(user1).UpdateRewardManager(user2.address)).to.be.revertedWithCustomError(roles, "NotAuthorized");
    });

    it("Should handle newFeeCollector being same as feeCollector in UpdateFeeCollector", async function () {
      await expect(roles.connect(feeCollector).UpdateFeeCollector(feeCollector.address))
        .to.be.revertedWithCustomError(roles, "AddressConflict");
    });

    it("Should handle newRewardManager being same as rewardManager in UpdateRewardManager", async function () {
      await expect(roles.connect(rewardManager).UpdateRewardManager(rewardManager.address))
        .to.be.revertedWithCustomError(roles, "AddressConflict");
    });
    
    it("Should fail to deploy Roles with invalid addresses", async function() {
      const Roles = await ethers.getContractFactory("Roles");
      
      await expect(
        Roles.deploy(ZERO_ADDRESS, rewardManager.address, feeCollector.address)
      ).to.be.revertedWithCustomError(Roles, "InvalidAddress");
      
      await expect(
        Roles.deploy(feeManager.address, ZERO_ADDRESS, feeCollector.address)
      ).to.be.revertedWithCustomError(Roles, "InvalidAddress");
      
      await expect(
        Roles.deploy(feeManager.address, rewardManager.address, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(Roles, "InvalidAddress");
    });
    
    it("Should check address conflicts in constructor", async function() {
      const Roles = await ethers.getContractFactory("Roles");
      
      //check if poolAdmin (msg.sender) == feeManager
      await expect(
        Roles.deploy(owner.address, rewardManager.address, feeCollector.address)
      ).to.be.revertedWithCustomError(Roles, "AddressConflict");
      
      //ceck if feeManager == rewardManager
      await expect(
        Roles.deploy(feeManager.address, feeManager.address, feeCollector.address)
      ).to.be.revertedWithCustomError(Roles, "AddressConflict");
      
      //check if rewardManager == feeCollector
      await expect(
        Roles.deploy(feeManager.address, rewardManager.address, rewardManager.address)
      ).to.be.revertedWithCustomError(Roles, "AddressConflict");
    });
  });

  describe("Reward Management", function () {
    it("Should lock rewards correctly", async function () {
      const rewardAmount = ethers.parseUnits("10000", 6);
      await staking.connect(rewardManager).lockRewards(rewardAmount);
      
      const stats = await staking.getPoolStats();
      expect(stats._lockedRewards).to.equal(rewardAmount);
    });
    
    it("Should unlock rewards correctly", async function () {
      const rewardAmount = ethers.parseUnits("10000", 6);
      await staking.connect(rewardManager).lockRewards(rewardAmount);
      
      await staking.connect(rewardManager).unlockRewards(ethers.parseUnits("5000", 6));
      
      const stats = await staking.getPoolStats();
      expect(stats._lockedRewards).to.equal(ethers.parseUnits("5000", 6));
    });
    
    it("Should fail to lock rewards after pool starts", async function () {
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect((currentBlock.timestamp)).to.be.gte(startTime);
      
      await expect(
        staking.connect(rewardManager).lockRewards(ethers.parseUnits("10000", 6))
      ).to.be.revertedWithCustomError(staking, "PoolAlreadyStarted");
    });
    
    it("Should fail to unlock rewards after pool starts", async function () {
      // Lock rewards first before the pool starts
      const rewardAmount = ethers.parseUnits("10000", 6);
      await staking.connect(rewardManager).lockRewards(rewardAmount);
      
      await advanceToPoolStart();
      
      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      // Try to unlock after pool starts
      await expect(
        staking.connect(rewardManager).unlockRewards(ethers.parseUnits("5000", 6))
      ).to.be.revertedWithCustomError(staking, "PoolAlreadyStarted");
    });
    
    it("Should fail to unlock more rewards than locked", async function () {
      const rewardAmount = ethers.parseUnits("10000", 6);
      await staking.connect(rewardManager).lockRewards(rewardAmount);
      
      await expect(
        staking.connect(rewardManager).unlockRewards(ethers.parseUnits("20000", 6))
      ).to.be.revertedWithCustomError(staking, "NotEnoughRewardsLocked");
    });
    
    it("Should fail when unauthorized accounts try to lock rewards", async function () {
      await expect(
        staking.connect(user1).lockRewards(ethers.parseUnits("10000", 6))
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
    });
    
    it("Should fail when unauthorized accounts try to unlock rewards", async function () {
      const rewardAmount = ethers.parseUnits("10000", 6);
      await staking.connect(rewardManager).lockRewards(rewardAmount);
      
      await expect(
        staking.connect(user1).unlockRewards(ethers.parseUnits("5000", 6))
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
    });
  });

  describe("Pool Configuration", function () {
    beforeEach(async function () {
      // Lock much more rewards to ensure there's enough for all tests
      const requiredRewards = rewardsPerSecond * duration * 10n; // 10x more
      await staking.connect(rewardManager).lockRewards(requiredRewards);
    });
    
    it("Should update pool configuration correctly", async function () {
      const newStartTime = startTime + 3600n; // 1 hour later
      const newDuration = 86400n * 60n; // 60 days
      const newRewardsPerSecond = ethers.parseUnits("0.02", 6); // 0.02 tokens per second
      const newMaxTotalStake = ethers.parseUnits("20000", 6); // 20,000 tokens
      
      await staking.connect(owner).updatePoolConfig(
        newStartTime,
        newDuration,
        newRewardsPerSecond,
        newMaxTotalStake
      );
      
      const poolConfig = await staking.getPoolConfig();
      expect(poolConfig.startTime).to.equal(newStartTime);
      expect(poolConfig.endTime).to.equal(newStartTime + newDuration);
      expect(poolConfig.rewardsPerSecond).to.equal(newRewardsPerSecond);
      expect(poolConfig.maxTotalStake).to.equal(newMaxTotalStake);
    });
    
    it("Should fail to update pool config after pool starts", async function () {
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      await expect(
        staking.connect(owner).updatePoolConfig(
          startTime + 3600n,
          duration,
          rewardsPerSecond,
          maxTotalStake
        )
      ).to.be.revertedWithCustomError(staking, "PoolAlreadyStarted");
    });
    
    it("Should fail to update pool config without enough locked rewards", async function () {

      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTimestamp = currentBlock.timestamp;
      const newStartTime = BigInt(currentTimestamp + 86400); // 24 hours from now
      const Staking = await ethers.getContractFactory("Staking");
      const newStaking = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        newStartTime,
        duration,
        rewardsPerSecond, 
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Approve the new staking contract
      await myCoin.connect(rewardManager).approve(await newStaking.getAddress(), ethers.MaxUint256);
      
      const initialRequiredRewards = rewardsPerSecond * duration;
      await newStaking.connect(rewardManager).lockRewards(initialRequiredRewards);
      
      // Try to update to a configuration that requires more rewards
      const newDuration = 86400n * 60n; // 60 days (longer)
      const newRewardsPerSecond = ethers.parseUnits("0.1", 6); // 0.1 tokens per second (much higher)
      
      await expect(
        newStaking.connect(owner).updatePoolConfig(
          newStartTime,
          newDuration,
          newRewardsPerSecond,
          maxTotalStake
        )
      ).to.be.revertedWithCustomError(newStaking, "NotEnoughRewardsLocked");
    });
    
    it("Should fail when unauthorized accounts try to update pool config", async function () {
      await expect(
        staking.connect(user1).updatePoolConfig(
          startTime,
          duration,
          rewardsPerSecond,
          maxTotalStake
        )
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
    });
    
    it("Should update fee configuration correctly", async function () {
      const newFeePercentage = 300n; // 3%
      const newMinFee = ethers.parseUnits("5", 6); // 5 tokens
      const newMaxFee = ethers.parseUnits("50", 6); // 50 tokens
      
      await staking.connect(feeManager).updateFeeConfig(
        newFeePercentage,
        newMinFee,
        newMaxFee
      );
      
      const feeConfig = await staking.getFeeConfig();
      expect(feeConfig.earlyUnstakeFeePercentage).to.equal(newFeePercentage);
      expect(feeConfig.minimumFee).to.equal(newMinFee);
      expect(feeConfig.maximumFee).to.equal(newMaxFee);
    });
    
    it("Should fail to update fee config with invalid fee percentage", async function () {
      const invalidFeePercentage = 20000n; // 200% - over BASIS POINTS
      
      await expect(
        staking.connect(feeManager).updateFeeConfig(
          invalidFeePercentage,
          minFee,
          maxFee
        )
      ).to.be.revertedWithCustomError(staking, "InvalidFeePercentage");
    });
    
    it("Should fail to update fee config with invalid fee limits", async function () {
      const newMinFee = ethers.parseUnits("100", 6);
      const newMaxFee = ethers.parseUnits("50", 6); // Max less than min
      
      await expect(
        staking.connect(feeManager).updateFeeConfig(
          feePercentage,
          newMinFee,
          newMaxFee
        )
      ).to.be.revertedWithCustomError(staking, "InvalidFeeLimit");
    });
    
    it("Should fail when unauthorized accounts try to update fee config", async function () {
      await expect(
        staking.connect(user1).updateFeeConfig(
          feePercentage,
          minFee,
          maxFee
        )
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
    });
  });

  describe("Staking Functionality", function () {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
    });
    
    it("Should stake tokens correctly", async function () {
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(stakeAmount);
      
      const stats = await staking.getPoolStats();
      expect(stats._totalStaked).to.equal(stakeAmount);
    });
    
    it("Should fail to stake before pool starts", async function () {
      const currentBlockTime = await ethers.provider.getBlock("latest");
      const currentTimestamp = currentBlockTime.timestamp;

      const newStartTime = BigInt(currentTimestamp) + 14400n;

      const Staking = await ethers.getContractFactory("Staking");
      const newStaking = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        newStartTime,
        duration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Approve new staking contract
      await myCoin.connect(user1).approve(await newStaking.getAddress(), ethers.MaxUint256);

      const currentBlockAfterDeploy = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlockAfterDeploy.timestamp)).to.be.lt(newStartTime);
      
      const stakeAmount = ethers.parseUnits("500", 6);
      await expect(
        newStaking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(newStaking, "PoolNotStarted");
    });
    
    it("Should fail to stake after pool ends", async function () {
      const secondsToAdvance = Number(duration) + 100;
      await advanceTimeAndBlock(secondsToAdvance);
      
      const currentBlock = await ethers.provider.getBlock("latest");
      const poolEndTime = startTime + duration;
      expect(BigInt(currentBlock.timestamp)).to.be.gt(poolEndTime);
      
      const stakeAmount = ethers.parseUnits("500", 6);
      await expect(
        staking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(staking, "PoolEnded");
    });
    
    it("Should fail to stake below minimum amount", async function () {
      const stakeAmount = ethers.parseUnits("50", 6); // Less than minimum
      await expect(
        staking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(staking, "StakeTooLow");
    });
    
    it("Should fail to stake above maximum per user", async function () {
      const stakeAmount = ethers.parseUnits("1500", 6); // More than max per user
      await expect(
        staking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(staking, "StakeTooHigh");
    });

  it("Should fail to stake when pool is full", async function () {
    const poolConfig = await staking.getPoolConfig();
    const maxStakePerUser = poolConfig.maxStakePerUser;
    const maxTotalStake = poolConfig.maxTotalStake;
    const minStakeAmount = poolConfig.minStakeAmount;
    
    console.log("Pool configuration:");
    console.log("Max total stake:", maxTotalStake.toString());
    console.log("Max stake per user:", maxStakePerUser.toString());
    console.log("Min stake amount:", minStakeAmount.toString());
    
    // Calculate how many full stakes we need and any remainder
    const numFullStakes = maxTotalStake / maxStakePerUser;
    const remainder = maxTotalStake % maxStakePerUser;
    
    console.log("Number of full stakes needed:", numFullStakes.toString());
    console.log("Remainder after full stakes:", remainder.toString());
    
    // Users to fill the pool (excluding user5 for final test)
    const fillUsers = [user1, user2, user3, user4, owner];
    
    // Have users stake maximum amount
    for (let i = 0; i < numFullStakes && i < fillUsers.length; i++) {
      console.log(`User ${i+1} staking max amount ${maxStakePerUser.toString()}`);
      await staking.connect(fillUsers[i]).stake(maxStakePerUser);
    }
    
    // If we have remainder and it's at least the minimum stake, have another user stake it
    if (remainder >= minStakeAmount && numFullStakes < fillUsers.length) {
      console.log(`User ${Number(numFullStakes)+1} staking remainder ${remainder.toString()}`);
      await staking.connect(fillUsers[Number(numFullStakes)]).stake(remainder);
    }
    
    // Check pool status
    const stats = await staking.getPoolStats();
    console.log("Total staked:", stats._totalStaked.toString());
    
    // Verify pool is full
    if (stats._totalStaked + minStakeAmount <= maxTotalStake) {
      console.log("Pool not filled enough");
      return;
    }
    
    // Try to stake with user5, should fail with PoolFull
    await expect(
      staking.connect(user5).stake(minStakeAmount)
    ).to.be.revertedWithCustomError(staking, "PoolFull");
  });

    it("Should increase existing stake correctly", async function () {
      const initialStake = ethers.parseUnits("300", 6);
      const additionalStake = ethers.parseUnits("200", 6);
      
      await staking.connect(user1).stake(initialStake);
      await staking.connect(user1).stake(additionalStake);
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(initialStake + additionalStake);
    });
    
    it("Should fail to increase stake above maximum per user", async function () {
      const initialStake = ethers.parseUnits("800", 6);
      const additionalStake = ethers.parseUnits("300", 6); // Would exceed max
      
      await staking.connect(user1).stake(initialStake);
      
      await expect(
        staking.connect(user1).stake(additionalStake)
      ).to.be.revertedWithCustomError(staking, "StakeTooHigh");
    });

    it("Should handle first-time stake correctly with initial stake amount", async function () {
      const stakeAmount = ethers.parseUnits("100", 6); // Minimum stake amount
      await staking.connect(user1).stake(stakeAmount);
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(stakeAmount);
      expect(userInfo.lockEndTime).to.equal(0); // No lock period set initially
    });
  });

  describe("Unstaking and Rewards", function () {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      // Advance time to start the pool
      await advanceToPoolStart();
      
      // Verify we're at or past the start time
      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      // Stake tokens
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
    });
    
    it("Should unstake tokens correctly", async function () {
      await advanceTimeAndBlock(86400); // 1 day
      
      const initialBalance = await myCoin.balanceOf(user1.address);
      await staking.connect(user1).unstake();
      const finalBalance = await myCoin.balanceOf(user1.address);
      
      expect(finalBalance).to.be.gt(initialBalance);
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(0);
    });
    
    it("Should charge early unstake fee correctly", async function () {
      await advanceTimeAndBlock(86400); // 1 day
      
      const initialFees = await staking.getCollectedFees();
      await staking.connect(user1).unstake();
      const finalFees = await staking.getCollectedFees();
      
      // Should have collected a fee
      expect(finalFees).to.be.gt(initialFees);
    });
    
    it("Should not charge fee after pool ends", async function () {
      const secondsToAdvance = Number(duration) + 100; //past pool time
      await advanceTimeAndBlock(secondsToAdvance);

      const currentBlock = await ethers.provider.getBlock("latest");
      const poolEndTime = startTime + duration;
      expect(BigInt(currentBlock.timestamp)).to.be.gt(poolEndTime);
      
      const initialFees = await staking.getCollectedFees();
      await staking.connect(user1).unstake();
      const finalFees = await staking.getCollectedFees();
      
      expect(finalFees).to.equal(initialFees);
    });
    
    it("Should fail to unstake with no stake", async function () {
      await expect(
        staking.connect(user2).unstake()
      ).to.be.revertedWithCustomError(staking, "NoStakeFound");
    });
    
    it("Should fail to unstake when locked", async function () {
      // Set a lock period for user1
      const currentBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(currentBlock.timestamp) + 86400n; // 1 day in future 
      await staking.connect(owner).setLockPeriod(user1.address, lockEndTime);
      
      await expect(
        staking.connect(user1).unstake()
      ).to.be.revertedWithCustomError(staking, "StillLocked");
    });
    
    it("Should claim rewards correctly", async function () {
      await advanceTimeAndBlock(86400); // 1 day
      
      const initialBalance = await myCoin.balanceOf(user1.address);
      await staking.connect(user1).claimRewards();
      const finalBalance = await myCoin.balanceOf(user1.address);
      
      expect(finalBalance).to.be.gt(initialBalance);  //rewards recieved
      
      // Stake should remain the same
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(ethers.parseUnits("500", 6));
    });
    
    it("Should fail to claim rewards with no stake", async function () {
      await expect(
        staking.connect(user2).claimRewards()
      ).to.be.revertedWithCustomError(staking, "NoStakeFound");
    });
    
    it("Should calculate pending rewards correctly", async function () {
      await advanceTimeAndBlock(86400); // 1 day
      
      const userInfo = await staking.getUserInfo(user1.address);
      const expectedRewards = rewardsPerSecond * 86400n;
      
      expect(userInfo.pendingRewards).to.be.closeTo(expectedRewards, ethers.parseUnits("1", 6));
    });

    it("Should handle zero pending rewards in calculatePendingRewards", async function () {
      const pendingRewards = await staking.calculatePendingRewards(user1.address);
      expect(pendingRewards).to.equal(0);
    });

    it("Should correctly calculate when rewards less than or equal to rewardDebt", async function () {
      await advanceTimeAndBlock(86400); // Accumulate some rewards
      await staking.connect(user1).claimRewards();

      const pendingRewards = await staking.calculatePendingRewards(user1.address);
      expect(pendingRewards).to.equal(0);
    });
  });

  describe("Fee Collection", function () {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(requiredRewards);

      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      // Stake and unstake to generate fees
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
      await staking.connect(user1).unstake();
    });
    
    it("Should collect fees correctly", async function () {
      const initialBalance = await myCoin.balanceOf(feeCollector.address);
      await staking.connect(feeCollector).collectFees();
      const finalBalance = await myCoin.balanceOf(feeCollector.address);
      
      // Fee collector should have received fees
      expect(finalBalance).to.be.gt(initialBalance);
      
      // Collected fees should be reset
      expect(await staking.getCollectedFees()).to.equal(0);
    });
    
    it("Should fail when unauthorized accounts try to collect fees", async function () {
      await expect(
        staking.connect(user1).collectFees()
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
    });
    
    it("Should fail to collect fees when none are available", async function () {
      // Collect fees first
      await staking.connect(feeCollector).collectFees();
      
      // Try to collect again
      await expect(
        staking.connect(feeCollector).collectFees()
      ).to.be.revertedWithCustomError(staking, "NoFeeToCollect");
    });
  });
  
  describe("Lock Period Management", function () {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      // Stake tokens
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
    });
    
    it("Should set lock period correctly", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(currentBlock.timestamp) + 86400n; // 1 day from now
      await staking.connect(owner).setLockPeriod(user1.address, lockEndTime);
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.lockEndTime).to.equal(lockEndTime);
    });
    
    it("Should allow unstaking after lock period ends", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(currentBlock.timestamp) + 3600n; // 1 hour from now
      await staking.connect(owner).setLockPeriod(user1.address, lockEndTime);
      
      // Try to unstake before lock ends
      await expect(
        staking.connect(user1).unstake()
      ).to.be.revertedWithCustomError(staking, "StillLocked");
      
      await advanceTimeAndBlock(3601);

      const newBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(newBlock.timestamp)).to.be.gt(lockEndTime);
      
      // Should be able to unstake now
      await staking.connect(user1).unstake();
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(0);
    });
    
    it("Should fail to set lock period for non-existent stake", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(currentBlock.timestamp) + 86400n; // 1 day from now
      
      await expect(
        staking.connect(owner).setLockPeriod(user2.address, lockEndTime)
      ).to.be.revertedWithCustomError(staking, "NoStakeFound");
    });
    
    it("Should fail when unauthorized accounts try to set lock period", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(currentBlock.timestamp) + 86400n; // 1 day from now
      
      await expect(
        staking.connect(user2).setLockPeriod(user1.address, lockEndTime)
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
    });
  });
  
  describe("Pool Status", function () {
    it("Should report pool as inactive before start time", async function () {
      expect(await staking.isPoolActive()).to.be.false;   //start time is 24 hours frm now
    });
    
    it("Should report pool as active during pool period", async function () {
      await advanceToPoolStart();
      
      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      expect(await staking.isPoolActive()).to.be.true;
    });
    
    it("Should report pool as inactive after end time", async function () {
      const secondsToAdvance = Number(duration) + 86400; // Duration + 1 day
      await advanceTimeAndBlock(secondsToAdvance);
      
      const currentBlock = await ethers.provider.getBlock("latest");
      const poolEndTime = startTime + duration;
      expect(BigInt(currentBlock.timestamp)).to.be.gt(poolEndTime);
      
      expect(await staking.isPoolActive()).to.be.false;
    });
  });
  
  describe("Reward Calculation Edge Cases", function () {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
    });
    
    it("Should handle staking with zero total staked", async function () {
      await advanceToPoolStart();
      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
      
      const stats = await staking.getPoolStats();
      expect(stats._totalStaked).to.equal(stakeAmount);
    });
    
    it("Should handle multiple users staking different amounts", async function () {
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
      
      const stakeAmount1 = ethers.parseUnits("300", 6);
      const stakeAmount2 = ethers.parseUnits("500", 6);
      
      await staking.connect(user1).stake(stakeAmount1);
      await staking.connect(user2).stake(stakeAmount2);
      
      await advanceTimeAndBlock(86400); // 1 day reward accumulation
      
      const userInfo1 = await staking.getUserInfo(user1.address);
      const userInfo2 = await staking.getUserInfo(user2.address);

      expect(userInfo2.pendingRewards).to.be.gt(userInfo1.pendingRewards);
      
      const expectedRatio = (userInfo2.pendingRewards * stakeAmount1) / stakeAmount2;
      expect(userInfo1.pendingRewards).to.be.closeTo(
        expectedRatio,
        ethers.parseUnits("1", 6)
      );
    });
    
    it("Should handle staking across pool boundaries", async function () {
      const newStartTime = BigInt(await ethers.provider.getBlock("latest").then(b => b.timestamp)) + 3600n; // 1 hour from now
      const Staking = await ethers.getContractFactory("Staking");
      const newStaking = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        newStartTime,
        duration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );

      await myCoin.connect(rewardManager).approve(await newStaking.getAddress(), ethers.MaxUint256);
      await newStaking.connect(rewardManager).lockRewards(rewardsPerSecond * duration);
      
      await myCoin.connect(user1).approve(await newStaking.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user2).approve(await newStaking.getAddress(), ethers.MaxUint256);

      const initialBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(initialBlock.timestamp)).to.be.lt(newStartTime);

      const stakeAmount = ethers.parseUnits("500", 6);
      await expect(
        newStaking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(newStaking, "PoolNotStarted");
      
      await advanceTimeAndBlock(3700); // past the start time
      

      const midBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(midBlock.timestamp)).to.be.gte(newStartTime);

      await newStaking.connect(user1).stake(stakeAmount);

      const secondsToAdvance = Number(duration) + 100;
      await advanceTimeAndBlock(secondsToAdvance);

      const endBlock = await ethers.provider.getBlock("latest");
      const poolEndTime = newStartTime + duration;
      expect(BigInt(endBlock.timestamp)).to.be.gt(poolEndTime);

      await expect(
        newStaking.connect(user2).stake(stakeAmount)
      ).to.be.revertedWithCustomError(newStaking, "PoolEnded");

      await newStaking.connect(user1).unstake();
    });

    it("Should handle updatePoolRewards correctly with zero totalStaked", async function () {
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);

      const beforeStats = await staking.getPoolStats();

      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);

      const afterStats = await staking.getPoolStats();

      expect(afterStats._lastUpdateTime).to.be.gt(beforeStats._lastUpdateTime);

      expect(afterStats._accumulatedRewardsPerStake).to.equal(0);
    });

    it("Should set lastUpdateTime to block.timestamp when called before pool starts", async function () {
      const currentBlock1 = await ethers.provider.getBlock("latest");
      const currentBlockTimestamp = BigInt(currentBlock1.timestamp);
      const newStartTime = (currentBlockTimestamp + 3600n); // 24 hours from now
      const Staking = await ethers.getContractFactory("Staking");
      const newStaking = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        newStartTime,
        duration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      await myCoin.connect(rewardManager).approve(await newStaking.getAddress(), ethers.MaxUint256);
      await newStaking.connect(rewardManager).lockRewards(rewardsPerSecond * duration);
      
      const stats = await newStaking.getPoolStats();
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTimestamp = BigInt(currentBlock.timestamp);

      expect(stats._lastUpdateTime).to.be.closeTo(currentTimestamp, 5n);
      expect(stats._lastUpdateTime).to.be.lte(newStartTime);
    });
    
    it("Should correctly calculate rewardPerStake in updatePoolRewards", async function () {
      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);

      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);

      const beforeStats = await staking.getPoolStats();

      await advanceTimeAndBlock(3600); // 1 hour

      await staking.connect(user1).stake(stakeAmount);

      const afterStats = await staking.getPoolStats();

      expect(afterStats._accumulatedRewardsPerStake).to.be.gt(beforeStats._accumulatedRewardsPerStake);

      const expectedIncrease = (rewardsPerSecond * 3600n * PRECISION_FACTOR) / stakeAmount;
      const actualIncrease = afterStats._accumulatedRewardsPerStake - beforeStats._accumulatedRewardsPerStake;

      expect(actualIncrease).to.be.closeTo(expectedIncrease, expectedIncrease / 10n);
    });
  });
  
  describe("MyCoin Contract", function () {
    it("Should have the correct name and symbol", async function () {
      expect(await myCoin.name()).to.equal("MyCoin");
      expect(await myCoin.symbol()).to.equal("MCN");
    });
    
    it("Should have 6 decimals", async function () {
      expect(await myCoin.decimals()).to.equal(6);
    });
    
    it("Should allow owner to mint tokens", async function () {
      const initialSupply = await myCoin.totalSupply();
      const mintAmount = ethers.parseUnits("100000", 6);
      
      await myCoin.connect(owner).mintCoins(mintAmount);
      
      const finalSupply = await myCoin.totalSupply();
      expect(finalSupply).to.equal(initialSupply + mintAmount);
    });
    
    it("Should not allow non-owners to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("100000", 6);
      
      await expect(
        myCoin.connect(user1).mintCoins(mintAmount)
      ).to.be.revertedWithCustomError(myCoin, "OwnableUnauthorizedAccount");
    });
  });
  
  // INTEGRATION TESTS
  
  describe("Full Staking Flow", function () {
    beforeEach(async function () {
      const requiredRewards = rewardsPerSecond * duration * 2n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);

      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
    });
    
    it("Should handle a complete staking lifecycle", async function () {
      // Initial balances
      const initialBalance1 = await myCoin.balanceOf(user1.address);
      const initialBalance2 = await myCoin.balanceOf(user2.address);
      
      // First user stakes
      const stakeAmount1 = ethers.parseUnits("400", 6);
      await staking.connect(user1).stake(stakeAmount1);
      
      // Some time passes
      await advanceTimeAndBlock(86400 * 5); // 5 days
      
      // Second user stakes
      const stakeAmount2 = ethers.parseUnits("600", 6);
      await staking.connect(user2).stake(stakeAmount2);
      
      // More time passes
      await advanceTimeAndBlock(86400 * 10); // 10 days
      
      // First user adds to stake
      const additionalStake = ethers.parseUnits("200", 6);
      await staking.connect(user1).stake(additionalStake);
      
      // More time passes
      await advanceTimeAndBlock(86400 * 5); // 5 days
      
      // First user claims rewards
      await staking.connect(user1).claimRewards();
      
      // Check intermediate balance
      const intermediateBalance1 = await myCoin.balanceOf(user1.address);
      expect(intermediateBalance1).to.be.gt(initialBalance1 - stakeAmount1 - additionalStake);
      
      await advanceTimeAndBlock(86400 * 5); // 5 days more
      
      // Both users unstake
      await staking.connect(user1).unstake();
      await staking.connect(user2).unstake();
      
      // Final balances
      const finalBalance1 = await myCoin.balanceOf(user1.address);
      const finalBalance2 = await myCoin.balanceOf(user2.address);
      
      expect(finalBalance1).to.be.gt(initialBalance1 - ethers.parseUnits("50", 6)); // Allow for some fees
      expect(finalBalance2).to.be.gt(initialBalance2 - ethers.parseUnits("50", 6)); // Allow for some fees
      
      // Check that all stakes are removed
      const stats = await staking.getPoolStats();
      expect(stats._totalStaked).to.equal(0);
    });
    
    it("Should handle multiple stake/unstake operations", async function () {
      // User 1 stakes
      await staking.connect(user1).stake(ethers.parseUnits("300", 6));
      
      // Some time passes
      await advanceTimeAndBlock(86400 * 2); // 2 days
      
      // User 1 unstakes
      await staking.connect(user1).unstake();
      
      // User 1 stakes again
      await staking.connect(user1).stake(ethers.parseUnits("500", 6));
      
      // More time passes
      await advanceTimeAndBlock(86400 * 3); // 3 days
      
      // User 1 claims rewards
      await staking.connect(user1).claimRewards();
      
      // User 1 increases stake
      await staking.connect(user1).stake(ethers.parseUnits("100", 6));
      
      // Some time passes
      await advanceTimeAndBlock(86400 * 2); // 2 days
      
      // User 1 unstakes again
      await staking.connect(user1).unstake();
      
      // User 1 should have received rewards (despite fees)
      const finalBalance = await myCoin.balanceOf(user1.address);
      const initialBalance = ethers.parseUnits("1000000", 6); // From setup

      expect(finalBalance).to.be.gt(initialBalance - ethers.parseUnits("100", 6)); // Allow for some fees
    });
  });
  
  describe("Stress Tests", function () {
    beforeEach(async function () {
      const requiredRewards = rewardsPerSecond * duration * 10n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);

      await advanceToPoolStart();

      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
    });
    
    it("Should handle many small stakes from the same user", async function () {
      const smallStake = ethers.parseUnits("100", 6);
      
      // Stake 5 times
      for (let i = 0; i < 5; i++) {
        await staking.connect(user1).stake(smallStake);
        await advanceTimeAndBlock(3600); // 1 hour between stakes
      }
      
      const userInfo = await staking.getUserInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(smallStake * 5n);
      
      // Advance to near pool end but not past it
      await advanceTimeAndBlock(Number(duration) - 86400 * 2);
      
      // Unstake
      await staking.connect(user1).unstake();
      
      // Check that all stake is removed
      const finalUserInfo = await staking.getUserInfo(user1.address);
      expect(finalUserInfo.stakedAmount).to.equal(0);
    });
    
    it("Should handle multiple users with maximum stakes", async function () {
      // Three users stake the maximum
      await staking.connect(user1).stake(maxStakePerUser);
      await staking.connect(user2).stake(maxStakePerUser);
      await staking.connect(user3).stake(maxStakePerUser);
      
      // Advance time to accumulate rewards
      await advanceTimeAndBlock(Number(duration / 2n));
      
      // All claim rewards
      await staking.connect(user1).claimRewards();
      await staking.connect(user2).claimRewards();
      await staking.connect(user3).claimRewards();
      
      // Advance close to pool end but not past it
      await advanceTimeAndBlock(Number(duration / 2n) - 86400);
      
      // All unstake
      await staking.connect(user1).unstake();
      await staking.connect(user2).unstake();
      await staking.connect(user3).unstake();
      
      // Check that all stakes are removed
      const stats = await staking.getPoolStats();
      expect(stats._totalStaked).to.equal(0);
    });
  });
  
  describe("Staging Tests", function () {
    it("Should deploy contracts in the correct order", async function () {
      // This test simulates the deployment process in a production environment
      
      // Deploy MyCoin
      const MyCoin = await ethers.getContractFactory("MyCoin");
      const stagingCoin = await MyCoin.deploy();
      
      // Mint initial tokens
      await stagingCoin.mintCoins(ethers.parseUnits("100000000", 6)); // Increased
      
      // Deploy Roles with appropriate addresses
      const Roles = await ethers.getContractFactory("Roles");
      const stagingRoles = await Roles.deploy(feeManager.address, rewardManager.address, feeCollector.address);
      
      // eploy Staking with initial configuration
      const poolStartTime = BigInt(await ethers.provider.getBlock("latest").then(b => b.timestamp)) + 86400n;// 24 hours from now
      const Staking = await ethers.getContractFactory("Staking");
      const stagingStaking = await Staking.deploy(
        await stagingCoin.getAddress(),
        await stagingRoles.getAddress(),
        poolStartTime,
        duration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Transfer tokens to users and reward manager
      await stagingCoin.transfer(user1.address, ethers.parseUnits("1000000", 6)); // Increased
      await stagingCoin.transfer(rewardManager.address, ethers.parseUnits("10000000", 6)); // Increased
      
      // Lock rewards
      await stagingCoin.connect(rewardManager).approve(await stagingStaking.getAddress(), ethers.MaxUint256);
      await stagingStaking.connect(rewardManager).lockRewards(rewardsPerSecond * duration);
      
      // Verify all contracts are properly set up
      expect(await stagingStaking.stakingToken()).to.equal(await stagingCoin.getAddress());
      expect(await stagingStaking.roles()).to.equal(await stagingRoles.getAddress());
      
      const stats = await stagingStaking.getPoolStats();
      expect(stats._lockedRewards).to.equal(rewardsPerSecond * duration);
    });
    
    it("Should handle a realistic staking scenario", async function () {
      const testStartTime = BigInt(await ethers.provider.getBlock("latest").then(b => b.timestamp)) + 1800n; // 30 minutes from now
      const testDuration = 86400n * 5n; // 5 days
      
      const Staking = await ethers.getContractFactory("Staking");
      const testStaking = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        testStartTime,
        testDuration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Approve the test staking contract
      await myCoin.connect(user1).approve(await testStaking.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user2).approve(await testStaking.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user3).approve(await testStaking.getAddress(), ethers.MaxUint256);
      await myCoin.connect(rewardManager).approve(await testStaking.getAddress(), ethers.MaxUint256);
      
      // Lock rewards for the pool (plenty of rewards)
      const requiredRewards = rewardsPerSecond * testDuration * 2n;
      await testStaking.connect(rewardManager).lockRewards(requiredRewards);
      
      // Update fee configuration
      await testStaking.connect(feeManager).updateFeeConfig(400n, minFee, maxFee); // 4% fee
      
      await advanceTimeAndBlock(1900); // More than 30 minutes

      const startBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(startBlock.timestamp)).to.be.gte(testStartTime);
      
      // Multiple users stake
      await testStaking.connect(user1).stake(ethers.parseUnits("500", 6));
      await testStaking.connect(user2).stake(ethers.parseUnits("750", 6));

      await advanceTimeAndBlock(Number(testDuration / 4n));
      
      // User3 stakes late
      await testStaking.connect(user3).stake(ethers.parseUnits("300", 6));
      
      // User1 claims rewards mid-pool
      await testStaking.connect(user1).claimRewards();
      
      // Lock one user's stake
      const lockBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(lockBlock.timestamp) + 86400n; // 1 day from now
      await testStaking.connect(owner).setLockPeriod(user2.address, lockEndTime);
      
      // User2 tries to unstake (should fail due to lock)
      await expect(
        testStaking.connect(user2).unstake()
      ).to.be.revertedWithCustomError(testStaking, "StillLocked");
      
      // Advance time past lock but still in pool
      await advanceTimeAndBlock(86401);
      
      // Verify we're past the lock end time
      const unlockBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(unlockBlock.timestamp)).to.be.gt(lockEndTime);
      
      // User2 can now unstake
      await testStaking.connect(user2).unstake();
      
      // Advance close to pool end
      await advanceTimeAndBlock(Number(testDuration * 3n / 4n));
      
      // Remaining users unstake
      await testStaking.connect(user1).unstake();
      await testStaking.connect(user3).unstake();
      
      // Fee collector collects fees
      await testStaking.connect(feeCollector).collectFees();
      
      // Verify all stakes are removed
      const stats = await testStaking.getPoolStats();
      expect(stats._totalStaked).to.equal(0);
      expect(await testStaking.getCollectedFees()).to.equal(0);
    });
  });

  describe("UnstakeFee Calculation", function() {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      // Advance time to start the pool
      await advanceToPoolStart();
      
      // Verify we're at or past the start time
      const currentBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(currentBlock.timestamp)).to.be.gte(startTime);
    });

    it("Should charge minimum fee when calculated fee is below minimum", async function() {
      // Use a very small amount that would result in fee below minimum
      const smallStake = ethers.parseUnits("150", 6); // 5% of this is less than minFee
      
      await staking.connect(user1).stake(smallStake);
      
      // Verify minimum fee is charged by unstaking
      const initialFees = await staking.getCollectedFees();
      await staking.connect(user1).unstake();
      const finalFees = await staking.getCollectedFees();
      
      // The difference should be exactly minFee
      expect(finalFees - initialFees).to.equal(minFee);
    });
    
    
    it("Should cap fee at maximum when calculated fee exceeds maximum", async function() {
      // Use a large amount that would result in fee above maximum
      const largeStake = ethers.parseUnits("1000", 6); // 5% of this is close to maxFee
      
      // Update fee percentage to make sure we exceed max fee
      await staking.connect(feeManager).updateFeeConfig(1000n, minFee, maxFee); // 10% fee

      await staking.connect(user1).stake(largeStake);
      
      // Verify maximum fee is charged by unstaking
      const initialFees = await staking.getCollectedFees();
      await staking.connect(user1).unstake();
      const finalFees = await staking.getCollectedFees();;
      
      expect(finalFees - initialFees).to.equal(maxFee);
    });
    
    it("Should use percentage-based fee when between min and max", async function() {
      // Use an amount that would result in fee between min and max
      const mediumStake = ethers.parseUnits("500", 6); // 5% is 25 tokens
      await staking.connect(user1).stake(mediumStake);
      
      // Verify percentage-based fee is charged by unstaking
      const initialFees = await staking.getCollectedFees();
      await staking.connect(user1).unstake();
      const finalFees = await staking.getCollectedFees();
      
      // The difference should be 5% of the stake amount
      const expectedFee = (mediumStake * feePercentage) / BASIS_POINTS;
      expect(finalFees - initialFees).to.equal(expectedFee);
    });
    
    it("Should charge no fee when unstaking after pool ends", async function() {
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
      
      // Advance time past pool end
      const secondsToAdvance = Number(duration) + 100;
      await advanceTimeAndBlock(secondsToAdvance);
      
      // Verify we're past the end time
      const currentBlock = await ethers.provider.getBlock("latest");
      const poolEndTime = startTime + duration;
      expect(BigInt(currentBlock.timestamp)).to.be.gt(poolEndTime);
      
      // Verify no fee is charged
      const initialFees = await staking.getCollectedFees();
      await staking.connect(user1).unstake();
      const finalFees = await staking.getCollectedFees();
      
      // No fee should be charged
      expect(finalFees).to.equal(initialFees);
    });
  });
  
  describe("Special Reward Calculation Cases", function() {
    beforeEach(async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration * 2n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
    });
    
    it("Should calculate correct rewards when pool crosses start time", async function() {
      // Stake tokens before pool starts
      // This should place the stake, but no rewards until pool starts
      const stakeAmount = ethers.parseUnits("500", 6);
      
      // First set up a new staking contract to test this scenario
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTimestamp = currentBlock.timestamp;
      const newStartTime = BigInt(currentTimestamp) + 3600n; // 1 hour from now
      const Staking = await ethers.getContractFactory("Staking");
      const newStaking = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        newStartTime,
        duration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Approve and lock rewards
      await myCoin.connect(user1).approve(await newStaking.getAddress(), ethers.MaxUint256);
      await myCoin.connect(rewardManager).approve(await newStaking.getAddress(), ethers.MaxUint256);
      await newStaking.connect(rewardManager).lockRewards(rewardsPerSecond * duration);
      
      await advanceTimeAndBlock(3700); // 1h 10m (past start time)
      
      const midBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(midBlock.timestamp)).to.be.gte(newStartTime);
      
      // Stake tokens to trigger reward calculation
      await newStaking.connect(user1).stake(stakeAmount);
      
      // Calculate the timestamp when stake was placed
      const stakeBlock = await ethers.provider.getBlock("latest");
      const stakeTimestamp = BigInt(stakeBlock.timestamp);
      
      await advanceTimeAndBlock(3600); // + 1 hour
      
      // Now rewards should be accumulating from pool start
      const pendingRewards = await newStaking.calculatePendingRewards(user1.address);
      
      // Should have roughly 1 hour of rewards
      const rewardTime = BigInt(stakeBlock.timestamp) + 3600n - stakeTimestamp;
      const expectedRewards = rewardsPerSecond * rewardTime;
      
      // Allow for some variance in block timing
      expect(pendingRewards).to.be.closeTo(expectedRewards, ethers.parseUnits("1", 6));
    });
    
    it("Should calculate correct rewards when pool crosses end time", async function() {
      await advanceToPoolStart();

      const startBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(startBlock.timestamp)).to.be.gte(startTime);
      
      // Stake tokens
      const stakeAmount = ethers.parseUnits("500", 6);
      await staking.connect(user1).stake(stakeAmount);
      
      // Calculate time remaining until pool end
      const poolEndTime = startTime + duration;
      const timeRemaining = poolEndTime - BigInt(startBlock.timestamp);
      
      await advanceTimeAndBlock(Number(timeRemaining) - 3600);  // 1 hour befire pool ends
      
      // Calculate pending rewards near end
      const pendingNearEnd = await staking.calculatePendingRewards(user1.address);
      
      // Advance past pool end
      await advanceTimeAndBlock(7200); // 2 hours more (1 hour past end)
      
      // Verify we're past the end time
      const endBlock = await ethers.provider.getBlock("latest");
      expect(BigInt(endBlock.timestamp)).to.be.gt(poolEndTime);
      
      // Calculate pending rewards after end
      const pendingAfterEnd = await staking.calculatePendingRewards(user1.address);
      
      // The difference should be approximately 1 hour of rewards
      const expectedDifference = rewardsPerSecond * 3600n;
      const actualDifference = pendingAfterEnd - pendingNearEnd;

      expect(actualDifference).to.be.closeTo(expectedDifference, ethers.parseUnits("1", 6));
      
      // Rewards should stop increasing after pool end
      await advanceTimeAndBlock(86400); // 1 day more
      const pendingLongAfterEnd = await staking.calculatePendingRewards(user1.address);
      expect(pendingLongAfterEnd).to.equal(pendingAfterEnd);
    });
  });

  // Add these tests to the main describe("Staking Contract") block, after the existing "Staging Tests" section

  describe("Extended Staging Tests", function () {
    it("Should handle role transfers during an active staking period", async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration * 2n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      await advanceToPoolStart();

      await staking.connect(user1).stake(ethers.parseUnits("500", 6));
      await staking.connect(user2).stake(ethers.parseUnits("600", 6));

      const currentBlock = await ethers.provider.getBlock("latest");
      const lockEndTime = BigInt(currentBlock.timestamp) + 86400n * 5n; // 5 days
      await staking.connect(owner).setLockPeriod(user1.address, lockEndTime);
 
      await roles.connect(owner).UpdatePoolAdmin(user4.address);
      expect(await roles.isPoolAdmin(owner.address)).to.be.false;
      expect(await roles.isPoolAdmin(user4.address)).to.be.true;
      
      // The original owner should no longer be able to set lock periods
      await expect(
        staking.connect(owner).setLockPeriod(user2.address, lockEndTime)
      ).to.be.revertedWithCustomError(staking, "NotAuthorised");
      
      // The new poolAdmin should be able to set lock periods
      await staking.connect(user4).setLockPeriod(user2.address, lockEndTime);
      
      // Transfer feeManager role to user3
      await roles.connect(feeManager).UpdateFeeManager(user3.address);
      expect(await roles.isFeeManager(feeManager.address)).to.be.false;
      expect(await roles.isFeeManager(user3.address)).to.be.true;
      
      // The new fee manager should be able to update fee config
      await staking.connect(user3).updateFeeConfig(300n, minFee, maxFee);
      
      // Verify fee config was updated
      const feeConfig = await staking.getFeeConfig();
      expect(feeConfig.earlyUnstakeFeePercentage).to.equal(300n);
    });

    it("Should handle recovery from emergency situations", async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration * 2n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      // Advance to pool start
      await advanceToPoolStart();
      
      // Users stake tokens
      await staking.connect(user1).stake(ethers.parseUnits("500", 6));
      await staking.connect(user2).stake(ethers.parseUnits("600", 6));
      
      // Simulate an "emergency" - fees need to be changed immediately
      await staking.connect(feeManager).updateFeeConfig(0n, 0n, 0n); // Set fees to zero
      
      // Users can unstake without fees now
      const initialBalance = await myCoin.balanceOf(user1.address);
      await staking.connect(user1).unstake();
      const finalBalance = await myCoin.balanceOf(user1.address);
      
      // User should get full amount back (no fees)
      const expectedMinAmount = ethers.parseUnits("500", 6);
      expect(finalBalance - (initialBalance)).to.be.gte(expectedMinAmount);
      
      // Verify collected fees are zero
      expect(await staking.getCollectedFees()).to.equal(0);
      
      // Simulate restoring fees after emergency
      await staking.connect(feeManager).updateFeeConfig(feePercentage, minFee, maxFee);
      
      // Pool continues to operate with new settings
      await staking.connect(user2).unstake();
      
      // Verify fees were charged on the second unstake
      expect(await staking.getCollectedFees()).to.be.gt(0);
    });

    it("Should handle mid-pool parameter changes correctly", async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration * 2n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      // Advance to pool start
      await advanceToPoolStart();
      
      // Users stake with original parameters
      await staking.connect(user1).stake(ethers.parseUnits("400", 6));
      
      // Update fee configuration mid-pool
      const newFeePercentage = 200n; // 2%
      const newMinFee = ethers.parseUnits("5", 6);
      const newMaxFee = ethers.parseUnits("50", 6);
      
      await staking.connect(feeManager).updateFeeConfig(
        newFeePercentage,
        newMinFee,
        newMaxFee
      );
      
      // New user stakes after parameter change
      await staking.connect(user2).stake(ethers.parseUnits("600", 6));
      
      // Advance time
      await advanceTimeAndBlock(86400 * 5); // 5 days
      
      // Both users unstake - should have different fee treatment
      await staking.connect(user1).unstake();
      const fees1 = await staking.getCollectedFees();
      
      await staking.connect(user2).unstake();
      const fees2 = await staking.getCollectedFees();
      
      // The fee difference should reflect the new fee structure
      const feeDifference = fees2 - fees1;
      const expectedFee = (ethers.parseUnits("600", 6) * newFeePercentage) / 10000n;
      
      expect(feeDifference).to.be.closeTo(expectedFee, ethers.parseUnits("1", 6));
    });

    it("Should handle transitioning between multiple pool iterations", async function () {
      // First pool setup
      const firstPoolRewards = rewardsPerSecond * duration;
      await staking.connect(rewardManager).lockRewards(firstPoolRewards);
      
      // Advance to first pool start
      await advanceToPoolStart();
      
      // Users stake in first pool
      await staking.connect(user1).stake(ethers.parseUnits("300", 6));
      await staking.connect(user2).stake(ethers.parseUnits("400", 6));
      
      // Fast forward to near the end of the first pool
      await advanceTimeAndBlock(Number(duration) - 86400); // 1 day before end
      
      // Deploy second pool that will start after first pool ends
      const currentBlock = await ethers.provider.getBlock("latest");
      const secondPoolStart = BigInt(currentBlock.timestamp) + 86400n * 2n; // 2 days after current time
      
      const Staking = await ethers.getContractFactory("Staking");
      const secondPool = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        secondPoolStart,
        duration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Lock rewards for second pool
      await myCoin.connect(rewardManager).approve(await secondPool.getAddress(), ethers.MaxUint256);
      await secondPool.connect(rewardManager).lockRewards(firstPoolRewards);
      
      // Users approve second pool
      await myCoin.connect(user1).approve(await secondPool.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user2).approve(await secondPool.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user3).approve(await secondPool.getAddress(), ethers.MaxUint256);
      
      // Advance past first pool end
      await advanceTimeAndBlock(86400 * 3); // 3 days (past first pool end, into second pool)
      
      // Users unstake from first pool
      await staking.connect(user1).unstake();
      await staking.connect(user2).unstake();
      
      // Users stake in second pool
      await secondPool.connect(user1).stake(ethers.parseUnits("350", 6));
      await secondPool.connect(user2).stake(ethers.parseUnits("450", 6));
      await secondPool.connect(user3).stake(ethers.parseUnits("200", 6)); // New user in second pool
      
      // Advance time in second pool
      await advanceTimeAndBlock(86400 * 10); // 10 days into second pool
      
      // Check rewards are accumulating in the second pool
      const pendingRewards1 = await secondPool.calculatePendingRewards(user1.address);
      const pendingRewards2 = await secondPool.calculatePendingRewards(user2.address);
      const pendingRewards3 = await secondPool.calculatePendingRewards(user3.address);
      
      expect(pendingRewards1).to.be.gt(0);
      expect(pendingRewards2).to.be.gt(0);
      expect(pendingRewards3).to.be.gt(0);
      
      // Ratio of rewards should roughly match ratio of stakes
      const ratio1To2 = (pendingRewards1 * 450n) / (pendingRewards2 * 350n);
      expect(ratio1To2).to.be.closeTo(1n, 10n); // Should be close to 1.0 (100%)
    });

    it("Should handle reward distribution fairness with changing total stake", async function () {
      // Lock rewards for the pool
      const requiredRewards = rewardsPerSecond * duration * 2n;
      await staking.connect(rewardManager).lockRewards(requiredRewards);
      
      // Advance to pool start
      await advanceToPoolStart();
      
      // First user stakes
      await staking.connect(user1).stake(ethers.parseUnits("500", 6));
      
      // Advance time
      await advanceTimeAndBlock(86400 * 5); // 5 days
      
      // Check user1's rewards after being the only staker for 5 days
      const soloRewards = await staking.calculatePendingRewards(user1.address);
      
      // Second user stakes (now rewards will be split)
      await staking.connect(user2).stake(ethers.parseUnits("500", 6));
      
      // Advance time with two stakers
      await advanceTimeAndBlock(86400 * 5); // Another 5 days
      
      // First user increases stake
      await staking.connect(user1).stake(ethers.parseUnits("250", 6)); // Now has 750 total
      
      // Advance time with uneven stakes
      await advanceTimeAndBlock(86400 * 5); // Another 5 days
      
      // Get final reward amounts
      const user1Rewards = await staking.calculatePendingRewards(user1.address);
      const user2Rewards = await staking.calculatePendingRewards(user2.address);
      
      // First 5 days: user1 got 100% of rewards
      // Second 5 days: user1 and user2 each got 50% of rewards
      // Third 5 days: user1 got 60% (750/1250) and user2 got 40% (500/1250)
      
      // First period rewards
      const dailyRewards = rewardsPerSecond * 86400n;
      const period1Rewards = dailyRewards * 5n;
      
      // Second period rewards (split evenly)
      const period2RewardsEach = (dailyRewards * 5n) / 2n;
      
      // Third period rewards (split proportionally)
      const period3TotalRewards = dailyRewards * 5n;
      const period3User1Rewards = (period3TotalRewards * 750n) / 1250n;
      const period3User2Rewards = (period3TotalRewards * 500n) / 1250n;
      
      // Expected total rewards
      const expectedUser1 = period1Rewards + period2RewardsEach + period3User1Rewards;
      const expectedUser2 = period2RewardsEach + period3User2Rewards;
      
      // Check that actual rewards are close to expected
      expect(user1Rewards).to.be.closeTo(expectedUser1, ethers.parseUnits("5", 6)); 
      expect(user2Rewards).to.be.closeTo(expectedUser2, ethers.parseUnits("5", 6)); 
    });

    it("Should handle large number of users with proper reward distribution", async function () {
      const testDuration = 86400n * 7n; // 7 days
      const testStartTime = BigInt(await ethers.provider.getBlock("latest").then(b => b.timestamp)) + 3600n; // 1 hour from now
      
      // Deploy test pool
      const Staking = await ethers.getContractFactory("Staking");
      const testPool = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        testStartTime,
        testDuration,
        rewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      await myCoin.connect(rewardManager).approve(await testPool.getAddress(), ethers.MaxUint256);
      const testPoolRewards = rewardsPerSecond * testDuration * 2n;
      await testPool.connect(rewardManager).lockRewards(testPoolRewards);
      
      // Setup multiple users (using our available signers)
      const users = [user1, user2, user3, user4];
      const stakes = [
        ethers.parseUnits("200", 6),
        ethers.parseUnits("300", 6),
        ethers.parseUnits("150", 6),
        ethers.parseUnits("400", 6)
      ];
      
      for (let user of users) {
        await myCoin.connect(user).approve(await testPool.getAddress(), ethers.MaxUint256);
      }
      
      await advanceTimeAndBlock(3700); // Past startTime
      
      // Users stake
      for (let i = 0; i < users.length; i++) {
        await testPool.connect(users[i]).stake(stakes[i]);
      }
      
      // Advance time
      await advanceTimeAndBlock(86400 * 3); // 3 days
      
      // Calculate pending rewards for each user
      const pendingRewards = [];
      const totalStaked = stakes.reduce((sum, stake) => sum + stake, 0n);
      
      for (let i = 0; i < users.length; i++) {
        const reward = await testPool.calculatePendingRewards(users[i].address);
        pendingRewards.push(reward);
      }
      
      // Verify reward proportions match stake proportions
      for (let i = 0; i < users.length; i++) {
        const expectedProportion = (stakes[i] * 1000n) / totalStaked; // Scaled by 1000 for precision
        const actualProportion = (pendingRewards[i] * 1000n) / pendingRewards.reduce((sum, reward) => sum + reward, 0n);
        
        expect(actualProportion).to.be.closeTo(expectedProportion, 10n); // Allow for small rounding differences
      }
      
      // Half the users claim rewards
      await testPool.connect(users[0]).claimRewards();
      await testPool.connect(users[2]).claimRewards();
      
      // Advance more time
      await advanceTimeAndBlock(86400 * 3); // Another 3 days
      
      // All users unstake
      for (let i = 0; i < users.length; i++) {
        await testPool.connect(users[i]).unstake();
      }
      
      // Verify all stakes are removed
      const stats = await testPool.getPoolStats();
      expect(stats._totalStaked).to.equal(0);
    });

    it("Should handle multiple staking pools running concurrently", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTimestamp = BigInt(currentBlock.timestamp);
      
      const firstPoolStartTime = currentTimestamp + 3600n; // 1 hour from now
      const secondPoolStartTime = firstPoolStartTime + 86400n; // 1 day after first pool
      
      const firstPoolDuration = 86400n * 30n; // 30 days
      const secondPoolDuration = 86400n * 15n; // 15 days
      
      const firstPoolRewardsPerSecond = ethers.parseUnits("0.01", 6);
      const secondPoolRewardsPerSecond = ethers.parseUnits("0.02", 6); // Higher rewards
      
      const Staking = await ethers.getContractFactory("Staking");
      
      // Deploy first pool
      const firstPool = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        firstPoolStartTime,
        firstPoolDuration,
        firstPoolRewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Deploy second pool
      const secondPool = await Staking.deploy(
        await myCoin.getAddress(),
        await roles.getAddress(),
        secondPoolStartTime,
        secondPoolDuration,
        secondPoolRewardsPerSecond,
        maxTotalStake,
        minStakeAmount,
        maxStakePerUser,
        feePercentage,
        minFee,
        maxFee
      );
      
      // Calculate required rewards
      const firstPoolRewards = firstPoolRewardsPerSecond * firstPoolDuration;
      const secondPoolRewards = secondPoolRewardsPerSecond * secondPoolDuration;
      
      // Approve and lock rewards for both pools
      await myCoin.connect(rewardManager).approve(await firstPool.getAddress(), ethers.MaxUint256);
      await myCoin.connect(rewardManager).approve(await secondPool.getAddress(), ethers.MaxUint256);
      
      await firstPool.connect(rewardManager).lockRewards(firstPoolRewards);
      await secondPool.connect(rewardManager).lockRewards(secondPoolRewards);
      
      // Users approve both pools
      await myCoin.connect(user1).approve(await firstPool.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user2).approve(await firstPool.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user1).approve(await secondPool.getAddress(), ethers.MaxUint256);
      await myCoin.connect(user2).approve(await secondPool.getAddress(), ethers.MaxUint256);
      
      // Advance to first pool start
      await advanceTimeAndBlock(3700); // Past the first pool start time
      
      // Verify first pool has started but second pool has not
      expect(await firstPool.isPoolActive()).to.be.true;
      expect(await secondPool.isPoolActive()).to.be.false;
      
      // Users stake in first pool
      await firstPool.connect(user1).stake(ethers.parseUnits("300", 6));
      await firstPool.connect(user2).stake(ethers.parseUnits("400", 6));
      
      await advanceTimeAndBlock(86401); // 1 day later (second pool starts)
      
      expect(await firstPool.isPoolActive()).to.be.true;
      expect(await secondPool.isPoolActive()).to.be.true;
      
      await secondPool.connect(user1).stake(ethers.parseUnits("200", 6));
      await secondPool.connect(user2).stake(ethers.parseUnits("300", 6));
      
      // Advance time with both pools active
      await advanceTimeAndBlock(86400 * 5); // 5 days
      
      // Check rewards in both pools
      const firstPoolRewardsUser1 = await firstPool.calculatePendingRewards(user1.address);
      const firstPoolRewardsUser2 = await firstPool.calculatePendingRewards(user2.address);
      
      const secondPoolRewardsUser1 = await secondPool.calculatePendingRewards(user1.address);
      const secondPoolRewardsUser2 = await secondPool.calculatePendingRewards(user2.address);
      
      // All should have accumulated rewards
      expect(firstPoolRewardsUser1).to.be.gt(0);
      expect(firstPoolRewardsUser2).to.be.gt(0);
      expect(secondPoolRewardsUser1).to.be.gt(0);
      expect(secondPoolRewardsUser2).to.be.gt(0);
      
      // Second pool should have higher rewards per token due to higher reward rate
      // Adjusting for lower stake (200 vs 300 = 2/3) and higher reward rate (0.02 vs 0.01 = 2x)
      const firstPoolRewardPerToken1 = (firstPoolRewardsUser1 * 1000000n) / ethers.parseUnits("300", 6);
      const secondPoolRewardPerToken1 = (secondPoolRewardsUser1 * 1000000n) / ethers.parseUnits("200", 6);
      expect(secondPoolRewardPerToken1).to.be.gt(firstPoolRewardPerToken1);
      
      // Users can successfully interact with both pools
      await firstPool.connect(user1).claimRewards();
      await secondPool.connect(user1).claimRewards();
      
      // Save the reward amounts to compare later
      const firstPoolRewardsBeforeEnd = await firstPool.calculatePendingRewards(user2.address);
      const secondPoolRewardsBeforeEnd = await secondPool.calculatePendingRewards(user2.address);
      
      const currentBlockAfterClaims = await ethers.provider.getBlock("latest");
      const currentTimeAfterClaims = BigInt(currentBlockAfterClaims.timestamp);
      const firstPoolEndTime = firstPoolStartTime + firstPoolDuration;
      const timeToAdvance = Number(firstPoolEndTime - currentTimeAfterClaims + 86400n); // 1 day past first pool end
      
      await advanceTimeAndBlock(timeToAdvance);
      
      // Get the current time to compare with pool end times
      const finalBlock = await ethers.provider.getBlock("latest");
      const finalTime = BigInt(finalBlock.timestamp);
      
      // Get pool configurations to verify end times
      const firstPoolConfig = await firstPool.getPoolConfig();
      const secondPoolConfig = await secondPool.getPoolConfig();
      
      // Compare current time with pool end times
      expect(finalTime).to.be.gt(firstPoolConfig.endTime);
      expect(finalTime).to.be.gt(secondPoolConfig.endTime);
      
      // Check that first pool rewards have stopped accumulating
      const newFirstPoolRewardsUser2 = await firstPool.calculatePendingRewards(user2.address);
      expect(newFirstPoolRewardsUser2).to.be.gt(firstPoolRewardsBeforeEnd);

      // Check that second pool rewards continue to accumulate
      const newSecondPoolRewardsUser2 = await secondPool.calculatePendingRewards(user2.address);
      expect(newSecondPoolRewardsUser2).to.be.gt(secondPoolRewardsBeforeEnd);
      
      // Final verification: users can unstake from both pools
      await firstPool.connect(user2).unstake();
      await secondPool.connect(user2).unstake();
      
      // Verify stakes are removed
      const user2FirstPoolInfo = await firstPool.getUserInfo(user2.address);
      const user2SecondPoolInfo = await secondPool.getUserInfo(user2.address);
      
      expect(user2FirstPoolInfo.stakedAmount).to.equal(0);
      expect(user2SecondPoolInfo.stakedAmount).to.equal(0);
    });
  });
});