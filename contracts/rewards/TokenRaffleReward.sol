// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../BaseReward.sol";

/**
 * @title TokenRaffleReward
 * @notice Reward implementation for raffled token distributions
 * @dev Records winners and supports both manual claims and automatic distribution
 */
contract TokenRaffleReward is BaseReward {
    using SafeERC20 for IERC20;
    
    // Config structure for token raffle
    struct Config {
        string raffleName;           // Name of the raffle
        address tokenAddress;        // Address of the ERC20 token
        uint256 tokenAmount;         // Amount of tokens per winner
        uint256 winnersCount;        // Expected number of winners
        bool automaticDistribution;  // Whether to distribute automatically
        uint256 distributionDate;    // Date for automatic distribution (if enabled)
    }
    
    // Config instance
    Config public config;
    
    // Broker wallet that holds the tokens
    address public brokerWallet;
    
    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;
    
    // Winner management
    mapping(address => bool) public isWinner;
    address[] private _winners;
    
    // Events
    event WinnerAdded(address indexed winner, uint256 timestamp);
    event WinnerRemoved(address indexed winner, uint256 timestamp);
    event TokensClaimed(address indexed winner, uint256 amount, uint256 timestamp);
    event AutomaticDistributionEnabled(uint256 distributionDate);
    event AutomaticDistributionDisabled();
    event BrokerWalletUpdated(address indexed oldBroker, address indexed newBroker);
    
    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        _initialize(configData);
    }

    /**
     * @dev Internal initialization function for TokenRaffleReward
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        // Decode config data
        (
            string memory _raffleName,
            address _tokenAddress,
            uint256 _tokenAmount,
            uint256 _winnersCount,
            address _brokerWallet,
            bool _automaticDistribution,
            uint256 _distributionDate
        ) = abi.decode(
            configData,
            (string, address, uint256, uint256, address, bool, uint256)
        );
        
        require(bytes(_raffleName).length > 0, "Invalid raffle name");
        require(_tokenAddress != address(0), "Invalid token address");
        require(_tokenAmount > 0, "Invalid token amount");
        require(_brokerWallet != address(0), "Invalid broker wallet");
        
        // If automatic distribution is enabled, require a valid distribution date
        if (_automaticDistribution) {
            require(_distributionDate > block.timestamp, "Distribution date must be in the future");
        }
        
        // Store config values
        config = Config({
            raffleName: _raffleName,
            tokenAddress: _tokenAddress,
            tokenAmount: _tokenAmount,
            winnersCount: _winnersCount,
            automaticDistribution: _automaticDistribution,
            distributionDate: _distributionDate
        });
        
        // Set broker wallet
        brokerWallet = _brokerWallet;
        
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
     * @return Type identifier "TOKEN_RAFFLE"
     */
    function getRewardType() public pure override returns (string memory) {
        return "TOKEN_RAFFLE";
    }
    
    /**
     * @notice Validate configuration data
     * @param configData Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(bytes memory configData) public pure override returns (bool) {
        if (configData.length < 7 * 32) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @notice External claim function for a winner
     */
    function claimTokens() external nonReentrant whenActive {
        claim(msg.sender);
    }
    
    /**
     * @notice Claim function called by Tim3cap contract
     * @param user Address to claim tokens
     */
    function claim(address user) public override nonReentrant whenActive {
        if (msg.sender != user) {
            // Allow either the owner or the controller (Tim3cap core) to call this function
            require(msg.sender == owner() || msg.sender == controller, "Not authorized");
        }
        
        require(canClaim(user), "Cannot claim tokens");
        require(isWinner[user], "Not a winner");
        require(!hasClaimed[user], "Already claimed");
        
        // Mark as claimed - use inherited hasClaimed mapping and totalClaims counter
        hasClaimed[user] = true;
        totalClaims++;
        
        // Transfer tokens from broker wallet to winner
        _transferTokensToWinner(user);
        
        // Record claim for analytics
        _trackClaim(user);
    }
    
    /**
     * @notice Trigger automatic distribution to all winners
     * @dev Can only be called after distribution date and only if automatic distribution is enabled
     */
    function triggerAutomaticDistribution() external nonReentrant {
        require(msg.sender == owner() || msg.sender == controller, "Not authorized");
        require(config.automaticDistribution, "Automatic distribution not enabled");
        require(block.timestamp >= config.distributionDate, "Distribution date not reached");
        
        for (uint256 i = 0; i < _winners.length; i++) {
            address winner = _winners[i];
            
            // Skip winners who already claimed
            if (hasClaimed[winner]) continue;
            
            // Mark as claimed
            hasClaimed[winner] = true;
            totalClaims++;
            
            // Transfer tokens from broker wallet to winner
            _transferTokensToWinner(winner);
            
            // Record claim for analytics
            _trackClaim(winner);
        }
    }
    
    /**
     * @dev Internal function to transfer tokens from broker wallet to winner
     * @param winner Address of the winner to receive tokens
     */
    function _transferTokensToWinner(address winner) internal {
        IERC20 token = IERC20(config.tokenAddress);
        
        // Check if broker has enough tokens
        uint256 brokerBalance = token.balanceOf(brokerWallet);
        require(brokerBalance >= config.tokenAmount, "Insufficient tokens in broker wallet");
        
        // Check if broker has approved this contract to spend tokens
        uint256 allowance = token.allowance(brokerWallet, address(this));
        require(allowance >= config.tokenAmount, "Insufficient allowance from broker wallet");
        
        // Transfer tokens from broker wallet to winner
        token.safeTransferFrom(brokerWallet, winner, config.tokenAmount);
        
        emit TokensClaimed(winner, config.tokenAmount, block.timestamp);
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
        return true; // No fees for token raffle
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
        return true; // No fees for token raffle
    }
    
    /**
     * @notice Set raffle winners (only owner)
     * @param winners Array of winning addresses
     */
    function setWinners(address[] calldata winners) external onlyOwner {
        require(winners.length > 0, "No winners provided");
        
        // Reset previous winners if any
        for (uint256 i = 0; i < _winners.length; i++) {
            isWinner[_winners[i]] = false;
        }
        delete _winners;
        
        // Set new winners
        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            require(winner != address(0), "Invalid winner address");
            
            isWinner[winner] = true;
            _winners.push(winner);
            
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
        
        isWinner[winner] = true;
        _winners.push(winner);
        
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
        
        // Remove from winners array
        for (uint256 i = 0; i < _winners.length; i++) {
            if (_winners[i] == winner) {
                _winners[i] = _winners[_winners.length - 1];
                _winners.pop();
                break;
            }
        }
        
        emit WinnerRemoved(winner, block.timestamp);
    }
    
    /**
     * @notice Update broker wallet
     * @param newBrokerWallet Address of the new broker wallet
     */
    function updateBrokerWallet(address newBrokerWallet) external onlyOwner {
        require(newBrokerWallet != address(0), "Invalid broker wallet");
        
        address oldBrokerWallet = brokerWallet;
        brokerWallet = newBrokerWallet;
        
        emit BrokerWalletUpdated(oldBrokerWallet, newBrokerWallet);
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
     * @notice Get all winners
     * @return Array of all winner addresses
     */
    function getAllWinners() external view returns (address[] memory) {
        return _winners;
    }
    
    /**
     * @notice Check if an address is a winner and if they've claimed
     * @param user Address to check
     * @return isAWinner Whether the address is a winner
     * @return hasClaimed Whether the address has claimed their tokens
     */
    function checkWinnerStatus(address user) external view returns (bool, bool) {
        return (isWinner[user], hasClaimed[user]);
    }
    
    /**
     * @notice Get raffle stats
     * @return raffleName Name of the raffle
     * @return tokenAddress Address of the ERC20 token
     * @return tokenAmount Amount of tokens per winner
     * @return winnersCount Total number of winners
     * @return totalWinnersClaimed Number of winners who have claimed
     * @return isAutomatic Whether automatic distribution is enabled
     * @return distributionDate Date for automatic distribution (if enabled)
     */
    function getRaffleStats() external view returns (
        string memory raffleName,
        address tokenAddress,
        uint256 tokenAmount,
        uint256 winnersCount,
        uint256 totalWinnersClaimed,
        bool isAutomatic,
        uint256 distributionDate
    ) {
        return (
            config.raffleName,
            config.tokenAddress,
            config.tokenAmount,
            _winners.length,
            totalClaims,
            config.automaticDistribution,
            config.distributionDate
        );
    }
}