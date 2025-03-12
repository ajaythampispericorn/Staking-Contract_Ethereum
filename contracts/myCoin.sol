// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyCoin is ERC20, Ownable {
    constructor() ERC20("MyCoin", "MCN") Ownable(msg.sender) {
        _mint(msg.sender, 1000000000* 10**decimals());
    }

    function mintCoins(uint256 amount) external onlyOwner {
        _mint(msg.sender, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    } 
}