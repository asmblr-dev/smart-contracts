// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../BaseReward.sol";

/**
 * @title MerkleWhitelistReward
 * @notice Reward implementation for guaranteed whitelist spots using Merkle trees
 * @dev Uses Merkle proofs for gas-efficient verification of large whitelists
 */
contract MerkleWhitelistReward is BaseReward {
    // Config structure for whitelist spots
    struct Config {
        string whitelistName;        // Name of the whitelist
        uint256 maxSpots;            // Maximum number of whitelist spots (0 for unlimited)
        bytes32 merkleRoot;          // Merkle root of the whitelist
    }
    
    // Config instance
    Config public config;
    
    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;
    
    // Events
    event WhitelistClaimed(address indexed user, uint256 timestamp);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);

    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        _initialize(configData);
    }

    /**
     * @dev Internal initialization function for MerkleWhitelistReward
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        // Decode config data
        (
            string memory _whitelistName,
            uint256 _maxSpots,
            bytes32 _merkleRoot
        ) = abi.decode(
            configData,
            (string, uint256, bytes32)
        );
        
        require(bytes(_whitelistName).length > 0, "Invalid whitelist name");
        
        // Store config values
        config = Config({
            whitelistName: _whitelistName,
            maxSpots: _maxSpots,
            merkleRoot: _merkleRoot
        });
        
        // Set initial state
        active = true;
        claimStartDate = block.timestamp;
        claimFinishDate = block.timestamp + 30 days; // Default 30 day claim period
        
        // Set the contract that initialized this reward as the controller
        // This will be the Tim3cap core contract during deployment
        controller = msg.sender;
    }
    
    /**
     * @notice Get the reward type identifier
     * @return Type identifier "MERKLE_WL_SPOTS"
     */
    function getRewardType() public pure override returns (string memory) {
        return "MERKLE_WL_SPOTS";
    }
    
    /**
     * @notice Validate configuration data
     * @param configData Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(bytes memory configData) public pure override returns (bool) {
        if (configData.length < 3 * 32) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @notice Claim function with Merkle proof verification
     * @param merkleProof Merkle proof showing the user is whitelisted
     */
    function claimWithProof(bytes32[] calldata merkleProof) external nonReentrant whenActive {
        // Verify the Merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        require(MerkleProof.verify(merkleProof, config.merkleRoot, leaf), "Invalid Merkle proof");
        
        // Process the claim
        _processClaim(msg.sender);
    }
    
    /**
     * @notice External claim function for a single user
     */
    function claimByUser() external nonReentrant whenActive {
        // This should only be used if eligibility is verified elsewhere (e.g., by Tim3cap)
        claim(msg.sender);
    }
    
    /**
     * @notice Claim function called by Tim3cap contract
     * @param user Address to claim whitelist spot
     */
    function claim(address user) public override nonReentrant whenActive {
        if (msg.sender != user) {
            // Allow either the owner or the controller (Tim3cap core) to call this function
            require(msg.sender == owner() || msg.sender == controller, "Not authorized");
        }
        
        // Process the claim
        _processClaim(user);
    }
    
    /**
     * @dev Internal function to process a claim
     * @param user Address claiming the whitelist spot
     */
    function _processClaim(address user) internal {
        require(canClaim(user), "Cannot claim");
        
        // Mark as claimed
        hasClaimed[user] = true;
        totalClaims++;
        
        // No asset transfer needed, just track the claim
        emit WhitelistClaimed(user, block.timestamp);
        _trackClaim(user);
    }
    
    /**
     * @notice Update the Merkle root
     * @param newMerkleRoot New Merkle root
     */
    function updateMerkleRoot(bytes32 newMerkleRoot) external onlyOwner {
        require(newMerkleRoot != bytes32(0), "Invalid Merkle root");
        
        bytes32 oldRoot = config.merkleRoot;
        config.merkleRoot = newMerkleRoot;
        
        emit MerkleRootUpdated(oldRoot, newMerkleRoot);
    }
    
    /**
     * @notice Set controller address
     * @param _controller New controller address
     */
    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "Invalid controller address");
        controller = _controller;
    }
    
    /**
     * @dev Internal function to set controller address
     * @param _controller New controller address
     */
    function _setController(address _controller) internal override {
        controller = _controller;
    }
    
    /**
     * @notice Check if a user can claim the reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(address user) public view override returns (bool) {
        if (!active) return false;
        if (hasClaimed[user]) return false;
        if (block.timestamp < claimStartDate || (claimFinishDate > 0 && block.timestamp > claimFinishDate)) return false;
        
        // Check if max spots reached (if set)
        if (config.maxSpots > 0 && totalClaims >= config.maxSpots) return false;
        
        return true;
    }
    
    /**
     * @notice Process fee on claim - implementation for IReward
     * @param user Address that is claiming
     * @return Always true as no fees are charged
     */
    function processFeeOnClaim(address user) external override returns (bool) {
        return true; // No fees for whitelist spots
    }
    
    /**
     * @notice Process fee with discount - implementation for IReward
     * @param user Address that is claiming
     * @param discountRate Discount rate in basis points
     * @param merkleProof Merkle proof for the discount
     * @return Always true as no fees are charged
     */
    function processFeeWithDiscount(
        address user,
        uint256 discountRate,
        bytes32[] calldata merkleProof
    ) external override returns (bool) {
        return true; // No fees for whitelist spots
    }
    
    /**
     * @notice Verify if an address is in the whitelist using Merkle proof
     * @param user Address to check
     * @param merkleProof Merkle proof for the user
     * @return Whether the address is in the whitelist
     */
    function verifyWhitelist(address user, bytes32[] calldata merkleProof) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(user));
        return MerkleProof.verify(merkleProof, config.merkleRoot, leaf);
    }
    
    /**
     * @notice Check if an address has claimed
     * @param user Address to check
     * @return Whether the address has claimed
     */
    function checkWhitelistStatus(address user) external view returns (bool) {
        return hasClaimed[user];
    }
    
    /**
     * @notice Get whitelist stats
     * @return whitelistName Name of the whitelist
     * @return claimedCount Number of claimed spots
     * @return maxSpots Maximum allowed spots (0 if unlimited)
     * @return spotsRemaining Number of spots remaining (type(uint256).max if unlimited)
     * @return merkleRoot Current Merkle root
     */
    function getWhitelistStats() external view returns (
        string memory whitelistName,
        uint256 claimedCount,
        uint256 maxSpots,
        uint256 spotsRemaining,
        bytes32 merkleRoot
    ) {
        uint256 remaining;
        if (config.maxSpots == 0) {
            remaining = type(uint256).max; // Unlimited
        } else {
            remaining = config.maxSpots > totalClaims ? config.maxSpots - totalClaims : 0;
        }
        
        return (
            config.whitelistName,
            totalClaims,
            config.maxSpots,
            remaining,
            config.merkleRoot
        );
    }
}