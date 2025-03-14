# Staking Contract System  

A comprehensive Solidity based staking contract system with role based access control, flexible fee management, and time bound rewards distribution. This project implements a flexible and secure staking contract system for ERC20 tokens on Ethereum blockchain. Users can stake their tokens to earn rewards over a specified duration. The system has configurable parameters like staking limits, fee structures, and time based mechanics to provide a complete staking solution.  

## Features  

- Time Bound Staking - pools have specific start and end times  
- Flexible Fee Structure - Configurable early unstake fees with minimum and maximum thresholds  
- Role Based Access Control - Separate roles for admin, fee manageer, and reward distribution  
- Reward Calculation - Time- weighted reward distribution based on tokens staked  
- Lock Periods - Optional time lock for stakes, preventing early withdrawals  
- Comprehensive Testing - Extensive unit, integration and stress tests  

## Architecture  

The staking systems consists of three main smart contracts :  

### MyCoin.sol  

A simple ERC20 token implementation used for staking and rewards.  

- Minting capability for contract owner  

### Roles.sol  

Role based access control system to manage permissions.  

- Pool Admin : Can update pool configurations and set lock periods  
- Fee Manager : Can update fee confuigurations  
- Fee Collector : Can collect accumulated fees  
- Reward Manager : Can lock and unlock rewards for the pool  

### Staking.sol  

The core staking contract with support for deposits, withdrawals, and reward calculations.  

- Time bound staking windows with start and end times  
- Configurable staking limits (min/max per user and total)  
- Early unstake fee calculation and minimum and maximum thresholds  
- Reward distribution based on proportional stake amount and time  

## Contract Details  

### Functions  

```  
function stake(uint256 amount)  
```  

Allows users to stake tokens, with in build validation for minimum and maximum amounts and pool status  

2. function unstake()  

Withdraws staked tokens along with accumulated rewards and applicable early withdrawal fees  

3. function claimRewards()  

Claims accumulated rewards without unstaking principal tokens  

4. function updatePoolConfig(uint256 newStartTime, uint256 newDuration, uint256 newRewardsPerSecond uint256 newMaxTotalStake)  

Updates pool configuration parameters(only before pool start)  

5. function updateFeeConfig(uint256 newFeePercentage, uint256 newMinimumFee, uint256 newMaximumFee)  

Updates the fee structure for  early withdrawals  

6. function setLockPeriod(address user, uint256 lockEndTime)  

Sets a lock period for specific user's stake  

7. function UpdatePoolAdmin(address newAdmin)  

Updates the pool admin role  

8. function UpdateFeeManager(address newFeeManager)  

Updates the fee manager role  

9. function UpdateFeeCollector(address newFeeCollector)  

Updates the fee collector role  

10. function UpdateRewardManager(address newRewardManager)  

Updates the reward manager role  

### Security  

- ReentrancyGuard : Protection against reentrancy attacks  
- SafeERC20 : Safe token transfer handling  
- Custom Error Codes : Detailed error reporting for better debugging  
- Role Separation : Separation of concerns through distinct roles  
- Input Validation : Comprehensive validation of all inputs  

### Testing  

This includes an extensive test suite covering:  

- Unit Tests: Individual contract functions and error conditions  
- Integration Tests: Interaction between contracts and multi-step operations  
- Stress Tests: System behavior under high load and edge cases  
- Staging Tests: Simulated production deployment scenarios  

## Installation  

### Prerequesites  

- Node.js  
- npm  
- Hardhat  

### Setup  

1. Clone the repository  

```  
git clone https://github.com/ajaythampispericorn/Staking-Contract_Ethereum  
cd Staking-Contract_Ethereum
```  

2. Install dependencies  

```  
npm install  
```  

3. Compile the contracts  

```  
npx hardhat compile  
```  

4. Test the contract and find test coverage  

```  
npx hardhat test  
npx hardhat coverage  
```  

## License  

This project is licensed under the MIT license - see the [LICENSE](LICENSE.md) file for details.