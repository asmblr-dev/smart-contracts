// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "hardhat/console.sol";
import "../BaseReward.sol";

/**
 * @title NFTAirdropReward
 * @notice Reward implementation for airdropping NFTs to eligible users
 * @dev Supports both manual claiming and automatic distribution options
 */
contract NFTAirdropReward is BaseReward {
    // Config structure for NFT airdrop
    struct Config {
        string airdropName; // Name of the airdrop
        address nftAddress; // Address of the ERC721 contract
        uint256 totalAirdropAmount; // Total NFTs available for airdrop
        bool automaticDistribution; // Whether to distribute automatically
        uint256 distributionDate; // Date for automatic distribution (if enabled)
    }

    // Config instance
    Config public config;

    // Broker wallet that holds the NFTs
    address public brokerWallet;

    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;

    // Distribution tracking
    mapping(address => bool) public nftClaimed; // Tracks if a user has claimed their NFT
    mapping(address => uint256) public userToTokenId; // Maps user to their assigned tokenId
    mapping(uint256 => bool) public tokenIdAssigned; // Tracks which tokenIds are already assigned
    uint256 public totalClaimed; // Total number of users who have claimed

    // Events
    event NFTClaimed(
        address indexed user,
        uint256 tokenId,
        uint256 timestamp
    );
    event TokenIdAssigned(address indexed user, uint256 tokenId);
    event AutomaticDistributionEnabled(uint256 distributionDate);
    event AutomaticDistributionDisabled();
    event BrokerWalletUpdated(
        address indexed oldBroker,
        address indexed newBroker
    );
    event EligibleUserClaimed(address indexed user, uint256 tokenId);

    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        console.log("NFTAirdropReward: Initializing");
        _initialize(configData);
    }

    /**
     * @dev Internal initialization function for NFTAirdropReward
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        console.log("NFTAirdropReward: _initialize called");

        // Decode config data
        (
            string memory _airdropName,
            address _nftAddress,
            uint256 _totalAirdropAmount,
            address _brokerWallet,
            bool _automaticDistribution,
            uint256 _distributionDate
        ) = abi.decode(
                configData,
                (string, address, uint256, address, bool, uint256)
            );

        console.log("NFTAirdropReward: Airdrop name:", _airdropName);
        console.log("NFTAirdropReward: NFT address:", _nftAddress);
        console.log(
            "NFTAirdropReward: Total airdrop amount:",
            _totalAirdropAmount
        );
        console.log("NFTAirdropReward: Broker wallet:", _brokerWallet);
        console.log(
            "NFTAirdropReward: Automatic distribution:",
            _automaticDistribution
        );

        require(bytes(_airdropName).length > 0, "Invalid airdrop name");
        require(_nftAddress != address(0), "Invalid NFT address");
        require(_totalAirdropAmount > 0, "Invalid total amount");
        require(_brokerWallet != address(0), "Invalid broker wallet");

        // If automatic distribution is enabled, require a valid distribution date
        if (_automaticDistribution) {
            console.log(
                "NFTAirdropReward: Distribution date:",
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
            nftAddress: _nftAddress,
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
            "NFTAirdropReward: Set claim start date:",
            claimStartDate
        );
        console.log(
            "NFTAirdropReward: Set claim finish date:",
            claimFinishDate
        );
        console.log("NFTAirdropReward: Set active:", active);
        console.log("NFTAirdropReward: Set controller:", controller);
        console.log("NFTAirdropReward: _initialize completed");
    }

    /**
     * @notice Get the reward type identifier
     * @return Type identifier "NFT_AIRDROP"
     */
    function getRewardType() public pure override returns (string memory) {
        return "NFT_AIRDROP";
    }

    /**
     * @notice Validate configuration data
     * @param configData Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(
        bytes memory configData
    ) public pure override returns (bool) {
        if (configData.length < 6 * 32) {
            return false;
        }

        return true;
    }

    /**
     * @notice External claim function for an eligible user
     */
    function claimNFT() external nonReentrant whenActive {
        console.log("NFTAirdropReward: claimNFT called by", msg.sender);
        claim(msg.sender);
    }

    /**
     * @notice Claim function called by Tim3cap contract
     * @param user Address to claim NFT
     */
    function claim(address user) public override nonReentrant whenActive {
        console.log("NFTAirdropReward: claim called for user", user);
        console.log("NFTAirdropReward: Message sender", msg.sender);
        console.log("NFTAirdropReward: Controller", controller);
        console.log("NFTAirdropReward: Owner", owner());

        if (msg.sender != user) {
            // Allow either the owner or the controller (Tim3cap core) to call this function
            bool isAuthorized = msg.sender == owner() ||
                msg.sender == controller;
            console.log("NFTAirdropReward: Is authorized?", isAuthorized);
            require(isAuthorized, "Not authorized");
        }

        bool userCanClaim = canClaim(user);
        console.log("NFTAirdropReward: Can user claim?", userCanClaim);
        require(userCanClaim, "Cannot claim NFT");

        console.log(
            "NFTAirdropReward: Has already claimed?",
            nftClaimed[user]
        );
        require(!nftClaimed[user], "Already claimed");

        // Check if there are enough NFTs left in the airdrop
        require(
            totalClaimed < config.totalAirdropAmount,
            "Airdrop limit reached"
        );

        // Check if this user has an assigned token ID
        uint256 tokenId = userToTokenId[user];
        if (tokenId == 0) {
            console.log(
                "NFTAirdropReward: User doesn't have an assigned token ID, assigning one..."
            );
            tokenId = _assignTokenId(user);
        }

        console.log("NFTAirdropReward: Token ID assigned:", tokenId);

        // Mark as claimed
        nftClaimed[user] = true;
        totalClaimed++;

        // Transfer NFT from broker wallet to user
        _transferNFTToUser(user, tokenId);

        // Record claim for analytics using BaseReward's tracking
        if (!hasClaimed[user]) {
            hasClaimed[user] = true;
            _trackClaim(user);
        }

        console.log(
            "NFTAirdropReward: Claim completed successfully for",
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
            "NFTAirdropReward: triggerAutomaticDistribution called by",
            msg.sender
        );
        bool isAuthorized = msg.sender == owner() || msg.sender == controller;
        console.log("NFTAirdropReward: Is authorized?", isAuthorized);
        require(isAuthorized, "Not authorized");

        console.log(
            "NFTAirdropReward: Automatic distribution enabled?",
            config.automaticDistribution
        );
        require(
            config.automaticDistribution,
            "Automatic distribution not enabled"
        );

        console.log("NFTAirdropReward: Current time", block.timestamp);
        console.log(
            "NFTAirdropReward: Distribution date",
            config.distributionDate
        );
        require(
            block.timestamp >= config.distributionDate,
            "Distribution date not reached"
        );

        console.log(
            "NFTAirdropReward: Processing automatic distribution for",
            eligibleUsers.length,
            "users"
        );

        for (uint256 i = 0; i < eligibleUsers.length; i++) {
            address user = eligibleUsers[i];

            // Skip users who already claimed or zero addresses
            if (nftClaimed[user] || user == address(0)) {
                console.log(
                    "NFTAirdropReward: User already claimed or invalid",
                    user
                );
                continue;
            }

            // Check if there are enough NFTs left
            if (totalClaimed >= config.totalAirdropAmount) {
                console.log(
                    "NFTAirdropReward: Airdrop limit reached, stopping distribution"
                );
                break;
            }

            console.log(
                "NFTAirdropReward: Distributing NFT to user",
                user
            );

            // Check if this user has an assigned token ID
            uint256 tokenId = userToTokenId[user];
            if (tokenId == 0) {
                console.log(
                    "NFTAirdropReward: User doesn't have an assigned token ID, assigning one..."
                );
                tokenId = _assignTokenId(user);
            }

            console.log("NFTAirdropReward: Token ID assigned:", tokenId);

            // Mark as claimed
            nftClaimed[user] = true;
            totalClaimed++;

            // Transfer NFT from broker wallet to user
            _transferNFTToUser(user, tokenId);

            // Record claim for analytics using BaseReward's tracking
            if (!hasClaimed[user]) {
                hasClaimed[user] = true;
                _trackClaim(user);
            }
        }

        console.log("NFTAirdropReward: Automatic distribution completed");
    }

    /**
     * @dev Internal function to assign a token ID to a user
     * @param user Address of the user
     * @return tokenId The assigned token ID
     */
    function _assignTokenId(address user) internal returns (uint256) {
        IERC721 nft = IERC721(config.nftAddress);
        // For enumerable operations, we need to cast to IERC721Enumerable
        IERC721Enumerable enumerableNft = IERC721Enumerable(config.nftAddress);

        // Get broker wallet NFT balance
        uint256 brokerBalance = nft.balanceOf(brokerWallet);
        require(brokerBalance > 0, "No NFTs left in broker wallet");

        // Find an available token ID from broker wallet
        uint256 tokenId = 0;
        for (uint256 i = 0; i < brokerBalance; i++) {
            try enumerableNft.tokenOfOwnerByIndex(brokerWallet, i) returns (
                uint256 id
            ) {
                if (!tokenIdAssigned[id]) {
                    tokenId = id;
                    break;
                }
            } catch {
                // Skip if tokenOfOwnerByIndex fails or reverts
                continue;
            }
        }
        // If no token ID found, try to directly check if broker owns specific IDs
        // This is a fallback if tokenOfOwnerByIndex is not implemented
        if (tokenId == 0) {
            bool found = false;
            uint256 checkStart = 1; // Start checking from ID 1
            uint256 maxCheck = 1000; // Limit to prevent gas issues

            for (uint256 i = checkStart; i < checkStart + maxCheck; i++) {
                try nft.ownerOf(i) returns (address owner) {
                    if (owner == brokerWallet && !tokenIdAssigned[i]) {
                        tokenId = i;
                        found = true;
                        break;
                    }
                } catch {
                    // Skip if ownerOf fails or reverts
                    continue;
                }
            }

            require(found, "No available token IDs");
        }

        // Mark token ID as assigned and map to user
        tokenIdAssigned[tokenId] = true;
        userToTokenId[user] = tokenId;

        emit TokenIdAssigned(user, tokenId);

        return tokenId;
    }

    /**
     * @dev Internal function to transfer NFT from broker wallet to user
     * @param user Address of the user to receive NFT
     * @param tokenId ID of the NFT to transfer
     */
    function _transferNFTToUser(address user, uint256 tokenId) internal {
        console.log(
            "NFTAirdropReward: Transferring NFT ID",
            tokenId,
            "to user",
            user
        );
        IERC721 nft = IERC721(config.nftAddress);

        // Check if broker is still the owner
        address currentOwner = nft.ownerOf(tokenId);
        console.log(
            "NFTAirdropReward: Current owner of token ID",
            tokenId,
            "is",
            currentOwner
        );
        require(
            currentOwner == brokerWallet,
            "Broker wallet no longer owns this NFT"
        );

        // Check if broker has approved this contract to transfer
        address approved = nft.getApproved(tokenId);
        bool isApprovedForAll = nft.isApprovedForAll(
            brokerWallet,
            address(this)
        );
        console.log(
            "NFTAirdropReward: Approved address for token ID",
            tokenId,
            "is",
            approved
        );
        console.log("NFTAirdropReward: Is approved for all:", isApprovedForAll);

        require(
            approved == address(this) || isApprovedForAll,
            "NFT not approved for transfer by broker wallet"
        );

        // Transfer NFT from broker wallet to user
        nft.safeTransferFrom(brokerWallet, user, tokenId);

        emit NFTClaimed(user, tokenId, block.timestamp);
        emit EligibleUserClaimed(user, tokenId);
        console.log("NFTAirdropReward: NFT transferred successfully to", user);
    }

    /**
     * @notice Check if a user can claim the reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(address user) public view override returns (bool) {
        bool activeStatus = active;
        bool alreadyClaimed = nftClaimed[user];
        bool withinStartTime = block.timestamp >= claimStartDate;
        bool withinEndTime = claimFinishDate == 0 ||
            block.timestamp <= claimFinishDate;
        bool automaticMode = config.automaticDistribution;
        bool afterDistributionDate = automaticMode &&
            block.timestamp >= config.distributionDate;
        bool nftsAvailable = totalClaimed < config.totalAirdropAmount;

        // Don't log in view functions as they might be called internally
        // This is a special case since we're debugging
        if (msg.sender == address(0)) {
            console.log(
                "NFTAirdropReward: Checking if user",
                user,
                "can claim"
            );
            console.log("NFTAirdropReward: Active?", activeStatus);
            console.log("NFTAirdropReward: Already claimed?", alreadyClaimed);
            console.log(
                "NFTAirdropReward: After start time?",
                withinStartTime
            );
            console.log("NFTAirdropReward: Before end time?", withinEndTime);
            console.log(
                "NFTAirdropReward: NFTs available?",
                nftsAvailable
            );
            console.log(
                "NFTAirdropReward: Automatic distribution?",
                automaticMode
            );
            if (automaticMode) {
                console.log(
                    "NFTAirdropReward: After distribution date?",
                    afterDistributionDate
                );
            }
        }

        // In automatic distribution mode, users can only claim before distribution date
        if (afterDistributionDate) {
            if (msg.sender == address(0)) {
                console.log(
                    "NFTAirdropReward: Cannot claim after distribution date in automatic mode"
                );
            }
            return false;
        }

        bool result = activeStatus &&
            !alreadyClaimed &&
            withinStartTime &&
            withinEndTime &&
            nftsAvailable;

        // Don't log in view functions as they might be called internally
        if (msg.sender == address(0)) {
            console.log("NFTAirdropReward: Can claim result:", result);
        }

        return result;
    }

    /**
     * @notice Process fee on claim - implementation for IReward
     * @param user Address that is claiming
     * @return Always true as no fees are charged
     */
    function processFeeOnClaim(address user) external override returns (bool) {
        console.log("NFTAirdropReward: Processing fee for user", user);
        // No fees for NFT airdrops
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
            "NFTAirdropReward: Processing fee with discount for user",
            user
        );
        console.log("NFTAirdropReward: Discount rate:", discountRate);
        // No fees for NFT airdrops
        return true;
    }

    /**
     * @notice Manually assign specific NFT token IDs to users
     * @param users Array of user addresses
     * @param tokenIds Array of token IDs to assign
     */
    function assignTokenIds(
        address[] calldata users,
        uint256[] calldata tokenIds
    ) external onlyOwner {
        console.log("NFTAirdropReward: Assigning token IDs to users");
        require(users.length == tokenIds.length, "Array lengths must match");
        require(users.length > 0, "No assignments provided");

        IERC721 nft = IERC721(config.nftAddress);

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 tokenId = tokenIds[i];

            require(!nftClaimed[user], "User has already claimed");
            require(tokenId > 0, "Invalid token ID");
            require(!tokenIdAssigned[tokenId], "Token ID already assigned");

            // Verify broker wallet owns this token
            try nft.ownerOf(tokenId) returns (address owner) {
                require(
                    owner == brokerWallet,
                    "Broker wallet does not own this token ID"
                );
            } catch {
                revert("Token ID does not exist");
            }

            // Clear any previous assignment for this user
            uint256 oldTokenId = userToTokenId[user];
            if (oldTokenId != 0) {
                tokenIdAssigned[oldTokenId] = false;
            }

            // Assign the new token ID
            tokenIdAssigned[tokenId] = true;
            userToTokenId[user] = tokenId;

            emit TokenIdAssigned(user, tokenId);
        }

        console.log("NFTAirdropReward: Token IDs assigned successfully");
    }

    /**
     * @notice Update broker wallet
     * @param newBrokerWallet Address of the new broker wallet
     */
    function updateBrokerWallet(address newBrokerWallet) external onlyOwner {
        console.log(
            "NFTAirdropReward: Updating broker wallet from",
            brokerWallet,
            "to",
            newBrokerWallet
        );
        require(newBrokerWallet != address(0), "Invalid broker wallet");

        address oldBrokerWallet = brokerWallet;
        brokerWallet = newBrokerWallet;

        emit BrokerWalletUpdated(oldBrokerWallet, newBrokerWallet);
        console.log("NFTAirdropReward: Broker wallet updated successfully");
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
            "NFTAirdropReward: Setting automatic distribution to",
            enable
        );

        if (enable) {
            require(
                newDistributionDate > block.timestamp,
                "Distribution date must be in the future"
            );
            console.log(
                "NFTAirdropReward: Setting distribution date to",
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
            "NFTAirdropReward: Automatic distribution updated successfully"
        );
    }

    /**
     * @notice Update total airdrop amount
     * @param newTotalAmount New total airdrop amount
     */
    function updateTotalAirdropAmount(
        uint256 newTotalAmount
    ) external onlyOwner {
        console.log(
            "NFTAirdropReward: Updating total airdrop amount from",
            config.totalAirdropAmount,
            "to",
            newTotalAmount
        );
        require(
            newTotalAmount >= totalClaimed,
            "New total must be >= already claimed"
        );
        config.totalAirdropAmount = newTotalAmount;
        console.log(
            "NFTAirdropReward: Total airdrop amount updated successfully"
        );
    }

    /**
     * @notice Set controller address
     * @param _controller New controller address
     */
    function setController(address _controller) external onlyOwner {
        console.log(
            "NFTAirdropReward: Manually setting controller from",
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
            "NFTAirdropReward: Setting controller from",
            controller,
            "to",
            _controller
        );
        controller = _controller;
    }

    /**
     * @notice Check if a user has claimed an NFT
     * @param user Address to check
     * @return Whether the user has claimed an NFT
     */
    function hasUserClaimed(address user) external view returns (bool) {
        return nftClaimed[user];
    }

    /**
     * @notice Get the token ID assigned to a user
     * @param user Address to check
     * @return The token ID assigned to the user (0 if none)
     */
    function getUserTokenId(address user) external view returns (uint256) {
        return userToTokenId[user];
    }

    /**
     * @notice Check if a token ID is assigned to a user
     * @param tokenId Token ID to check
     * @return Whether the token ID is assigned
     */
    function isTokenIdAssigned(uint256 tokenId) external view returns (bool) {
        return tokenIdAssigned[tokenId];
    }

    /**
     * @notice Get broker wallet NFTs
     * @return Total number of NFTs in broker wallet
     * @dev This is a gas-intensive operation and should only be used off-chain
     */
    function getBrokerNFTCount() external view returns (uint256) {
        IERC721 nft = IERC721(config.nftAddress);
        return nft.balanceOf(brokerWallet);
    }

    /**
     * @notice Get airdrop stats
     * @return airdropName Name of the airdrop
     * @return nftAddress Address of the ERC721 contract
     * @return totalAmount Total NFTs available for airdrop
     * @return claimedAmount Total number of NFTs claimed so far
     * @return claimedUsers Number of users who have claimed
     * @return isAutomatic Whether automatic distribution is enabled
     * @return distributionDate Date for automatic distribution (if enabled)
     */
    function getAirdropStats()
        external
        view
        returns (
            string memory airdropName,
            address nftAddress,
            uint256 totalAmount,
            uint256 claimedAmount,
            uint256 claimedUsers,
            bool isAutomatic,
            uint256 distributionDate
        )
    {
        return (
            config.airdropName,
            config.nftAddress,
            config.totalAirdropAmount,
            totalClaimed,
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
            bool userNFTClaimed,
            uint256 userTokenId,
            address controllerAddr,
            address ownerAddr,
            address brokerAddr,
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
            nftClaimed[user],
            userToTokenId[user],
            controller,
            owner(),
            brokerWallet,
            config.totalAirdropAmount,
            totalClaimed,
            config.automaticDistribution,
            config.distributionDate
        );
    }
}