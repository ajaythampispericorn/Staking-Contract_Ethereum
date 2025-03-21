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

The staking systems consists of two main smart contracts :  

### MyCoin.sol  

A simple ERC20 token implementation used for staking and rewards.  

- Minting capability for contract owner  
- Role based access control using Openzeppelin built in features 

### Staking.sol  

The core staking contract with support for deposits, withdrawals, and reward calculations.  

- Time bound staking windows with start and end times  
- Configurable staking limits (min/max per user and total)  
- Early unstake fee calculation and minimum and maximum thresholds  
- Reward distribution based on proportional stake amount and time  
- Role based access control using Openzeppelin built in features  

## Contract Details  

### Functions  

```  
function stake(uint256 amount)  
```  

Allows users to stake tokens, with in build validation for minimum and maximum amounts and pool status  

```  
function unstake()  
```  

Withdraws staked tokens along with accumulated rewards and applicable early withdrawal fees  

```  
function claimRewards()  
```

Claims accumulated rewards without unstaking principal tokens  

```  
function updatePoolConfig(uint256 newStartTime, uint256 newDuration, uint256 newRewardsPerSecond uint256 newMaxTotalStake)  
```  

Updates pool configuration parameters(only before pool start)  

```  
function updateFeeConfig(uint256 newFeePercentage, uint256 newMinimumFee, uint256 newMaximumFee)  
```  

Updates the fee structure for  early withdrawals  

```  
function setLockPeriod(address user, uint256 lockEndTime)  
```  

Sets a lock period for specific user's stake  

```  
function updatePoolAdmin(address newAdmin)  
```  

Updates the pool admin role  

```  
function updateFeeManager(address newFeeManager)  
```  

Updates the fee manager role  

```  
function updateFeeCollector(address newFeeCollector)  
```  

Updates the fee collector role  

```  
function updateRewardManager(address newRewardManager)  
```  

Updates the reward manager role  

### Security  

- ReentrancyGuard : Protection against reentrancy attacks  
- SafeERC20 : Safe token transfer handling  
- Custom Error Codes : Detailed error reporting for better debugging  
- Role Separation : Separation of concerns through distinct roles  
- Input Validation : Comprehensive validation of all inputs  
- Address Conflict Check : Prevention of role conflicts  
- Precision Factor : High precision calculations to avoid rounding errors  

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