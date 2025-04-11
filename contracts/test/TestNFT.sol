// contracts/test/TestNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestNFT is ERC721Enumerable, Ownable {
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        _transferOwnership(msg.sender);
    }
    
    function safeMint(address to) public onlyOwner {
        uint256 tokenId = totalSupply() + 1;
        _safeMint(to, tokenId);
    }
}