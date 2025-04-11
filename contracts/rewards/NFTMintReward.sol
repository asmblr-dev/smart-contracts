// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "hardhat/console.sol";
import "../BaseReward.sol";

/**
 * @title NFTMintReward
 * @notice Reward implementation for minting new NFTs
 * @dev Combines ERC721Enumerable and ERC2981 for royalty support
 */
contract NFTMintReward is BaseReward, ERC721Enumerable, ERC2981 {
    struct Config {
        string name;
        string symbol;
        string description;
        uint256 maxSupply;
        bool isRandomized;
        address royaltyRecipient;
        uint96 royaltyPercentage;
    }

    Config public config;
    string public baseURI;
    string public description;

    // Add controller variable to allow the Tim3cap core contract to call claim
    address public controller;

    uint256 public nextTokenId = 1;
    uint256[] public remainingTokenIds;
    mapping(address => uint256) public userTokens;

    constructor() ERC721("", "") {
        _initialized = true; // prevent use of the logic contract directly
    }

    /**
     * @notice Initialize the reward contract
     * @param configData Configuration data for the reward
     */
    function initialize(bytes memory configData) external override initializer {
        console.log("NFTMintReward: Initializing");
        _initialize(configData);
    }

    function _initialize(bytes memory configData) internal override {
        console.log("NFTMintReward: _initialize called");
        (
            string memory _name,
            string memory _symbol,
            string memory _description,
            uint256 _maxSupply,
            bool _isRandomized,
            address _royaltyRecipient,
            uint96 _royaltyPercentage
        ) = abi.decode(
                configData,
                (string, string, string, uint256, bool, address, uint96)
            );

        console.log("NFTMintReward: Name:", _name);
        console.log("NFTMintReward: Symbol:", _symbol);
        console.log("NFTMintReward: Max supply:", _maxSupply);
        console.log("NFTMintReward: Is randomized:", _isRandomized);
        console.log("NFTMintReward: Royalty recipient:", _royaltyRecipient);
        console.log("NFTMintReward: Royalty percentage:", _royaltyPercentage);

        // Ensure maxSupply is at least 1
        require(_maxSupply > 0, "Max supply must be greater than 0");

        config = Config({
            name: _name,
            symbol: _symbol,
            description: _description,
            maxSupply: _maxSupply,
            isRandomized: _isRandomized,
            royaltyRecipient: _royaltyRecipient,
            royaltyPercentage: _royaltyPercentage
        });

        // Set the ERC721 name and symbol values
        _initializeERC721(_name, _symbol);
        
        description = _description;
        _setDefaultRoyalty(_royaltyRecipient, _royaltyPercentage);

        if (_isRandomized) {
            console.log("NFTMintReward: Initializing randomized distribution");
            for (uint256 i = 1; i <= _maxSupply; i++) {
                remainingTokenIds.push(i);
            }
            console.log("NFTMintReward: Added", _maxSupply, "token IDs");
        }

        // Ensure nextTokenId is initialized to 1
        nextTokenId = 1;
        
        claimStartDate = block.timestamp;
        claimFinishDate = block.timestamp + 365 days;
        active = true;

        console.log("NFTMintReward: Set claim start date:", claimStartDate);
        console.log("NFTMintReward: Set claim finish date:", claimFinishDate);
        console.log("NFTMintReward: Set active:", active);
        console.log("NFTMintReward: _initialize completed");
    }

    /**
     * @dev Internal function to set ERC721 name and symbol for clones
     * Since the constructor values don't affect clones, we need to set these values
     * in clone storage directly
     */
    function _initializeERC721(string memory _name, string memory _symbol) internal {
        // In ERC721, name and symbol are stored as private state variables
        // We need to write to those storage slots directly

        // Get the storage slot for name
        bytes32 nameSlot = keccak256(abi.encode("eip1967.proxy.name"));
        bytes32 symbolSlot = keccak256(abi.encode("eip1967.proxy.symbol"));

        assembly {
            // Store the name and symbol in their respective slots
            sstore(nameSlot, _name)
            sstore(symbolSlot, _symbol)
        }
    }

    /**
     * @dev Override name() to return config name if the ERC721 _name is empty
     */
    function name() public view override returns (string memory) {
        string memory erc721Name = super.name();
        if (bytes(erc721Name).length == 0) {
            return config.name;
        }
        return erc721Name;
    }

    /**
     * @dev Override symbol() to return config symbol if the ERC721 _symbol is empty
     */
    function symbol() public view override returns (string memory) {
        string memory erc721Symbol = super.symbol();
        if (bytes(erc721Symbol).length == 0) {
            return config.symbol;
        }
        return erc721Symbol;
    }

    function getRewardType() public pure override returns (string memory) {
        return "NFT_MINT";
    }

    function validateConfig(
        bytes memory configData
    ) public pure override returns (bool) {
        return configData.length >= 7 * 32;
    }

    function claim(address user) external override whenActive nonReentrant {
        console.log("NFTMintReward: claim called for user", user);
        console.log("NFTMintReward: Message sender", msg.sender);
        console.log("NFTMintReward: Controller", controller);
        console.log("NFTMintReward: Owner", owner());

        bool isAuthorized = msg.sender == owner() || msg.sender == controller;
        console.log("NFTMintReward: Is authorized?", isAuthorized);
        require(isAuthorized, "Not authorized");

        console.log("NFTMintReward: Checking if user can claim");
        console.log("NFTMintReward: Active?", active);
        console.log("NFTMintReward: Has claimed?", hasClaimed[user]);
        console.log("NFTMintReward: Current time", block.timestamp);
        console.log("NFTMintReward: Claim start date", claimStartDate);
        console.log("NFTMintReward: Claim finish date", claimFinishDate);

        bool userCanClaim = canClaim(user);
        console.log("NFTMintReward: Can user claim?", userCanClaim);
        require(userCanClaim, "Cannot claim");

        uint256 tokenId;
        if (config.isRandomized) {
            console.log("NFTMintReward: Using randomized distribution");
            console.log(
                "NFTMintReward: Remaining token IDs count",
                remainingTokenIds.length
            );
            require(remainingTokenIds.length > 0, "No tokens left");

            uint256 randomIndex = _getRandomIndex(
                remainingTokenIds.length,
                user
            );
            console.log("NFTMintReward: Selected random index", randomIndex);

            tokenId = remainingTokenIds[randomIndex];
            console.log("NFTMintReward: Selected token ID", tokenId);

            // Remove token from available IDs
            remainingTokenIds[randomIndex] = remainingTokenIds[
                remainingTokenIds.length - 1
            ];
            remainingTokenIds.pop();
            console.log("NFTMintReward: Removed token from available IDs");
        } else {
            console.log("NFTMintReward: Using sequential distribution");
            console.log("NFTMintReward: Next token ID", nextTokenId);
            console.log("NFTMintReward: Max supply", config.maxSupply);

            require(nextTokenId <= config.maxSupply, "Max supply reached");
            tokenId = nextTokenId++;
            console.log("NFTMintReward: Assigned token ID", tokenId);
        }

        console.log("NFTMintReward: Minting token", tokenId, "to user", user);
        _safeMint(user, tokenId);
        console.log("NFTMintReward: Token minted successfully");

        userTokens[user] = tokenId;
        _trackClaim(user);
        console.log("NFTMintReward: Claim completed successfully");
    }

    function canClaim(address user) public view override returns (bool) {
        // First check the base conditions (active, not claimed, within time window)
        bool baseConditions = super.canClaim(user);
        
        // Only calculate available supply if base conditions are met
        if (!baseConditions) {
            return false;
        }
        
        // Safe calculation of available supply
        uint256 availableSupply;
        if (config.isRandomized) {
            availableSupply = remainingTokenIds.length;
        } else {
            // Safe check to prevent underflow
            if (nextTokenId > config.maxSupply) {
                availableSupply = 0;
            } else {
                availableSupply = config.maxSupply - (nextTokenId - 1);
            }
        }

        // Don't log in view functions as they might be called internally
        // This is a special case since we're debugging
        if (msg.sender == address(0)) {
            console.log("NFTMintReward: canClaim check for", user);
            console.log("NFTMintReward: Available supply", availableSupply);
            console.log("NFTMintReward: Base can claim", baseConditions);
        }

        return baseConditions && availableSupply > 0;
    }

    function setMetadataConfig(
        string calldata baseURIValue,
        string calldata _name,
        string calldata _symbol,
        string calldata _description,
        address _royaltyRecipient,
        uint96 _royaltyPercentage
    ) external onlyOwner {
        baseURI = baseURIValue;
        config.name = _name;
        config.symbol = _symbol;
        config.description = _description;
        
        // Also update ERC721 name and symbol
        _initializeERC721(_name, _symbol);

        if (_royaltyRecipient != address(0)) {
            config.royaltyRecipient = _royaltyRecipient;
            config.royaltyPercentage = _royaltyPercentage;
            _setDefaultRoyalty(_royaltyRecipient, _royaltyPercentage);
        }
    }

    function setupRandomizedDistribution(bool isRandomized) external onlyOwner {
        require(totalClaims == 0, "Tokens already minted");

        if (isRandomized && !config.isRandomized) {
            for (uint256 i = nextTokenId; i <= config.maxSupply; i++) {
                remainingTokenIds.push(i);
            }
        } else if (!isRandomized && config.isRandomized) {
            delete remainingTokenIds;
            nextTokenId = totalClaims + 1;
        }

        config.isRandomized = isRandomized;
    }

    function getAvailableSupply() external view returns (uint256) {
        if (config.isRandomized) {
            return remainingTokenIds.length;
        } else {
            // Safe check to prevent underflow
            if (nextTokenId > config.maxSupply) {
                return 0;
            }
            return config.maxSupply - (nextTokenId - 1);
        }
    }

    function getMintedCount() external view returns (uint256) {
        return totalClaims;
    }

    function getRemainingTokenIds() external view returns (uint256[] memory) {
        return remainingTokenIds;
    }

    function hasUserClaimed(address user) external view returns (bool) {
        return hasClaimed[user];
    }

    function isRandomizedDistribution() external view returns (bool) {
        return config.isRandomized;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) public view override returns (address, uint256) {
        return (
            config.royaltyRecipient,
            (salePrice * config.royaltyPercentage) / 10000
        );
    }

    function _getRandomIndex(
        uint256 max,
        address user
    ) internal view returns (uint256) {
        uint256 randomValue = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    blockhash(block.number - 1),
                    user,
                    totalClaims
                )
            )
        );
        return randomValue % max;
    }

    function getConfig()
        external
        view
        returns (
            string memory name,
            string memory symbol,
            string memory _description,
            uint256 maxSupply,
            uint256 _claimFinishDate
        )
    {
        return (
            config.name,
            config.symbol,
            config.description,
            config.maxSupply,
            claimFinishDate
        );
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721Enumerable, ERC2981) returns (bool) {
        return
            ERC721Enumerable.supportsInterface(interfaceId) ||
            ERC2981.supportsInterface(interfaceId);
    }

    // Add method to manually update controller if needed
    function _setController(address _controller) internal override {
        console.log(
            "NFTMintReward: Setting controller from",
            controller,
            "to",
            _controller
        );
        controller = _controller;
    }

    // Add public method to set controller
    function setController(address _controller) external onlyOwner {
        console.log(
            "NFTMintReward: Manually setting controller from",
            controller,
            "to",
            _controller
        );
        controller = _controller;
    }

    // Add reset method to fix broken state
    function resetNextTokenId(uint256 _nextTokenId) external onlyOwner {
        require(_nextTokenId > 0, "Next token ID must be greater than 0");
        require(_nextTokenId <= config.maxSupply, "Next token ID exceeds max supply");
        nextTokenId = _nextTokenId;
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
            address controllerAddr,
            address ownerAddr,
            bool isRandomized,
            uint256 availableSupply,
            uint256 maxSupply,
            uint256 nextId
        )
    {
        uint256 available;
        if (config.isRandomized) {
            available = remainingTokenIds.length;
        } else {
            // Safe check to prevent underflow
            if (nextTokenId > config.maxSupply) {
                available = 0;
            } else {
                available = config.maxSupply - (nextTokenId - 1);
            }
        }

        return (
            _initialized,
            active,
            totalClaims,
            claimStartDate,
            claimFinishDate,
            hasClaimed[user],
            controller,
            owner(),
            config.isRandomized,
            available,
            config.maxSupply,
            nextTokenId
        );
    }
}