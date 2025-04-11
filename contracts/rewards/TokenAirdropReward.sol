// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";
import "../BaseReward.sol";

/**
 * @title TokenAirdropReward
 * @notice Reward implementation for token airdrops to eligible users
 * @dev Supports both manual claiming and automatic distribution options
 */
contract TokenAirdropReward is BaseReward {
    using SafeERC20 for IERC20;

    // Config structure for token airdrop
    struct Config {
        string airdropName; // Name of the airdrop
        address tokenAddress; // Address of the ERC20 token
        uint256 tokenAmount; // Amount of tokens per eligible user
        uint256 totalAirdropAmount; // Total tokens available for airdrop
        bool automaticDistribution; // Whether to distribute automatically
        uint256 distributionDate; // Date for automatic distribution (if enabled)
    }

    // Config instance
    Config public config;

    // Broker wallet that holds the tokens
    address public brokerWallet;

    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;

    // Distribution tracking
    mapping(address => bool) public tokensClaimed; // Tracks if a user has claimed their tokens
    uint256 public totalClaimed; // Total number of users who have claimed
    uint256 public totalTokensClaimed; // Total amount of tokens claimed

    // Events
    event TokensClaimed(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );
    event AutomaticDistributionEnabled(uint256 distributionDate);
    event AutomaticDistributionDisabled();
    event BrokerWalletUpdated(
        address indexed oldBroker,
        address indexed newBroker
    );
    event EligibleUserClaimed(address indexed user, uint256 amount);

    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        console.log("TokenAirdropReward: Initializing");
        _initialize(configData);
    }

    /**
     * @dev Internal initialization function for TokenAirdropReward
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        console.log("TokenAirdropReward: _initialize called");

        // Decode config data
        (
            string memory _airdropName,
            address _tokenAddress,
            uint256 _tokenAmount,
            uint256 _totalAirdropAmount,
            address _brokerWallet,
            bool _automaticDistribution,
            uint256 _distributionDate
        ) = abi.decode(
                configData,
                (string, address, uint256, uint256, address, bool, uint256)
            );

        console.log("TokenAirdropReward: Airdrop name:", _airdropName);
        console.log("TokenAirdropReward: Token address:", _tokenAddress);
        console.log("TokenAirdropReward: Token amount per user:", _tokenAmount);
        console.log(
            "TokenAirdropReward: Total airdrop amount:",
            _totalAirdropAmount
        );
        console.log("TokenAirdropReward: Broker wallet:", _brokerWallet);
        console.log(
            "TokenAirdropReward: Automatic distribution:",
            _automaticDistribution
        );

        require(bytes(_airdropName).length > 0, "Invalid airdrop name");
        require(_tokenAddress != address(0), "Invalid token address");
        require(_tokenAmount > 0, "Invalid token amount");
        require(_totalAirdropAmount > 0, "Invalid total amount");
        require(_brokerWallet != address(0), "Invalid broker wallet");

        // If automatic distribution is enabled, require a valid distribution date
        if (_automaticDistribution) {
            console.log(
                "TokenAirdropReward: Distribution date:",
                _distributionDate
            );
            require(
                _distributionDate > block.timestamp,
                "Distribution date must be in the future"
            );
        }

        // Store config values
        config = Config({
            airdropName: _airdropName,
            tokenAddress: _tokenAddress,
            tokenAmount: _tokenAmount,
            totalAirdropAmount: _totalAirdropAmount,
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

        console.log(
            "TokenAirdropReward: Set claim start date:",
            claimStartDate
        );
        console.log(
            "TokenAirdropReward: Set claim finish date:",
            claimFinishDate
        );
        console.log("TokenAirdropReward: Set active:", active);
        console.log("TokenAirdropReward: Set controller:", controller);
        console.log("TokenAirdropReward: _initialize completed");
    }

    /**
     * @notice Get the reward type identifier
     * @return Type identifier "TOKEN_AIRDROP"
     */
    function getRewardType() public pure override returns (string memory) {
        return "TOKEN_AIRDROP";
    }

    /**
     * @notice Validate configuration data
     * @param configData Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(
        bytes memory configData
    ) public pure override returns (bool) {
        if (configData.length < 7 * 32) {
            return false;
        }

        return true;
    }

    /**
     * @notice External claim function for an eligible user
     */
    function claimTokens() external nonReentrant whenActive {
        console.log("TokenAirdropReward: claimTokens called by", msg.sender);
        claim(msg.sender);
    }

    /**
     * @notice Claim function called by Tim3cap contract
     * @param user Address to claim tokens
     */
    function claim(address user) public override nonReentrant whenActive {
        console.log("TokenAirdropReward: claim called for user", user);
        console.log("TokenAirdropReward: Message sender", msg.sender);
        console.log("TokenAirdropReward: Controller", controller);
        console.log("TokenAirdropReward: Owner", owner());

        if (msg.sender != user) {
            // Allow either the owner or the controller (Tim3cap core) to call this function
            bool isAuthorized = msg.sender == owner() ||
                msg.sender == controller;
            console.log("TokenAirdropReward: Is authorized?", isAuthorized);
            require(isAuthorized, "Not authorized");
        }

        bool userCanClaim = canClaim(user);
        console.log("TokenAirdropReward: Can user claim?", userCanClaim);
        require(userCanClaim, "Cannot claim tokens");

        console.log(
            "TokenAirdropReward: Has already claimed?",
            tokensClaimed[user]
        );
        require(!tokensClaimed[user], "Already claimed");

        // Check if there are enough tokens left in the airdrop
        require(
            totalTokensClaimed + config.tokenAmount <=
                config.totalAirdropAmount,
            "Airdrop limit reached"
        );

        // Mark as claimed
        tokensClaimed[user] = true;
        totalClaimed++;
        totalTokensClaimed += config.tokenAmount;

        // Transfer tokens from broker wallet to user
        _transferTokensToUser(user, config.tokenAmount);

        // Record claim for analytics using BaseReward's tracking
        if (!hasClaimed[user]) {
            hasClaimed[user] = true;
            _trackClaim(user);
        }

        console.log(
            "TokenAirdropReward: Claim completed successfully for",
            user
        );
    }

    /**
     * @notice Trigger automatic distribution to eligible users
     * @dev Can only be called after distribution date and only if automatic distribution is enabled
     * @param eligibleUsers Array of addresses eligible for the airdrop
     */
    function triggerAutomaticDistribution(
        address[] calldata eligibleUsers
    ) external nonReentrant {
        console.log(
            "TokenAirdropReward: triggerAutomaticDistribution called by",
            msg.sender
        );
        bool isAuthorized = msg.sender == owner() || msg.sender == controller;
        console.log("TokenAirdropReward: Is authorized?", isAuthorized);
        require(isAuthorized, "Not authorized");

        console.log(
            "TokenAirdropReward: Automatic distribution enabled?",
            config.automaticDistribution
        );
        require(
            config.automaticDistribution,
            "Automatic distribution not enabled"
        );

        console.log("TokenAirdropReward: Current time", block.timestamp);
        console.log(
            "TokenAirdropReward: Distribution date",
            config.distributionDate
        );
        require(
            block.timestamp >= config.distributionDate,
            "Distribution date not reached"
        );

        console.log(
            "TokenAirdropReward: Processing automatic distribution for",
            eligibleUsers.length,
            "users"
        );

        for (uint256 i = 0; i < eligibleUsers.length; i++) {
            address user = eligibleUsers[i];

            // Skip users who already claimed or zero addresses
            if (tokensClaimed[user] || user == address(0)) {
                console.log(
                    "TokenAirdropReward: User already claimed or invalid",
                    user
                );
                continue;
            }

            // Check if there are enough tokens left
            if (
                totalTokensClaimed + config.tokenAmount >
                config.totalAirdropAmount
            ) {
                console.log(
                    "TokenAirdropReward: Airdrop limit reached, stopping distribution"
                );
                break;
            }

            console.log(
                "TokenAirdropReward: Distributing tokens to user",
                user
            );

            // Mark as claimed
            tokensClaimed[user] = true;
            totalClaimed++;
            totalTokensClaimed += config.tokenAmount;

            // Transfer tokens from broker wallet to user
            _transferTokensToUser(user, config.tokenAmount);

            // Record claim for analytics using BaseReward's tracking
            if (!hasClaimed[user]) {
                hasClaimed[user] = true;
                _trackClaim(user);
            }
        }

        console.log("TokenAirdropReward: Automatic distribution completed");
    }

    /**
     * @dev Internal function to transfer tokens from broker wallet to user
     * @param user Address of the user to receive tokens
     * @param amount Amount of tokens to transfer
     */
    function _transferTokensToUser(address user, uint256 amount) internal {
        console.log("TokenAirdropReward: Transferring tokens to user", user);
        IERC20 token = IERC20(config.tokenAddress);

        // Check if broker has enough tokens
        uint256 brokerBalance = token.balanceOf(brokerWallet);
        console.log("TokenAirdropReward: Broker wallet balance", brokerBalance);
        console.log("TokenAirdropReward: Token amount to transfer", amount);
        require(
            brokerBalance >= amount,
            "Insufficient tokens in broker wallet"
        );

        // Check if broker has approved this contract to spend tokens
        uint256 allowance = token.allowance(brokerWallet, address(this));
        console.log(
            "TokenAirdropReward: Broker wallet allowance for this contract",
            allowance
        );
        require(
            allowance >= amount,
            "Insufficient allowance from broker wallet"
        );

        // Transfer tokens from broker wallet to user
        token.safeTransferFrom(brokerWallet, user, amount);

        emit TokensClaimed(user, amount, block.timestamp);
        emit EligibleUserClaimed(user, amount);
        console.log(
            "TokenAirdropReward: Tokens transferred successfully to",
            user
        );
    }

    /**
     * @notice Check if a user can claim the reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(address user) public view override returns (bool) {
        bool activeStatus = active;
        bool alreadyClaimed = tokensClaimed[user];
        bool withinStartTime = block.timestamp >= claimStartDate;
        bool withinEndTime = claimFinishDate == 0 ||
            block.timestamp <= claimFinishDate;
        bool automaticMode = config.automaticDistribution;
        bool afterDistributionDate = automaticMode &&
            block.timestamp >= config.distributionDate;
        bool tokensAvailable = totalTokensClaimed + config.tokenAmount <=
            config.totalAirdropAmount;

        // Don't log in view functions as they might be called internally
        // This is a special case since we're debugging
        if (msg.sender == address(0)) {
            console.log(
                "TokenAirdropReward: Checking if user",
                user,
                "can claim"
            );
            console.log("TokenAirdropReward: Active?", activeStatus);
            console.log("TokenAirdropReward: Already claimed?", alreadyClaimed);
            console.log(
                "TokenAirdropReward: After start time?",
                withinStartTime
            );
            console.log("TokenAirdropReward: Before end time?", withinEndTime);
            console.log(
                "TokenAirdropReward: Tokens available?",
                tokensAvailable
            );
            console.log(
                "TokenAirdropReward: Automatic distribution?",
                automaticMode
            );
            if (automaticMode) {
                console.log(
                    "TokenAirdropReward: After distribution date?",
                    afterDistributionDate
                );
            }
        }

        // In automatic distribution mode, users can only claim before distribution date
        if (afterDistributionDate) {
            if (msg.sender == address(0)) {
                console.log(
                    "TokenAirdropReward: Cannot claim after distribution date in automatic mode"
                );
            }
            return false;
        }

        bool result = activeStatus &&
            !alreadyClaimed &&
            withinStartTime &&
            withinEndTime &&
            tokensAvailable;

        // Don't log in view functions as they might be called internally
        if (msg.sender == address(0)) {
            console.log("TokenAirdropReward: Can claim result:", result);
        }

        return result;
    }

    /**
     * @notice Process fee on claim - implementation for IReward
     * @param user Address that is claiming
     * @return Always true as no fees are charged
     */
    function processFeeOnClaim(address user) external override returns (bool) {
        console.log("TokenAirdropReward: Processing fee for user", user);
        // No fees for token airdrops
        return true;
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
        console.log(
            "TokenAirdropReward: Processing fee with discount for user",
            user
        );
        console.log("TokenAirdropReward: Discount rate:", discountRate);
        // No fees for token airdrops
        return true;
    }

    /**
     * @notice Update broker wallet
     * @param newBrokerWallet Address of the new broker wallet
     */
    function updateBrokerWallet(address newBrokerWallet) external onlyOwner {
        console.log(
            "TokenAirdropReward: Updating broker wallet from",
            brokerWallet,
            "to",
            newBrokerWallet
        );
        require(newBrokerWallet != address(0), "Invalid broker wallet");

        address oldBrokerWallet = brokerWallet;
        brokerWallet = newBrokerWallet;

        emit BrokerWalletUpdated(oldBrokerWallet, newBrokerWallet);
        console.log("TokenAirdropReward: Broker wallet updated successfully");
    }

    /**
     * @notice Toggle automatic distribution mode
     * @param enable Whether to enable automatic distribution
     * @param newDistributionDate New distribution date (if enabling)
     */
    function setAutomaticDistribution(
        bool enable,
        uint256 newDistributionDate
    ) external onlyOwner {
        console.log(
            "TokenAirdropReward: Setting automatic distribution to",
            enable
        );

        if (enable) {
            require(
                newDistributionDate > block.timestamp,
                "Distribution date must be in the future"
            );
            console.log(
                "TokenAirdropReward: Setting distribution date to",
                newDistributionDate
            );

            config.automaticDistribution = true;
            config.distributionDate = newDistributionDate;
            claimFinishDate = newDistributionDate;

            emit AutomaticDistributionEnabled(newDistributionDate);
        } else {
            config.automaticDistribution = false;
            claimFinishDate = block.timestamp + 30 days; // Default 30 day claim period

            emit AutomaticDistributionDisabled();
        }

        console.log(
            "TokenAirdropReward: Automatic distribution updated successfully"
        );
    }

    /**
     * @notice Update token amount per user
     * @param newAmount New token amount per user
     */
    function updateTokenAmount(uint256 newAmount) external onlyOwner {
        console.log(
            "TokenAirdropReward: Updating token amount per user from",
            config.tokenAmount,
            "to",
            newAmount
        );
        require(newAmount > 0, "Invalid token amount");
        config.tokenAmount = newAmount;
        console.log("TokenAirdropReward: Token amount updated successfully");
    }

    /**
     * @notice Update total airdrop amount
     * @param newTotalAmount New total airdrop amount
     */
    function updateTotalAirdropAmount(
        uint256 newTotalAmount
    ) external onlyOwner {
        console.log(
            "TokenAirdropReward: Updating total airdrop amount from",
            config.totalAirdropAmount,
            "to",
            newTotalAmount
        );
        require(
            newTotalAmount >= totalTokensClaimed,
            "New total must be >= already claimed"
        );
        config.totalAirdropAmount = newTotalAmount;
        console.log(
            "TokenAirdropReward: Total airdrop amount updated successfully"
        );
    }

    /**
     * @notice Set controller address
     * @param _controller New controller address
     */
    function setController(address _controller) external onlyOwner {
        console.log(
            "TokenAirdropReward: Manually setting controller from",
            controller,
            "to",
            _controller
        );
        require(_controller != address(0), "Invalid controller address");
        controller = _controller;
    }

    /**
     * @dev Internal function to set controller address
     * @param _controller New controller address
     */
    function _setController(address _controller) internal override {
        console.log(
            "TokenAirdropReward: Setting controller from",
            controller,
            "to",
            _controller
        );
        controller = _controller;
    }

    /**
     * @notice Check if a user has claimed tokens
     * @param user Address to check
     * @return Whether the user has claimed tokens
     */
    function hasUserClaimed(address user) external view returns (bool) {
        return tokensClaimed[user];
    }

    /**
     * @notice Get airdrop stats
     * @return airdropName Name of the airdrop
     * @return tokenAddress Address of the ERC20 token
     * @return tokenAmount Amount of tokens per eligible user
     * @return totalAmount Total tokens available for airdrop
     * @return claimedAmount Total amount of tokens claimed so far
     * @return claimedUsers Number of users who have claimed
     * @return isAutomatic Whether automatic distribution is enabled
     * @return distributionDate Date for automatic distribution (if enabled)
     */
    function getAirdropStats()
        external
        view
        returns (
            string memory airdropName,
            address tokenAddress,
            uint256 tokenAmount,
            uint256 totalAmount,
            uint256 claimedAmount,
            uint256 claimedUsers,
            bool isAutomatic,
            uint256 distributionDate
        )
    {
        return (
            config.airdropName,
            config.tokenAddress,
            config.tokenAmount,
            config.totalAirdropAmount,
            totalTokensClaimed,
            totalClaimed,
            config.automaticDistribution,
            config.distributionDate
        );
    }

    /**
     * @notice Debugging helper to check contract state
     */
    function debugState(
        address user
    )
        external
        view
        returns (
            bool isInitialized,
            bool isActive,
            uint256 totalClaimsCount,
            uint256 claimStart,
            uint256 claimEnd,
            bool userHasClaimed,
            bool userTokensClaimed,
            address controllerAddr,
            address ownerAddr,
            address brokerAddr,
            uint256 tokenAmount,
            uint256 totalAmount,
            uint256 claimedAmount,
            bool isAutomatic,
            uint256 distributionDate
        )
    {
        return (
            _initialized,
            active,
            totalClaims,
            claimStartDate,
            claimFinishDate,
            hasClaimed[user],
            tokensClaimed[user],
            controller,
            owner(),
            brokerWallet,
            config.tokenAmount,
            config.totalAirdropAmount,
            totalTokensClaimed,
            config.automaticDistribution,
            config.distributionDate
        );
    }
}
