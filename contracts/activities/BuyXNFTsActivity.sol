// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "../BaseActivity.sol";

/**
 * @title BuyXNFTs
 * @notice Activity implementation for tracking NFT purchases
 * @dev Checks if a user has purchased the required number of NFTs
 */
contract BuyXNFTs is BaseActivity {
    // Config structure for NFT purchases
    struct Config {
        address contractAddress; // NFT collection address
        uint256 requiredBuyCount; // Number of NFTs needed to buy
        uint256 startDate; // Start of tracking period
        uint256 endDate; // End of tracking period
        uint256 minPurchaseAmount; // Minimum purchase amount (if applicable)
    }

    // Config instance
    Config private _config;

    // Exposed config values
    address public contractAddress;
    uint256 public requiredBuyCount;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public minPurchaseAmount;

    // Purchase tracking
    mapping(address => uint256) public purchaseCount;

    // Events
    event PurchaseVerified(
        address indexed user,
        uint256 count,
        uint256 timestamp
    );

    constructor() BaseActivity() {
        // Empty constructor is fine since it's just calling the parent
    }

    /**
     * @dev Internal initialization function for BuyXNFTs
     * @param config Configuration data for the activity
     */
    function _initialize(bytes memory config) internal override {
        console.log("BuyXNFTs: Initializing");

        // Decode config data
        (
            address _contractAddress,
            uint256 _requiredBuyCount,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _minPurchaseAmount
        ) = abi.decode(config, (address, uint256, uint256, uint256, uint256));

        console.log("BuyXNFTs: Decoded config with NFT contract:", _contractAddress);
        console.log("BuyXNFTs: Required buy count:", _requiredBuyCount);
        console.log("BuyXNFTs: Start date:", _startDate);
        console.log("BuyXNFTs: End date:", _endDate);
        console.log("BuyXNFTs: Minimum purchase amount:", _minPurchaseAmount);

        // Store config values
        contractAddress = _contractAddress;
        requiredBuyCount = _requiredBuyCount;
        startDate = _startDate;
        endDate = _endDate;
        minPurchaseAmount = _minPurchaseAmount;

        // Store in struct for internal use
        _config.contractAddress = _contractAddress;
        _config.requiredBuyCount = _requiredBuyCount;
        _config.startDate = _startDate;
        _config.endDate = _endDate;
        _config.minPurchaseAmount = _minPurchaseAmount;

        console.log("BuyXNFTs: Initialization complete");
    }

    /**
     * @notice Get the activity type identifier
     * @return Type identifier "BUY_X_NFTS"
     */
    function getActivityType() public pure override returns (string memory) {
        return "BUY_X_NFTS";
    }

    /**
     * @notice Validate configuration data
     * @param config Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(
        bytes memory config
    ) public pure override returns (bool) {
        // Check minimum required length for our parameters
        if (config.length < 5 * 32) {
            // Simplified check - actual needs vary by data types
            return false;
        }

        // Basic validation of encoded data structure
        return true;
    }

    /**
     * @notice Process a purchase verification
     * @param user Address of the user
     * @param count Number of NFTs purchased
     * @param proof Verification proof (can be empty for direct verification)
     */
    function verifyPurchase(
        address user,
        uint256 count,
        bytes calldata proof
    ) external {
        console.log("BuyXNFTs: Verifying purchase for user", user);
        console.log("BuyXNFTs: Purchase count", count);
        
        require(
            msg.sender == owner() || msg.sender == signingKey,
            "Unauthorized"
        );

        // Convert to arrays for internal processing
        address[] memory users = new address[](1);
        users[0] = user;

        uint256[] memory counts = new uint256[](1);
        counts[0] = count;

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        // Use internal array method
        _verifyPurchasesForUsers(users, counts, proofs);
        
        console.log("BuyXNFTs: Purchase verification complete");
    }

    /**
     * @dev Internal method to verify purchases for multiple users
     * @param users Array of user addresses
     * @param counts Array of purchase counts
     * @param proofs Array of proofs
     */
    function _verifyPurchasesForUsers(
        address[] memory users,
        uint256[] memory counts,
        bytes[] memory proofs
    ) private {
        require(
            users.length == counts.length && users.length == proofs.length,
            "Array length mismatch"
        );
        
        console.log(
            "BuyXNFTs: Verifying purchases for",
            users.length,
            "users"
        );

        for (uint256 i = 0; i < users.length; i++) {
            console.log("BuyXNFTs: Verifying purchase for user", users[i]);
            console.log("BuyXNFTs: Current purchase count", purchaseCount[users[i]]);
            console.log("BuyXNFTs: Adding purchase count", counts[i]);
            
            // Add the purchase count to the user's total
            purchaseCount[users[i]] += counts[i];

            console.log("BuyXNFTs: New purchase count", purchaseCount[users[i]]);
            emit PurchaseVerified(users[i], counts[i], block.timestamp);
            
            console.log("BuyXNFTs: Purchase verification event emitted");
        }
    }

    /**
     * @notice Process an eligibility proof
     * @param user Address of the user
     * @param proof Eligibility proof from the eligibility service
     */
    function processEligibilityProof(
        address user,
        bytes calldata proof
    ) external {
        console.log("BuyXNFTs: Processing eligibility proof for user", user);

        // Convert to arrays
        address[] memory users = new address[](1);
        users[0] = user;

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        // Use internal array method
        _processEligibilityProofForUsers(users, proofs);
        
        console.log("BuyXNFTs: Eligibility proof processed successfully");
    }

    /**
     * @dev Internal method to process eligibility proofs for multiple users
     * @param users Array of user addresses
     * @param proofs Array of proofs
     */
    function _processEligibilityProofForUsers(
        address[] memory users,
        bytes[] memory proofs
    ) private {
        require(users.length == proofs.length, "Array length mismatch");
        console.log(
            "BuyXNFTs: Processing eligibility proofs for",
            users.length,
            "users"
        );

        for (uint256 i = 0; i < users.length; i++) {
            console.log("BuyXNFTs: Processing proof for user", users[i]);

            bool isValid = _verifyProof(users[i], proofs[i]);
            require(isValid, "Invalid eligibility proof");
            console.log(
                "BuyXNFTs: Proof verified successfully for user",
                users[i]
            );

            emit EligibilityProofVerified(users[i], block.timestamp);
        }
    }

    /**
     * @dev Internal helper method for verifying proofs without recursion
     * @param user Address of the user
     * @param proof Eligibility proof
     * @return Whether the proof is valid
     */
    function _verifyProof(
        address user,
        bytes memory proof
    ) private view returns (bool) {
        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Verifying proof for user", user);
            console.log("BuyXNFTs: Signing key is set to", signingKey);
        }

        // If no signing key is set, any proof is invalid
        if (signingKey == address(0)) {
            if (msg.sender == address(0)) {
                console.log("BuyXNFTs: No signing key set, proof invalid");
            }
            return false;
        }

        // Decode the proof data
        (bytes memory signature, uint256 timestamp) = abi.decode(
            proof,
            (bytes, uint256)
        );

        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Proof timestamp:", timestamp);
            console.log("BuyXNFTs: Current timestamp:", block.timestamp);
            console.log(
                "BuyXNFTs: Proof validity duration:",
                proofValidityDuration
            );
        }

        // Check if the proof has expired
        if (
            proofValidityDuration > 0 &&
            block.timestamp > timestamp + proofValidityDuration
        ) {
            if (msg.sender == address(0)) {
                console.log("BuyXNFTs: Proof has expired");
            }
            return false;
        }

        // Create the message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(user, timestamp, getActivityType()))
            )
        );

        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Message hash created");
        }

        // Recover the signer and verify
        address signer = ECDSA.recover(messageHash, signature);
        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Recovered signer:", signer);
        }

        bool isValid = signer == signingKey;
        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Proof verification result:", isValid);
        }

        return isValid;
    }

    /**
     * @notice Check eligibility for a user
     * @param user Address of the user to check
     * @return Whether the user is eligible
     */
    function checkEligibility(
        address user
    ) public view override returns (bool) {
        // Don't log in view functions as they might be called internally
        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Checking eligibility for user", user);
            console.log("BuyXNFTs: Current time", block.timestamp);
            console.log("BuyXNFTs: Start date", startDate);
            console.log("BuyXNFTs: End date", endDate);
        }

        // Convert to array
        address[] memory users = new address[](1);
        users[0] = user;

        // Use internal array method
        bool[] memory results = _checkEligibilityForUsers(users);

        // Log the result (only when called directly)
        if (msg.sender == address(0)) {
            console.log(
                "BuyXNFTs: Eligibility result for user",
                user,
                ":",
                results[0]
            );
        }

        // Return result for single user
        return results[0];
    }

    /**
     * @dev Internal method to check eligibility for multiple users
     * @param users Array of user addresses
     * @return Array of eligibility results
     */
    function _checkEligibilityForUsers(
        address[] memory users
    ) private view returns (bool[] memory) {
        bool[] memory results = new bool[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];

            if (msg.sender == address(0)) {
                console.log("BuyXNFTs: Checking eligibility for user", user);
                console.log("BuyXNFTs: User purchase count", purchaseCount[user]);
                console.log("BuyXNFTs: Required buy count", requiredBuyCount);
            }

            // Check date constraints
            if (block.timestamp < startDate) {
                if (msg.sender == address(0)) {
                    console.log("BuyXNFTs: Current time is before start date");
                }
                results[i] = false;
                continue;
            }

            if (endDate > 0 && block.timestamp > endDate) {
                if (msg.sender == address(0)) {
                    console.log("BuyXNFTs: Current time is after end date");
                }
                results[i] = false;
                continue;
            }

            // Check if the user has purchased the required number of NFTs
            results[i] = purchaseCount[user] >= requiredBuyCount;
            
            if (msg.sender == address(0)) {
                console.log(
                    "BuyXNFTs: Eligibility check result for user",
                    user,
                    ":",
                    results[i]
                );
            }
        }

        return results;
    }

    /**
     * @notice Verify eligibility proof for a user
     * @param user Address of the user
     * @param proof Eligibility proof from service
     * @return Whether the proof is valid
     */
    function verifyEligibilityProof(
        address user,
        bytes calldata proof
    ) external view override returns (bool) {
        if (msg.sender == address(0)) {
            console.log(
                "BuyXNFTs: Verifying eligibility proof for user",
                user
            );
        }
        bool result = _verifyProof(user, proof);
        if (msg.sender == address(0)) {
            console.log("BuyXNFTs: Verification result:", result);
        }
        return result;
    }

    /**
     * @notice Get config information for the activity
     * @return Contract address
     * @return Required buy count
     * @return Start date
     * @return End date
     * @return Minimum purchase amount
     */
    function getConfig()
        external
        view
        returns (address, uint256, uint256, uint256, uint256)
    {
        return (
            contractAddress,
            requiredBuyCount,
            startDate,
            endDate,
            minPurchaseAmount
        );
    }

    /**
     * @notice Get the user's purchase count
     * @param user Address of the user
     * @return Number of NFTs purchased
     */
    function getUserPurchaseCount(
        address user
    ) external view returns (uint256) {
        return purchaseCount[user];
    }

    /**
     * @notice Debugging helper to check contract state
     */
    function debugActivityState()
        external
        view
        returns (
            address nftContract,
            uint256 activityRequiredBuyCount,
            uint256 activityStartDate,
            uint256 activityEndDate,
            uint256 activityMinPurchaseAmount,
            address activitySigningKey,
            uint256 proofDuration
        )
    {
        return (
            contractAddress,
            requiredBuyCount,
            startDate,
            endDate,
            minPurchaseAmount,
            signingKey,
            proofValidityDuration
        );
    }
}