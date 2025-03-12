// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Roles is Ownable {

    address public poolAdmin;
    address public feeManager;
    address public rewardManager;
    address public feeCollector;

    event RoleUpdated(string indexed role, address indexed oldAccount, address indexed newAccount);

    error InvalidAddress();
    error NotAuthorized();
    error AddressConflict();

    constructor(address _feeManager, address _rewardManager, address _feeCollector) Ownable(msg.sender) {

        poolAdmin = msg.sender;

        if(_feeManager == address(0) || _rewardManager == address(0) || _feeCollector == address(0)) {
            revert InvalidAddress();
        }
        
        if (
            poolAdmin == _feeManager ||
            poolAdmin == _feeCollector ||
            poolAdmin == _rewardManager ||
            _feeManager == _feeCollector ||
            _feeManager == _rewardManager ||
            _rewardManager == _feeCollector
        ) {
            revert AddressConflict();
        }

        feeManager = _feeManager;
        feeCollector = _feeCollector;
        rewardManager = _rewardManager;
    }

    modifier OnlyPoolAdmin() {

        if(msg.sender != poolAdmin) revert NotAuthorized();
        _;
    }

    modifier OnlyFeeCollector() {

        if(msg.sender != feeCollector) revert NotAuthorized();
        _;
    }

    modifier OnlyRewardManager() {

        if(msg.sender != rewardManager) revert NotAuthorized();
        _;
    }

    modifier OnlyFeeManager() {

        if(msg.sender != feeManager) revert NotAuthorized();
        _;
    }

    function UpdatePoolAdmin(address newAdmin) external OnlyPoolAdmin {
        if(newAdmin == address(0)) revert InvalidAddress(); 
        if(newAdmin == feeManager || newAdmin == feeCollector || newAdmin == rewardManager) 
            revert AddressConflict();
        
        address oldAdmin = poolAdmin;
        poolAdmin = newAdmin;

        emit RoleUpdated("Pool Admin", oldAdmin, newAdmin);
    }

    function UpdateFeeManager(address newFeeManager) external OnlyFeeManager {
        if(newFeeManager == address(0)) revert InvalidAddress();
        if(newFeeManager == feeManager || newFeeManager == feeCollector || newFeeManager == rewardManager)
            revert AddressConflict();
        
        address oldFeeManager = feeManager;
        feeManager = newFeeManager;

        emit RoleUpdated("Fee Manager", oldFeeManager, newFeeManager);
    }

    function UpdateFeeCollector(address newFeeCollector) external OnlyFeeCollector {
        if(newFeeCollector == address(0)) revert InvalidAddress();
        if(newFeeCollector == feeCollector || newFeeCollector == feeManager || newFeeCollector == rewardManager)
            revert AddressConflict();
        
        address oldFeeCollector = feeCollector;
        feeCollector = newFeeCollector;

        emit RoleUpdated("Fee Collector", oldFeeCollector, newFeeCollector);
    }

    function UpdateRewardManager(address newRewardManager) external OnlyRewardManager {
        if(newRewardManager == address(0)) revert InvalidAddress();
        if(newRewardManager == rewardManager || newRewardManager == feeCollector || newRewardManager ==
            feeManager) 
            revert AddressConflict();

        address oldRewardmanager = rewardManager;
        rewardManager = newRewardManager;

        emit RoleUpdated("Reward Manager", oldRewardmanager, newRewardManager);
    }

    function isPoolAdmin(address account) public view returns (bool) {
        return account == poolAdmin;
    }

    function isFeeManager(address account) public view returns (bool) {
        return account == feeManager;
    }

    function isFeeCollector(address account) public view returns (bool) {
        return account == feeCollector;
    }

    function isRewardManager(address account) public view returns (bool) {
        return account == rewardManager;
    }
    
}