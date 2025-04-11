// contracts/test/TestToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestToken is ERC20, Ownable {
    uint8 private _decimals;
    
    constructor(string memory name, string memory symbol, uint8 decimalsValue) ERC20(name, symbol) {
        _decimals = decimalsValue;
        _transferOwnership(msg.sender);
    }
    
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
    
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}