    // SPDX-License-Identifier: MIT
    pragma solidity 0.8.20;

    import "./myCoin.sol";
    import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
    import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
    import "@openzeppelin/contracts/access/AccessControl.sol";
    import "@openzeppelin/contracts/utils/math/Math.sol";

    contract Staking is ReentrancyGuard, AccessControl {
        using SafeERC20 for MyCoin;
        using Math for uint256;

        bytes32 public constant POOL_ADMIN_ROLE = keccak256("POOL_ADMIN_ROLE");
        bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
        bytes32 public constant FEE_COLLECTOR_ROLE = keccak256("FEE_COLLECTOR_ROLE");
        bytes32 public constant REWARD_MANAGER_ROLE = keccak256("REWARD_MANAGER_ROLE");

        uint256 private constant PRECISION_FACTOR = 1e18;
        uint256 private constant BASIS_POINTS = 10000;

        error PoolNotStarted();
        error PoolEnded();
        error StakeTooLow();
        error StakeTooHigh();
        error PoolAlreadyStarted();
        error PoolFull();
        error StillLocked();
        error NoStakeFound();
        error InvalidFeePercentage();
        error InvalidFeeLimit();
        error NoFeeToCollect();
        error NoRewardsToClaim();
        error NotEnoughRewardsLocked();
        error InvalidAddress();
        error AddressConflict();
        error NotAuthorized();

        address public poolAdmin;
        address public feeManager;
        address public feeCollector;
        address public rewardManager;

        struct FeeConfig {
            uint256 earlyUnstakeFeePercentage;
            uint256 minimumFee;
            uint256 maximumFee;
        }

        struct PoolConfig {
            uint256 startTime;
            uint256 endTime;
            uint256 rewardsPerSecond;
            uint256 maxTotalStake;
            uint256 minStakeAmount;
            uint256 maxStakePerUser;
            FeeConfig feeConfig;
        }

        struct UserInfo {
            uint256 stakedAmount;
            uint256 rewardDebt;
            uint256 lastUpdateTime;
            uint256 lockEndTime;
        }

        struct RewardCalc {
            uint256 currentAccumulated;
            uint256 timeElapsed;
            uint256 effectiveCurrentTime;
            uint256 effectiveLastUpdate;
            uint256 additionalRewards;
            uint256 additionalRewardsPerStake;
        }

        MyCoin public stakingToken;

        PoolConfig public poolConfig;
        uint256 public totalStaked;
        uint256 public accumulatedRewardsPerStake;
        uint256 public lockedRewards;
        uint256 public lastUpdateTime;
        uint256 public collectedFees;

        mapping (address => UserInfo) public stakes;

        //Events
        event Staked(address indexed user, uint256 amount, uint256 timestamp);
        event Unstaked(address indexed user, uint256 amount, uint256 feeCharged, uint256 rewardClaimed, uint256 timestamp);
        event RewardClaimed(address indexed user, uint256 amount, uint256 timestamp);
        event FeeCollected(address indexed collector, uint256 amount, uint256 timestamp);
        event FeeConfigUpdate(address indexed manager, uint256 feePercentage, uint256 minimumFee, uint256 maximumFee, uint256 timestamp);
        event PoolUpdated(uint256 startTime, uint256 endTime, uint256 rewardsPerSecond, uint256 maxTotalStake, uint256 timestamp);
        event RewardsLocked(address indexed locker, uint256 amount, uint256 timestamp);
        event RewardsUnlocked(address indexed unlocker, uint256 amount, uint256 timestamp);
        event RoleUpdated(bytes32 indexed role, address oldAccount, address newAddress);

        constructor(
            address _stakingToken,
            address _feeManager,
            address _rewardManager,
            address _feeCollector,
            uint256 _startTime,
            uint256 _duration,
            uint256 _rewardsPerSecond,
            uint256 _maxTotalStake,
            uint256 _minStakeAmount,
            uint256 _maxStakePerUser,
            uint256 _feePercentage,
            uint256 _minFee,
            uint256 _maxFee
        ) { 
            stakingToken = MyCoin(_stakingToken);   

            if (_feeManager == address(0) || _feeCollector == address(0) || _rewardManager == address(0)) {
                revert InvalidAddress();
            }

            if (
                msg.sender == _feeManager ||
                msg.sender == _feeCollector ||
                msg.sender == _rewardManager ||
                _feeManager == _feeCollector ||
                _feeManager == _rewardManager ||
                _feeCollector == _rewardManager
            ) {
                revert AddressConflict();
            }

            _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
            _grantRole(POOL_ADMIN_ROLE, msg.sender);
            _grantRole(FEE_MANAGER_ROLE, _feeManager);
            _grantRole(FEE_COLLECTOR_ROLE, _feeCollector);
            _grantRole(REWARD_MANAGER_ROLE, _rewardManager);

            poolAdmin = msg.sender;
            feeManager = _feeManager;
            rewardManager = _rewardManager;
            feeCollector = _feeCollector;

            poolConfig = PoolConfig({
                startTime : _startTime,
                endTime : _startTime + _duration,
                rewardsPerSecond : _rewardsPerSecond,
                maxTotalStake : _maxTotalStake,
                minStakeAmount : _minStakeAmount,
                maxStakePerUser : _maxStakePerUser,
                feeConfig : FeeConfig({
                    earlyUnstakeFeePercentage : _feePercentage,
                    minimumFee : _minFee,
                    maximumFee : _maxFee
                })
            });

            lastUpdateTime = block.timestamp;
        }

        function updatePoolAdmin(address newAdmin) external onlyRole(POOL_ADMIN_ROLE) {
            if (newAdmin == address(0)) revert InvalidAddress();

            if (
                hasRole(FEE_MANAGER_ROLE, newAdmin) ||
                hasRole(FEE_COLLECTOR_ROLE, newAdmin) ||
                hasRole(REWARD_MANAGER_ROLE, newAdmin)
            ) {
                revert AddressConflict();
            }

            address oldAdmin = poolAdmin;
            _revokeRole(POOL_ADMIN_ROLE, oldAdmin);
            _grantRole(POOL_ADMIN_ROLE, newAdmin);
            poolAdmin = newAdmin;

            emit RoleUpdated(POOL_ADMIN_ROLE, oldAdmin, newAdmin);
        }

        function updateFeeManager(address newFeeManager) external onlyRole(FEE_MANAGER_ROLE) {
            if (newFeeManager == address(0)) revert InvalidAddress(); 

            if (
                hasRole(POOL_ADMIN_ROLE, newFeeManager) ||
                hasRole(FEE_COLLECTOR_ROLE, newFeeManager) ||
                hasRole(REWARD_MANAGER_ROLE, newFeeManager)
            ) {
                revert AddressConflict();
            }

            address oldFeeManager = feeManager;
            _revokeRole(FEE_MANAGER_ROLE, oldFeeManager);
            _grantRole(FEE_MANAGER_ROLE, newFeeManager);
            feeManager = newFeeManager;

            emit RoleUpdated(FEE_MANAGER_ROLE, oldFeeManager, newFeeManager);
        }

        function updateFeeCollector(address newFeeCollector) external onlyRole(FEE_COLLECTOR_ROLE) {
            if (newFeeCollector == address(0)) revert InvalidAddress();

            if (
                hasRole(POOL_ADMIN_ROLE, newFeeCollector) ||
                hasRole(FEE_MANAGER_ROLE, newFeeCollector) ||
                hasRole(REWARD_MANAGER_ROLE, newFeeCollector)
            ) {
                revert AddressConflict();
            }    

            address oldFeeCollector = feeCollector;
            _revokeRole(FEE_COLLECTOR_ROLE, oldFeeCollector);
            _grantRole(FEE_COLLECTOR_ROLE, newFeeCollector);
            feeCollector = newFeeCollector;

            emit RoleUpdated(FEE_COLLECTOR_ROLE, oldFeeCollector, newFeeCollector);
        }

        function updateRewardManager(address newRewardManager) external onlyRole(REWARD_MANAGER_ROLE) {
            if (newRewardManager == address(0)) revert InvalidAddress();

            if (
                hasRole(POOL_ADMIN_ROLE, newRewardManager) ||
                hasRole(FEE_COLLECTOR_ROLE, newRewardManager) ||
                hasRole(FEE_MANAGER_ROLE, newRewardManager)
            ) {
                revert AddressConflict();
            }

            address oldRewardManager = rewardManager;
            _revokeRole(REWARD_MANAGER_ROLE, oldRewardManager);
            _grantRole(REWARD_MANAGER_ROLE, newRewardManager);
            rewardManager = newRewardManager;

            emit RoleUpdated(REWARD_MANAGER_ROLE, oldRewardManager, newRewardManager);
        }

        function stake(uint256 amount) external nonReentrant {
            if(block.timestamp < poolConfig.startTime) revert PoolNotStarted();
            if(block.timestamp >= poolConfig.endTime) revert PoolEnded();
            if(amount < poolConfig.minStakeAmount) revert StakeTooLow();

            updatePoolRewards();

            UserInfo storage user = stakes[msg.sender];

            uint256 newTotal = totalStaked + amount;
            if(newTotal > poolConfig.maxTotalStake) revert PoolFull();

            if (user.stakedAmount == 0) {
                if (amount > poolConfig.maxStakePerUser) revert StakeTooHigh();

                user.stakedAmount = amount;
                user.rewardDebt = Math.mulDiv(amount, accumulatedRewardsPerStake, PRECISION_FACTOR);
                user.lastUpdateTime = block.timestamp;
                user.lockEndTime = 0;
            } else {
                uint256 pendingReward = calculatePendingRewards(msg.sender);

                uint256 newStake = user.stakedAmount + amount;
                if(newStake > poolConfig.maxStakePerUser) revert StakeTooHigh();

                user.stakedAmount = newStake;
                user.rewardDebt = Math.mulDiv(newStake, accumulatedRewardsPerStake, PRECISION_FACTOR) - pendingReward;
                user.lastUpdateTime = block.timestamp;
            }

            totalStaked = newTotal;

            stakingToken.safeTransferFrom(msg.sender, address(this), amount);

            emit Staked(msg.sender, amount, block.timestamp);
        }

        function unstake() external nonReentrant {
            UserInfo storage user = stakes[msg.sender];
            if (user.stakedAmount == 0) revert NoStakeFound();

            if (user.lockEndTime > 0 && block.timestamp < user.lockEndTime) revert StillLocked();

            updatePoolRewards();

            uint256 pendingReward = calculatePendingRewards(msg.sender);
            uint256 fee = calculateUnstakeFee(user.stakedAmount, block.timestamp);

            collectedFees += fee;
            totalStaked -= user.stakedAmount;

            uint256 withdrawAmount = user.stakedAmount + pendingReward - fee;

            delete stakes[msg.sender];

            stakingToken.safeTransfer(msg.sender, withdrawAmount);

            emit Unstaked(msg.sender, withdrawAmount, fee, pendingReward, block.timestamp);
        }

        function claimRewards() external nonReentrant {
            UserInfo storage user = stakes[msg.sender];
            if(user.stakedAmount == 0) revert NoStakeFound();

            updatePoolRewards();

            uint256 pendingReward = calculatePendingRewards(msg.sender);
            if(pendingReward == 0) revert NoRewardsToClaim();

            user.rewardDebt = Math.mulDiv(user.stakedAmount, accumulatedRewardsPerStake, PRECISION_FACTOR);
            user.lastUpdateTime = block.timestamp;

            stakingToken.safeTransfer(msg.sender, pendingReward);

            emit RewardClaimed(msg.sender, pendingReward, block.timestamp);
        }

        function updatePoolConfig(
            uint256 newStartTime, uint256 newDuration, uint256 newRewardsPerSecond, uint256 newMaxTotalStake
        ) external onlyRole(POOL_ADMIN_ROLE) {

            if(block.timestamp >= poolConfig.startTime) revert PoolAlreadyStarted();

            uint256 newEndTime = newStartTime + newDuration;

            uint256 requiredRewards = newRewardsPerSecond * newDuration;
            if (lockedRewards < requiredRewards) revert NotEnoughRewardsLocked();

            poolConfig.startTime = newStartTime;
            poolConfig.endTime = newEndTime;
            poolConfig.rewardsPerSecond = newRewardsPerSecond;
            poolConfig.maxTotalStake = newMaxTotalStake;
            lastUpdateTime = newStartTime;
            
            emit PoolUpdated(
                newStartTime,
                newEndTime,
                newRewardsPerSecond,
                newMaxTotalStake,
                block.timestamp
            );
        }

        function updateFeeConfig    (
            uint256 newFeePercentage,
            uint256 newMinimumFee,
            uint256 newMaximumFee
        ) external onlyRole(FEE_MANAGER_ROLE) {
            
            if (newFeePercentage > BASIS_POINTS) revert InvalidFeePercentage();
            if (newMinimumFee > newMaximumFee) revert InvalidFeeLimit();
            
            poolConfig.feeConfig.earlyUnstakeFeePercentage = newFeePercentage;
            poolConfig.feeConfig.minimumFee = newMinimumFee;
            poolConfig.feeConfig.maximumFee = newMaximumFee;
            
            emit FeeConfigUpdate(
                getFeeCollector(),
                newFeePercentage,
                newMinimumFee,
                newMaximumFee,
                block.timestamp
            );
        }

        function collectFees() external onlyRole(FEE_COLLECTOR_ROLE) {
            
            uint256 feeAmount = collectedFees;
            if (feeAmount == 0) revert NoFeeToCollect();
            
            collectedFees = 0;
            
            stakingToken.safeTransfer(msg.sender, feeAmount);
            
            emit FeeCollected(msg.sender, feeAmount, block.timestamp);
        }

        function lockRewards(uint256 amount) external onlyRole(REWARD_MANAGER_ROLE) {
            if(isPoolActive()) revert PoolAlreadyStarted();
            
            lockedRewards += amount;
            stakingToken.safeTransferFrom(msg.sender, address(this), amount);
            
            emit RewardsLocked(msg.sender, amount, block.timestamp);
        }

        function unlockRewards(uint256 amount) external onlyRole(REWARD_MANAGER_ROLE) {
            if(isPoolActive()) revert PoolAlreadyStarted();
            if (amount > lockedRewards) revert NotEnoughRewardsLocked();
            
            lockedRewards -= amount;
            stakingToken.safeTransfer(msg.sender, amount);

            emit RewardsUnlocked(msg.sender, amount, block.timestamp);
        }

        function getEffectiveTime() private view returns (uint256 effectiveLastUpdate, uint256 effectiveCurrentTime) {
            uint256 poolStart = poolConfig.startTime;
            uint256 poolEnd = poolConfig.endTime;

            effectiveLastUpdate = lastUpdateTime < poolStart ? poolStart : lastUpdateTime;
            effectiveCurrentTime = block.timestamp > poolEnd ? poolEnd : block.timestamp;

            return (effectiveLastUpdate, effectiveCurrentTime);
        }

        function calculateAdditionalRewards(uint256 effectiveLastUpdate, uint256 effectiveCurrentTime) 
        private view returns (uint256 additionalRewardsPerStake) {
            
            if(effectiveCurrentTime <= effectiveLastUpdate || totalStaked ==0) {
                return 0;
            }

            uint256 timeElapsed = effectiveCurrentTime - effectiveLastUpdate;
            uint256 additionalRewards = poolConfig.rewardsPerSecond * timeElapsed;

            return Math.mulDiv(additionalRewards, PRECISION_FACTOR, totalStaked);
        }

        function calculatePendingRewards(address user) public view returns (uint256) {
            UserInfo storage userInfo = stakes[user];
            if (userInfo.stakedAmount == 0) {
                return 0;
            }
            
            uint256 currentAccumulated = accumulatedRewardsPerStake;
            
            // If the pool is active, calculate additional pending rewards
            if (block.timestamp > lastUpdateTime && totalStaked > 0) {
               (uint256 effectiveLastUpdate, uint256 effectiveCurrentTime) = getEffectiveTime();

               if(effectiveCurrentTime > effectiveLastUpdate) {
                uint256 additionalRewardsPerStake = calculateAdditionalRewards(
                    effectiveLastUpdate, effectiveCurrentTime
                );
                currentAccumulated += additionalRewardsPerStake;
               }
            }
            
            uint256 reward = Math.mulDiv(userInfo.stakedAmount, currentAccumulated, PRECISION_FACTOR);
            return reward > userInfo.rewardDebt ? reward - userInfo.rewardDebt : 0;
        }

        function updatePoolRewards() internal {
            if (totalStaked == 0) {
                lastUpdateTime = block.timestamp;
                return;
            }

            (uint256 effectiveLastUpdate, uint256 effectiveCurrentTime) = getEffectiveTime();
            
            if (effectiveCurrentTime > effectiveLastUpdate) {
                uint256 additionalRewardsPerStake = calculateAdditionalRewards(
                    effectiveLastUpdate, effectiveCurrentTime
                );
                accumulatedRewardsPerStake += additionalRewardsPerStake;
            }
            
            lastUpdateTime = block.timestamp;
        }

        function calculateUnstakeFee(uint256 stakeAmount, uint256 unstakeTime) internal view returns (uint256) {
            if (unstakeTime >= poolConfig.endTime) {
                return 0;
            }
            
            uint256 baseFee = Math.mulDiv(stakeAmount, poolConfig.feeConfig.earlyUnstakeFeePercentage, BASIS_POINTS);
            
            if (baseFee < poolConfig.feeConfig.minimumFee) {
                return poolConfig.feeConfig.minimumFee;
            } else if (baseFee > poolConfig.feeConfig.maximumFee) {
                return poolConfig.feeConfig.maximumFee;
            } else {
                return baseFee;
            }
        }

        // View functions
        
        function getUserInfo(address user) external view returns (
            uint256 stakedAmount,
            uint256 pendingRewards,
            uint256 lastUpdateTime,
            uint256 lockEndTime
        ) {
            UserInfo storage userInfo = stakes[user];
            return (
                userInfo.stakedAmount,
                calculatePendingRewards(user),
                userInfo.lastUpdateTime,
                userInfo.lockEndTime
            );
        }
        
        function getPoolConfig() external view returns (
            uint256 startTime,
            uint256 endTime,
            uint256 rewardsPerSecond,
            uint256 maxTotalStake,
            uint256 minStakeAmount,
            uint256 maxStakePerUser
        ) {
            return (
                poolConfig.startTime,
                poolConfig.endTime,
                poolConfig.rewardsPerSecond,
                poolConfig.maxTotalStake,
                poolConfig.minStakeAmount,
                poolConfig.maxStakePerUser
            );
        }
        
        function getFeeConfig() external view returns (
            uint256 earlyUnstakeFeePercentage,
            uint256 minimumFee,
            uint256 maximumFee
        ) {
            return (
                poolConfig.feeConfig.earlyUnstakeFeePercentage,
                poolConfig.feeConfig.minimumFee,
                poolConfig.feeConfig.maximumFee
            );
        }
        
        function getPoolStats() external view returns (
            uint256 _totalStaked,
            uint256 _lockedRewards,
            uint256 _accumulatedRewardsPerStake,
            uint256 _lastUpdateTime
        ) {
            return (
                totalStaked,
                lockedRewards,
                accumulatedRewardsPerStake,
                lastUpdateTime
            );
        }
        
        function getCollectedFees() external view returns (uint256) {
            return collectedFees;
        }
        
        function isPoolActive() public view returns (bool) {
            return block.timestamp >= poolConfig.startTime && block.timestamp < poolConfig.endTime;
        }

        function setLockPeriod(address user, uint256 lockEndTime) external onlyRole(POOL_ADMIN_ROLE) {
            UserInfo storage userInfo = stakes[user];
            if (userInfo.stakedAmount == 0) revert NoStakeFound();
            
            userInfo.lockEndTime = lockEndTime;
        }

        function isPoolAdmin(address account) public view returns (bool) {
            return hasRole(POOL_ADMIN_ROLE, account);
        }

        function isFeeManager(address account) public view returns (bool) {
            return hasRole(FEE_MANAGER_ROLE, account);
        }

        function isFeeCollector(address account) public view returns (bool) {
            return hasRole(FEE_COLLECTOR_ROLE, account);
        }

        function isRewardManager(address account) public view returns (bool) {
            return hasRole(REWARD_MANAGER_ROLE, account);
        }

        function getFeeCollector() public  view returns (address) {
            return feeCollector;
        }
    }