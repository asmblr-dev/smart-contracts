// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "hardhat/console.sol";
import "../BaseReward.sol";

/**
 * @title NFTRaffleReward
 * @notice Reward implementation for raffling NFTs to winners
 * @dev Records winners and supports both manual claims and automatic distribution of NFTs
 */
contract NFTRaffleReward is BaseReward {
    // Config structure for NFT raffle
    struct Config {
        string raffleName; // Name of the raffle
        address nftAddress; // Address of the ERC721 contract
        bool automaticDistribution; // Whether to distribute automatically
        uint256 distributionDate; // Date for automatic distribution (if enabled)
    }

    // Config instance
    Config public config;

    // Broker wallet that holds the NFTs
    address public brokerWallet;

    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;

    // Winner management
    mapping(address => bool) public isWinner;
    address[] private _winners;

    // NFT distribution tracking
    mapping(address => uint256) public winnerToTokenId; // Maps winner to their assigned tokenId
    mapping(uint256 => bool) public tokenIdAssigned; // Tracks which tokenIds are already assigned
    mapping(address => bool) public nftClaimed; // Tracks if a winner has claimed their NFT
    uint256 public totalClaimed; // Total number of NFTs claimed

    // Events
    event WinnerAdded(address indexed winner, uint256 timestamp);
    event WinnerRemoved(address indexed winner, uint256 timestamp);
    event NFTClaimed(
        address indexed winner,
        uint256 tokenId,
        uint256 timestamp
    );
    event TokenIdAssigned(address indexed winner, uint256 tokenId);
    event AutomaticDistributionEnabled(uint256 distributionDate);
    event AutomaticDistributionDisabled();
    event BrokerWalletUpdated(
        address indexed oldBroker,
        address indexed newBroker
    );

    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        console.log("NFTRaffleReward: Initializing");
        _initialize(configData);
    }

    /**
     * @dev Internal initialization function for NFTRaffleReward
     * @param configData Configuration data for the reward
     */
    function _initialize(bytes memory configData) internal override {
        console.log("NFTRaffleReward: _initialize called");

        // Decode config data
        (
            string memory _raffleName,
            address _nftAddress,
            address _brokerWallet,
            bool _automaticDistribution,
            uint256 _distributionDate
        ) = abi.decode(configData, (string, address, address, bool, uint256));

        console.log("NFTRaffleReward: Raffle name:", _raffleName);
        console.log("NFTRaffleReward: NFT address:", _nftAddress);
        console.log("NFTRaffleReward: Broker wallet:", _brokerWallet);
        console.log(
            "NFTRaffleReward: Automatic distribution:",
            _automaticDistribution
        );

        require(bytes(_raffleName).length > 0, "Invalid raffle name");
        require(_nftAddress != address(0), "Invalid NFT address");
        require(_brokerWallet != address(0), "Invalid broker wallet");

        // If automatic distribution is enabled, require a valid distribution date
        if (_automaticDistribution) {
            console.log(
                "NFTRaffleReward: Distribution date:",
                _distributionDate
            );
            require(
                _distributionDate > block.timestamp,
                "Distribution date must be in the future"
            );
        }

        // Store config values
        config = Config({
            raffleName: _raffleName,
            nftAddress: _nftAddress,
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

        console.log("NFTRaffleReward: Set claim start date:", claimStartDate);
        console.log("NFTRaffleReward: Set claim finish date:", claimFinishDate);
        console.log("NFTRaffleReward: Set active:", active);
        console.log("NFTRaffleReward: Set controller:", controller);
        console.log("NFTRaffleReward: _initialize completed");
    }

    /**
     * @notice Get the reward type identifier
     * @return Type identifier "NFT_RAFFLE"
     */
    function getRewardType() public pure override returns (string memory) {
        return "NFT_RAFFLE";
    }

    /**
     * @notice Validate configuration data
     * @param configData Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(
        bytes memory configData
    ) public pure override returns (bool) {
        if (configData.length < 5 * 32) {
            return false;
        }

        return true;
    }

    /**
     * @notice External claim function for a winner
     */
    function claimNFT() external nonReentrant whenActive {
        console.log("NFTRaffleReward: claimNFT called by", msg.sender);
        claim(msg.sender);
    }

    /**
     * @notice Claim function called by Tim3cap contract
     * @param user Address to claim NFT
     */
    function claim(address user) public override nonReentrant whenActive {
        console.log("NFTRaffleReward: claim called for user", user);
        console.log("NFTRaffleReward: Message sender", msg.sender);
        console.log("NFTRaffleReward: Controller", controller);
        console.log("NFTRaffleReward: Owner", owner());

        if (msg.sender != user) {
            // Allow either the owner or the controller (Tim3cap core) to call this function
            bool isAuthorized = msg.sender == owner() ||
                msg.sender == controller;
            console.log("NFTRaffleReward: Is authorized?", isAuthorized);
            require(isAuthorized, "Not authorized");
        }

        bool userCanClaim = canClaim(user);
        console.log("NFTRaffleReward: Can user claim?", userCanClaim);
        require(userCanClaim, "Cannot claim NFT");

        console.log("NFTRaffleReward: Is winner?", isWinner[user]);
        require(isWinner[user], "Not a winner");

        console.log("NFTRaffleReward: Has already claimed?", nftClaimed[user]);
        require(!nftClaimed[user], "Already claimed");

        // Check if this winner has an assigned token ID
        uint256 tokenId = winnerToTokenId[user];
        if (tokenId == 0) {
            console.log(
                "NFTRaffleReward: Winner doesn't have an assigned token ID, assigning one..."
            );
            tokenId = _assignTokenId(user);
        }

        console.log("NFTRaffleReward: Token ID assigned:", tokenId);

        // Mark as claimed
        nftClaimed[user] = true;
        totalClaimed++;

        // Transfer NFT from broker wallet to winner
        _transferNFTToWinner(user, tokenId);

        // Record claim for analytics using BaseReward's tracking
        if (!hasClaimed[user]) {
            hasClaimed[user] = true;
            _trackClaim(user);
        }

        console.log("NFTRaffleReward: Claim completed successfully for", user);
    }

    /**
     * @notice Trigger automatic distribution to all winners
     * @dev Can only be called after distribution date and only if automatic distribution is enabled
     */
    function triggerAutomaticDistribution() external nonReentrant {
        console.log(
            "NFTRaffleReward: triggerAutomaticDistribution called by",
            msg.sender
        );
        bool isAuthorized = msg.sender == owner() || msg.sender == controller;
        console.log("NFTRaffleReward: Is authorized?", isAuthorized);
        require(isAuthorized, "Not authorized");

        console.log(
            "NFTRaffleReward: Automatic distribution enabled?",
            config.automaticDistribution
        );
        require(
            config.automaticDistribution,
            "Automatic distribution not enabled"
        );

        console.log("NFTRaffleReward: Current time", block.timestamp);
        console.log(
            "NFTRaffleReward: Distribution date",
            config.distributionDate
        );
        require(
            block.timestamp >= config.distributionDate,
            "Distribution date not reached"
        );

        console.log(
            "NFTRaffleReward: Processing automatic distribution for",
            _winners.length,
            "winners"
        );

        for (uint256 i = 0; i < _winners.length; i++) {
            address winner = _winners[i];

            // Skip winners who already claimed
            if (nftClaimed[winner]) {
                console.log("NFTRaffleReward: Winner already claimed", winner);
                continue;
            }

            console.log("NFTRaffleReward: Distributing NFT to winner", winner);

            // Check if this winner has an assigned token ID
            uint256 tokenId = winnerToTokenId[winner];
            if (tokenId == 0) {
                console.log(
                    "NFTRaffleReward: Winner doesn't have an assigned token ID, assigning one..."
                );
                tokenId = _assignTokenId(winner);
            }

            console.log("NFTRaffleReward: Token ID assigned:", tokenId);

            // Mark as claimed
            nftClaimed[winner] = true;
            totalClaimed++;

            // Transfer NFT from broker wallet to winner
            _transferNFTToWinner(winner, tokenId);

            // Record claim for analytics using BaseReward's tracking
            if (!hasClaimed[winner]) {
                hasClaimed[winner] = true;
                _trackClaim(winner);
            }
        }

        console.log("NFTRaffleReward: Automatic distribution completed");
    }

    /**
     * @dev Internal function to assign a token ID to a winner
     * @param winner Address of the winner
     * @return tokenId The assigned token ID
     */
    function _assignTokenId(address winner) internal returns (uint256) {
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

        // Mark token ID as assigned and map to winner
        tokenIdAssigned[tokenId] = true;
        winnerToTokenId[winner] = tokenId;

        emit TokenIdAssigned(winner, tokenId);

        return tokenId;
    }

    /**
     * @dev Internal function to transfer NFT from broker wallet to winner
     * @param winner Address of the winner to receive NFT
     * @param tokenId ID of the NFT to transfer
     */
    function _transferNFTToWinner(address winner, uint256 tokenId) internal {
        console.log(
            "NFTRaffleReward: Transferring NFT ID",
            tokenId,
            "to winner",
            winner
        );
        IERC721 nft = IERC721(config.nftAddress);

        // Check if broker is still the owner
        address currentOwner = nft.ownerOf(tokenId);
        console.log(
            "NFTRaffleReward: Current owner of token ID",
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
            "NFTRaffleReward: Approved address for token ID",
            tokenId,
            "is",
            approved
        );
        console.log("NFTRaffleReward: Is approved for all:", isApprovedForAll);

        require(
            approved == address(this) || isApprovedForAll,
            "NFT not approved for transfer by broker wallet"
        );

        // Transfer NFT from broker wallet to winner
        nft.safeTransferFrom(brokerWallet, winner, tokenId);

        emit NFTClaimed(winner, tokenId, block.timestamp);
        console.log("NFTRaffleReward: NFT transferred successfully to", winner);
    }

    /**
     * @notice Check if a user can claim the reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(address user) public view override returns (bool) {
        bool activeStatus = active;
        bool isAWinner = isWinner[user];
        bool alreadyClaimed = nftClaimed[user];
        bool withinStartTime = block.timestamp >= claimStartDate;
        bool withinEndTime = claimFinishDate == 0 ||
            block.timestamp <= claimFinishDate;
        bool automaticMode = config.automaticDistribution;
        bool afterDistributionDate = automaticMode &&
            block.timestamp >= config.distributionDate;

        // Don't log in view functions as they might be called internally
        // This is a special case since we're debugging
        if (msg.sender == address(0)) {
            console.log("NFTRaffleReward: Checking if user", user, "can claim");
            console.log("NFTRaffleReward: Active?", activeStatus);
            console.log("NFTRaffleReward: Is winner?", isAWinner);
            console.log("NFTRaffleReward: Already claimed?", alreadyClaimed);
            console.log("NFTRaffleReward: After start time?", withinStartTime);
            console.log("NFTRaffleReward: Before end time?", withinEndTime);
            console.log(
                "NFTRaffleReward: Automatic distribution?",
                automaticMode
            );
            if (automaticMode) {
                console.log(
                    "NFTRaffleReward: After distribution date?",
                    afterDistributionDate
                );
            }
        }

        // In automatic distribution mode, users can only claim before distribution date
        if (afterDistributionDate) {
            if (msg.sender == address(0)) {
                console.log(
                    "NFTRaffleReward: Cannot claim after distribution date in automatic mode"
                );
            }
            return false;
        }

        bool result = activeStatus &&
            isAWinner &&
            !alreadyClaimed &&
            withinStartTime &&
            withinEndTime;

        // Don't log in view functions as they might be called internally
        if (msg.sender == address(0)) {
            console.log("NFTRaffleReward: Can claim result:", result);
        }

        return result;
    }

    /**
     * @notice Process fee on claim - implementation for IReward
     * @param user Address that is claiming
     * @return Always true as no fees are charged
     */
    function processFeeOnClaim(address user) external override returns (bool) {
        console.log("NFTRaffleReward: Processing fee for user", user);
        // No fees for NFT distribution
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
            "NFTRaffleReward: Processing fee with discount for user",
            user
        );
        console.log("NFTRaffleReward: Discount rate:", discountRate);
        // No fees for NFT distribution
        return true;
    }

    /**
     * @notice Set raffle winners (only owner)
     * @param winners Array of winning addresses
     */
    function setWinners(address[] calldata winners) external onlyOwner {
        console.log("NFTRaffleReward: Setting", winners.length, "winners");
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

        console.log("NFTRaffleReward: Winners set successfully");
    }

    /**
     * @notice Add a single winner
     * @param winner Address of the winner to add
     */
    function addWinner(address winner) external onlyOwner {
        console.log("NFTRaffleReward: Adding winner", winner);
        require(winner != address(0), "Invalid winner address");
        require(!isWinner[winner], "Already a winner");

        isWinner[winner] = true;
        _winners.push(winner);

        emit WinnerAdded(winner, block.timestamp);
        console.log("NFTRaffleReward: Winner added successfully");
    }

    /**
     * @notice Remove a single winner
     * @param winner Address of the winner to remove
     */
    function removeWinner(address winner) external onlyOwner {
        console.log("NFTRaffleReward: Removing winner", winner);
        require(isWinner[winner], "Not a winner");
        require(!nftClaimed[winner], "Winner has already claimed");

        isWinner[winner] = false;

        // Remove from winners array
        for (uint256 i = 0; i < _winners.length; i++) {
            if (_winners[i] == winner) {
                _winners[i] = _winners[_winners.length - 1];
                _winners.pop();
                break;
            }
        }

        // Clear token ID assignment if one was made
        uint256 tokenId = winnerToTokenId[winner];
        if (tokenId != 0) {
            tokenIdAssigned[tokenId] = false;
            winnerToTokenId[winner] = 0;
        }

        emit WinnerRemoved(winner, block.timestamp);
        console.log("NFTRaffleReward: Winner removed successfully");
    }

    /**
     * @notice Manually assign specific NFT token IDs to winners
     * @param winners Array of winner addresses
     * @param tokenIds Array of token IDs to assign
     */
    function assignTokenIds(
        address[] calldata winners,
        uint256[] calldata tokenIds
    ) external onlyOwner {
        console.log("NFTRaffleReward: Assigning token IDs to winners");
        require(winners.length == tokenIds.length, "Array lengths must match");
        require(winners.length > 0, "No assignments provided");

        IERC721 nft = IERC721(config.nftAddress);

        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            uint256 tokenId = tokenIds[i];

            require(isWinner[winner], "Not a winner");
            require(!nftClaimed[winner], "Winner has already claimed");
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

            // Clear any previous assignment for this winner
            uint256 oldTokenId = winnerToTokenId[winner];
            if (oldTokenId != 0) {
                tokenIdAssigned[oldTokenId] = false;
            }

            // Assign the new token ID
            tokenIdAssigned[tokenId] = true;
            winnerToTokenId[winner] = tokenId;

            emit TokenIdAssigned(winner, tokenId);
        }

        console.log("NFTRaffleReward: Token IDs assigned successfully");
    }

    /**
     * @notice Update broker wallet
     * @param newBrokerWallet Address of the new broker wallet
     */
    function updateBrokerWallet(address newBrokerWallet) external onlyOwner {
        console.log(
            "NFTRaffleReward: Updating broker wallet from",
            brokerWallet,
            "to",
            newBrokerWallet
        );
        require(newBrokerWallet != address(0), "Invalid broker wallet");

        address oldBrokerWallet = brokerWallet;
        brokerWallet = newBrokerWallet;

        emit BrokerWalletUpdated(oldBrokerWallet, newBrokerWallet);
        console.log("NFTRaffleReward: Broker wallet updated successfully");
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
            "NFTRaffleReward: Setting automatic distribution to",
            enable
        );

        if (enable) {
            require(
                newDistributionDate > block.timestamp,
                "Distribution date must be in the future"
            );
            console.log(
                "NFTRaffleReward: Setting distribution date to",
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
            "NFTRaffleReward: Automatic distribution updated successfully"
        );
    }

    /**
     * @notice Set controller address
     * @param _controller New controller address
     */
    function setController(address _controller) external onlyOwner {
        console.log(
            "NFTRaffleReward: Manually setting controller from",
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
            "NFTRaffleReward: Setting controller from",
            controller,
            "to",
            _controller
        );
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
     * @return hasClaimed Whether the address has claimed their NFT
     * @return assignedTokenId The token ID assigned to this winner (0 if none)
     */
    function checkWinnerStatus(
        address user
    ) external view returns (bool, bool, uint256) {
        return (isWinner[user], nftClaimed[user], winnerToTokenId[user]);
    }

    /**
     * @notice Get raffle stats
     * @return raffleName Name of the raffle
     * @return nftAddress Address of the ERC721 contract
     * @return winnersCount Total number of winners
     * @return totalNFTsClaimed Number of winners who have claimed
     * @return isAutomatic Whether automatic distribution is enabled
     * @return distributionDate Date for automatic distribution (if enabled)
     */
    function getRaffleStats()
        external
        view
        returns (
            string memory raffleName,
            address nftAddress,
            uint256 winnersCount,
            uint256 totalNFTsClaimed,
            bool isAutomatic,
            uint256 distributionDate
        )
    {
        return (
            config.raffleName,
            config.nftAddress,
            _winners.length,
            totalClaimed,
            config.automaticDistribution,
            config.distributionDate
        );
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
     * @notice Check if a token ID is assigned to a winner
     * @param tokenId Token ID to check
     * @return Whether the token ID is assigned
     */
    function isTokenIdAssigned(uint256 tokenId) external view returns (bool) {
        return tokenIdAssigned[tokenId];
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
            bool userIsWinner,
            bool userNFTClaimed,
            uint256 userTokenId,
            address controllerAddr,
            address ownerAddr,
            address brokerAddr,
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
            isWinner[user],
            nftClaimed[user],
            winnerToTokenId[user],
            controller,
            owner(),
            brokerWallet,
            config.automaticDistribution,
            config.distributionDate
        );
    }
}
