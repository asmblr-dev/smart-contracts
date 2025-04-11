// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../BaseReward.sol";

/**
 * @title WhitelistSpots
 * @notice Reward implementation for whitelist spot assignments to eligible users
 * @dev Records eligibility and supports both manual claims and automatic distribution
 */
contract WhitelistSpots is BaseReward {
    
    // Config structure for whitelist
    struct Config {
        string whitelistName;        // Name of the whitelist
        bool automaticDistribution;  // Whether to distribute automatically
        uint256 distributionDate;    // Date for automatic distribution (if enabled)
    }
    
    // Config instance
    Config public config;
    
    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;
    
    // Eligibility management
    mapping(address => bool) public isEligible;
    mapping(address => bool) public isAssigned;
    uint256 public totalEligible;
    uint256 public totalAssigned;
    
    // Events
    event EligibleBatch(address[] users, uint256 timestamp);
    event EligibleSingle(address indexed user, uint256 timestamp);
    event EligibleRemoved(address indexed user, uint256 timestamp);
    event SpotAssigned(address indexed user, uint256 timestamp);
    event AutomaticDistributionEnabled(uint256 distributionDate);
    event AutomaticDistributionDisabled();
    
    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        _initialize(configData);
    }

    /**
     * @dev Internal initialization function for WhitelistSpots
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        // Decode config data
        (
            string memory _whitelistName,
            bool _automaticDistribution,
            uint256 _distributionDate
        ) = abi.decode(
            configData,
            (string, bool, uint256)
        );
        
        require(bytes(_whitelistName).length > 0, "Invalid whitelist name");
        
        // If automatic distribution is enabled, require a valid distribution date
        if (_automaticDistribution) {
            require(_distributionDate > block.timestamp, "Distribution date must be in the future");
        }
        
        // Store config values
        config = Config({
            whitelistName: _whitelistName,
            automaticDistribution: _automaticDistribution,
            distributionDate: _distributionDate
        });
        
        // Set initial state
        active = true;
        claimStartDate = block.timestamp;
        
        // Set claim finish date based on distribution mode
        if (_automaticDistribution) {
            claimFinishDate = _distributionDate;
        } else {
            claimFinishDate = block.timestamp + 30 days; // Default 30 day claim period
        }
        
        // Set the contract that initialized this reward as the controller
        // This will be the Tim3cap core contract during deployment
        controller = msg.sender;
    }
    
    /**
     * @notice Get the reward type identifier
     * @return Type identifier "WHITELIST_SPOTS"
     */
    function getRewardType() public pure override returns (string memory) {
        return "WHITELIST_SPOTS";
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
     * @notice External assign function for an eligible user
     */
    function assignSpot() external nonReentrant whenActive {
        claim(msg.sender);
    }
    
    /**
     * @notice Claim function called by Tim3cap contract
     * @param user Address to assign whitelist spot
     */
    function claim(address user) public override nonReentrant whenActive {
        if (msg.sender != user) {
            // Allow either the owner or the controller (Tim3cap core) to call this function
            require(msg.sender == owner() || msg.sender == controller, "Not authorized");
        }
        
        require(canClaim(user), "Cannot claim spot");
        require(isEligible[user], "Not eligible");
        require(!hasClaimed[user], "Already claimed");
        
        // Mark as claimed - use inherited hasClaimed mapping and totalClaims counter
        hasClaimed[user] = true;
        totalClaims++;
        
        // Mark as assigned
        _assignSpot(user);
        
        // Record claim for analytics
        _trackClaim(user);
    }
    
    /**
     * @notice Trigger automatic distribution for a batch of eligible users
     * @dev Can only be called after distribution date and only if automatic distribution is enabled
     * @param users Array of eligible user addresses to process in this batch
     */
    function triggerAutomaticDistribution(address[] calldata users) external nonReentrant {
        require(msg.sender == owner() || msg.sender == controller, "Not authorized");
        require(config.automaticDistribution, "Automatic distribution not enabled");
        require(block.timestamp >= config.distributionDate, "Distribution date not reached");
        
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            
            // Verify this is actually eligible
            if (!isEligible[user]) continue;
            
            // Skip users who already claimed
            if (hasClaimed[user]) continue;
            
            // Mark as claimed
            hasClaimed[user] = true;
            totalClaims++;
            
            // Mark as assigned
            _assignSpot(user);
            
            // Record claim for analytics
            _trackClaim(user);
        }
    }
    
    /**
     * @dev Internal function to assign whitelist spot to an eligible user
     * @param user Address of the user to receive whitelist spot
     */
    function _assignSpot(address user) internal {
        // Check if not already assigned
        if (!isAssigned[user]) {
            isAssigned[user] = true;
            totalAssigned++;
            
            emit SpotAssigned(user, block.timestamp);
        }
    }
    
    /**
     * @notice Check if a user can claim the reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(address user) public view override returns (bool) {
        if (!active) return false;
        if (hasClaimed[user]) return false;
        if (!isEligible[user]) return false;
        
        // In automatic distribution mode, users can only claim before distribution date
        if (config.automaticDistribution && block.timestamp >= config.distributionDate) {
            return false;
        }
        
        // Check time window
        if (block.timestamp < claimStartDate || (claimFinishDate > 0 && block.timestamp > claimFinishDate)) {
            return false;
        }
        
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
     * @notice Set eligible users in batch (only owner)
     * @param users Array of eligible user addresses
     */
    function addEligibleBatch(address[] calldata users) external onlyOwner {
        require(users.length > 0, "No users provided");
        
        // Set new eligibility
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            require(user != address(0), "Invalid user address");
            
            // Only increment counter if this is newly eligible
            if (!isEligible[user]) {
                isEligible[user] = true;
                totalEligible++;
            }
        }
        
        // Emit a single batch event instead of individual events
        emit EligibleBatch(users, block.timestamp);
    }
    
    /**
     * @notice Add a single eligible user
     * @param user Address of the user to add
     */
    function addEligible(address user) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(!isEligible[user], "Already eligible");
        
        isEligible[user] = true;
        totalEligible++;
        
        emit EligibleSingle(user, block.timestamp);
    }
    
    /**
     * @notice Remove eligibility for a user
     * @param user Address of the user to remove
     */
    function removeEligible(address user) external onlyOwner {
        require(isEligible[user], "Not eligible");
        require(!hasClaimed[user], "User has already claimed");
        
        isEligible[user] = false;
        totalEligible--;
        
        emit EligibleRemoved(user, block.timestamp);
    }
    
    /**
     * @notice Toggle automatic distribution mode
     * @param enable Whether to enable automatic distribution
     * @param newDistributionDate New distribution date (if enabling)
     */
    function setAutomaticDistribution(bool enable, uint256 newDistributionDate) external onlyOwner {
        if (enable) {
            require(newDistributionDate > block.timestamp, "Distribution date must be in the future");
            config.automaticDistribution = true;
            config.distributionDate = newDistributionDate;
            claimFinishDate = newDistributionDate;
            
            emit AutomaticDistributionEnabled(newDistributionDate);
        } else {
            config.automaticDistribution = false;
            claimFinishDate = block.timestamp + 30 days; // Default 30 day claim period
            
            emit AutomaticDistributionDisabled();
        }
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
     * @notice Get eligibility stats
     * @return Number of users marked as eligible
     */
    function getEligibleCount() external view returns (uint256) {
        return totalEligible;
    }
    
    /**
     * @notice Get assignment stats
     * @return Number of spots that have been assigned
     */
    function getAssignedCount() external view returns (uint256) {
        return totalAssigned;
    }
    
    /**
     * @notice Check if an address is eligible and if they've claimed
     * @param user Address to check
     * @return isUserEligible Whether the address is eligible
     * @return hasUserClaimed Whether the address has claimed their spot
     */
    function checkEligibilityStatus(address user) external view returns (bool, bool) {
        return (isEligible[user], hasClaimed[user]);
    }
    
    /**
     * @notice Check if an address has been assigned a whitelist spot
     * @param user Address to check
     * @return Whether the address has been assigned a spot
     */
    function checkAssignmentStatus(address user) external view returns (bool) {
        return isAssigned[user];
    }
    
    /**
     * @notice Get whitelist stats
     * @return whitelistName Name of the whitelist
     * @return eligibleCount Total number of eligible users
     * @return assignedCount Number of assigned spots
     * @return totalClaimsCount Number of users who have claimed
     * @return isAutomatic Whether automatic distribution is enabled
     * @return distributionDate Date for automatic distribution (if enabled)
     */
    function getWhitelistStats() external view returns (
        string memory whitelistName,
        uint256 eligibleCount,
        uint256 assignedCount,
        uint256 totalClaimsCount,
        bool isAutomatic,
        uint256 distributionDate
    ) {
        return (
            config.whitelistName,
            totalEligible,
            totalAssigned,
            totalClaims,
            config.automaticDistribution,
            config.distributionDate
        );
    }
}