// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MyCoin is ERC20, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("MyCoin", "MCN") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);

        _mint(msg.sender, 1000000000* 10**decimals());
    }

    function mintCoins(uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(msg.sender, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    } 
}