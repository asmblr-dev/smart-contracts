// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../BaseReward.sol";

/**
 * @title WhitelistRaffleReward
 * @notice Reward implementation for raffled whitelist spot distributions
 * @dev Records winners and supports both manual assignments and automatic distribution
 */
contract WhitelistRaffleReward is BaseReward {
    
    // Config structure for whitelist raffle
    struct Config {
        string raffleName;           // Name of the raffle
        uint256 spotsCount;          // Total number of whitelist spots
        uint256 winnersCount;        // Expected number of winners
        bool automaticDistribution;  // Whether to distribute automatically
        uint256 distributionDate;    // Date for automatic distribution (if enabled)
    }
    
    // Config instance
    Config public config;
    
    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;
    
    // Winner management
    mapping(address => bool) public isWinner;
    mapping(address => bool) public isAssigned;
    uint256 public totalWinners;
    uint256 public totalAssigned;
    
    // Events
    event WinnerAdded(address indexed winner, uint256 timestamp);
    event WinnerRemoved(address indexed winner, uint256 timestamp);
    event SpotAssigned(address indexed winner, uint256 timestamp);
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
     * @dev Internal initialization function for WhitelistRaffleReward
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        // Decode config data
        (
            string memory _raffleName,
            uint256 _spotsCount,
            uint256 _winnersCount,
            bool _automaticDistribution,
            uint256 _distributionDate
        ) = abi.decode(
            configData,
            (string, uint256, uint256, bool, uint256)
        );
        
        require(bytes(_raffleName).length > 0, "Invalid raffle name");
        require(_spotsCount > 0, "Invalid spots count");
        
        // If automatic distribution is enabled, require a valid distribution date
        if (_automaticDistribution) {
            require(_distributionDate > block.timestamp, "Distribution date must be in the future");
        }
        
        // Store config values
        config = Config({
            raffleName: _raffleName,
            spotsCount: _spotsCount,
            winnersCount: _winnersCount,
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
     * @return Type identifier "WHITELIST_RAFFLE"
     */
    function getRewardType() public pure override returns (string memory) {
        return "WHITELIST_RAFFLE";
    }
    
    /**
     * @notice Validate configuration data
     * @param configData Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(bytes memory configData) public pure override returns (bool) {
        if (configData.length < 5 * 32) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @notice External assign function for a winner
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
        require(isWinner[user], "Not a winner");
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
     * @notice Trigger automatic distribution for a batch of winners
     * @dev Can only be called after distribution date and only if automatic distribution is enabled
     * @param winners Array of winner addresses to process in this batch
     */
    function triggerAutomaticDistribution(address[] calldata winners) external nonReentrant {
        require(msg.sender == owner() || msg.sender == controller, "Not authorized");
        require(config.automaticDistribution, "Automatic distribution not enabled");
        require(block.timestamp >= config.distributionDate, "Distribution date not reached");
        
        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            
            // Verify this is actually a winner
            if (!isWinner[winner]) continue;
            
            // Skip winners who already claimed
            if (hasClaimed[winner]) continue;
            
            // Mark as claimed
            hasClaimed[winner] = true;
            totalClaims++;
            
            // Mark as assigned
            _assignSpot(winner);
            
            // Record claim for analytics
            _trackClaim(winner);
        }
    }
    
    /**
     * @dev Internal function to assign whitelist spot to a winner
     * @param winner Address of the winner to receive whitelist spot
     */
    function _assignSpot(address winner) internal {
        // Check if not already assigned
        if (!isAssigned[winner]) {
            isAssigned[winner] = true;
            totalAssigned++;
            
            emit SpotAssigned(winner, block.timestamp);
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
        if (!isWinner[user]) return false;
        
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
        return true; // No fees for whitelist raffle
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
        return true; // No fees for whitelist raffle
    }
    
    /**
     * @notice Set raffle winners (only owner)
     * @param winners Array of winning addresses
     */
    function setWinners(address[] calldata winners) external onlyOwner {
        require(winners.length > 0, "No winners provided");
        require(winners.length <= config.spotsCount, "Too many winners");
        
        // Reset all previous winners by resetting totalWinners
        // Note: Individual isWinner mappings for old winners will remain true, but this is 
        // acceptable as they won't be counted in totalWinners and won't affect functionality
        totalWinners = 0;
        
        // Set new winners
        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            require(winner != address(0), "Invalid winner address");
            
            // Only increment totalWinners if this is a new winner
            if (!isWinner[winner]) {
                isWinner[winner] = true;
                totalWinners++;
            }
            
            emit WinnerAdded(winner, block.timestamp);
        }
    }
    
    /**
     * @notice Add a single winner
     * @param winner Address of the winner to add
     */
    function addWinner(address winner) external onlyOwner {
        require(winner != address(0), "Invalid winner address");
        require(!isWinner[winner], "Already a winner");
        require(totalWinners < config.spotsCount, "All spots allocated");
        
        isWinner[winner] = true;
        totalWinners++;
        
        emit WinnerAdded(winner, block.timestamp);
    }
    
    /**
     * @notice Remove a single winner
     * @param winner Address of the winner to remove
     */
    function removeWinner(address winner) external onlyOwner {
        require(isWinner[winner], "Not a winner");
        require(!hasClaimed[winner], "Winner has already claimed");
        
        isWinner[winner] = false;
        totalWinners--;
        
        emit WinnerRemoved(winner, block.timestamp);
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
     * @notice Get winner status
     * @dev Note: Full winner list is available through WinnerAdded events
     * @return Number of winners set for this raffle
     */
    function getWinnerCount() external view returns (uint256) {
        return totalWinners;
    }
    
    /**
     * @notice Get assignment status
     * @dev Note: Full assigned list is available through SpotAssigned events
     * @return Number of spots that have been assigned
     */
    function getAssignedCount() external view returns (uint256) {
        return totalAssigned;
    }
    
    /**
     * @notice Check if an address is a winner and if they've claimed
     * @param user Address to check
     * @return isAWinner Whether the address is a winner
     * @return hasClaimed Whether the address has claimed their spot
     */
    function checkWinnerStatus(address user) external view returns (bool, bool) {
        return (isWinner[user], hasClaimed[user]);
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
     * @notice Get raffle stats
     * @return raffleName Name of the raffle
     * @return spotsCount Total number of whitelist spots
     * @return winnersCount Total number of winners
     * @return assignedCount Number of assigned spots
     * @return totalWinnersClaimed Number of winners who have claimed
     * @return isAutomatic Whether automatic distribution is enabled
     * @return distributionDate Date for automatic distribution (if enabled)
     */
    function getRaffleStats() external view returns (
        string memory raffleName,
        uint256 spotsCount,
        uint256 winnersCount,
        uint256 assignedCount,
        uint256 totalWinnersClaimed,
        bool isAutomatic,
        uint256 distributionDate
    ) {
        return (
            config.raffleName,
            config.spotsCount,
            totalWinners,
            totalAssigned,
            totalClaims,
            config.automaticDistribution,
            config.distributionDate
        );
    }
}