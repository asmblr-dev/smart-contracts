// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "../BaseActivity.sol";

/**
 * @title BuyXApecoinWorthOfTokens
 * @notice Activity implementation for tracking token purchases made with Apecoin
 * @dev Checks if a user has purchased the required amount of tokens using Apecoin
 */
contract BuyXApecoinWorthOfTokens is BaseActivity {
    // Config structure for token purchases with Apecoin
    struct Config {
        address tokenAddress;      // Token contract address
        address apecoinAddress;    // Apecoin token address
        uint256 requiredAmount;    // Amount of Apecoin needed to spend
        uint256 startDate;         // Start of tracking period
        uint256 endDate;           // End of tracking period
        uint256 minPurchaseAmount; // Minimum purchase amount per transaction (if applicable)
    }

    // Config instance
    Config private _config;

    // Exposed config values
    address public tokenAddress;
    address public apecoinAddress;
    uint256 public requiredAmount;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public minPurchaseAmount;

    // Purchase tracking
    mapping(address => uint256) public apecoinSpent;

    // Events
    event PurchaseVerified(
        address indexed user,
        uint256 apecoinAmount,
        uint256 timestamp
    );

    constructor() BaseActivity() {
        // Empty constructor is fine since it's just calling the parent
    }

    /**
     * @dev Internal initialization function for BuyXApecoinWorthOfTokens
     * @param config Configuration data for the activity
     */
    function _initialize(bytes memory config) internal override {
        console.log("BuyXApecoinWorthOfTokens: Initializing");

        // Decode config data
        (
            address _tokenAddress,
            address _apecoinAddress,
            uint256 _requiredAmount,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _minPurchaseAmount
        ) = abi.decode(config, (address, address, uint256, uint256, uint256, uint256));

        console.log("BuyXApecoinWorthOfTokens: Decoded config");
        console.log("BuyXApecoinWorthOfTokens: Token:", _tokenAddress);
        console.log("BuyXApecoinWorthOfTokens: Apecoin:", _apecoinAddress);
        console.log("BuyXApecoinWorthOfTokens: Required amount:", _requiredAmount);
        console.log("BuyXApecoinWorthOfTokens: Start date:", _startDate);
        console.log("BuyXApecoinWorthOfTokens: End date:", _endDate);
        console.log("BuyXApecoinWorthOfTokens: Minimum purchase amount:", _minPurchaseAmount);

        // Store config values
        tokenAddress = _tokenAddress;
        apecoinAddress = _apecoinAddress;
        requiredAmount = _requiredAmount;
        startDate = _startDate;
        endDate = _endDate;
        minPurchaseAmount = _minPurchaseAmount;

        // Store in struct for internal use
        _config.tokenAddress = _tokenAddress;
        _config.apecoinAddress = _apecoinAddress;
        _config.requiredAmount = _requiredAmount;
        _config.startDate = _startDate;
        _config.endDate = _endDate;
        _config.minPurchaseAmount = _minPurchaseAmount;

        console.log("BuyXApecoinWorthOfTokens: Initialization complete");
    }

    /**
     * @notice Get the activity type identifier
     * @return Type identifier "BUY_X_APECOIN_WORTH_OF_TOKENS"
     */
    function getActivityType() public pure override returns (string memory) {
        return "BUY_X_APECOIN_WORTH_OF_TOKENS";
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
        if (config.length < 6 * 32) {
            // Simplified check - actual needs vary by data types
            return false;
        }

        // Basic validation of encoded data structure
        return true;
    }

    /**
     * @notice Process a purchase verification
     * @param user Address of the user
     * @param apecoinAmount Amount of Apecoin spent on tokens
     * @param proof Verification proof (can be empty for direct verification)
     */
    function verifyPurchase(
        address user,
        uint256 apecoinAmount,
        bytes calldata proof
    ) external {
        console.log("BuyXApecoinWorthOfTokens: Verifying purchase for user", user);
        console.log("BuyXApecoinWorthOfTokens: Apecoin amount spent", apecoinAmount);
        
        require(
            msg.sender == owner() || msg.sender == signingKey,
            "Unauthorized"
        );

        // Ensure minimum purchase amount if configured
        if (minPurchaseAmount > 0) {
            require(apecoinAmount >= minPurchaseAmount, "Amount below minimum");
        }

        // Convert to arrays for internal processing
        address[] memory users = new address[](1);
        users[0] = user;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = apecoinAmount;

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        // Use internal array method
        _verifyPurchasesForUsers(users, amounts, proofs);
        
        console.log("BuyXApecoinWorthOfTokens: Purchase verification complete");
    }

    /**
     * @dev Internal method to verify purchases for multiple users
     * @param users Array of user addresses
     * @param apecoinAmounts Array of Apecoin purchase amounts
     * @param proofs Array of proofs
     */
    function _verifyPurchasesForUsers(
        address[] memory users,
        uint256[] memory apecoinAmounts,
        bytes[] memory proofs
    ) private {
        require(
            users.length == apecoinAmounts.length && users.length == proofs.length,
            "Array length mismatch"
        );
        
        console.log(
            "BuyXApecoinWorthOfTokens: Verifying purchases for",
            users.length,
            "users"
        );

        for (uint256 i = 0; i < users.length; i++) {
            console.log("BuyXApecoinWorthOfTokens: Verifying purchase for user", users[i]);
            console.log("BuyXApecoinWorthOfTokens: Current Apecoin spent", apecoinSpent[users[i]]);
            console.log("BuyXApecoinWorthOfTokens: Adding Apecoin spent", apecoinAmounts[i]);
            
            // Add the Apecoin amount to the user's total
            apecoinSpent[users[i]] += apecoinAmounts[i];

            console.log("BuyXApecoinWorthOfTokens: New Apecoin spent", apecoinSpent[users[i]]);
            emit PurchaseVerified(users[i], apecoinAmounts[i], block.timestamp);
            
            console.log("BuyXApecoinWorthOfTokens: Purchase verification event emitted");
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
        console.log("BuyXApecoinWorthOfTokens: Processing eligibility proof for user", user);

        // Convert to arrays
        address[] memory users = new address[](1);
        users[0] = user;

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        // Use internal array method
        _processEligibilityProofForUsers(users, proofs);
        
        console.log("BuyXApecoinWorthOfTokens: Eligibility proof processed successfully");
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
            "BuyXApecoinWorthOfTokens: Processing eligibility proofs for",
            users.length,
            "users"
        );

        for (uint256 i = 0; i < users.length; i++) {
            console.log("BuyXApecoinWorthOfTokens: Processing proof for user", users[i]);

            bool isValid = _verifyProof(users[i], proofs[i]);
            require(isValid, "Invalid eligibility proof");
            console.log(
                "BuyXApecoinWorthOfTokens: Proof verified successfully for user",
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
            console.log("BuyXApecoinWorthOfTokens: Verifying proof for user", user);
            console.log("BuyXApecoinWorthOfTokens: Signing key is set to", signingKey);
        }

        // If no signing key is set, any proof is invalid
        if (signingKey == address(0)) {
            if (msg.sender == address(0)) {
                console.log("BuyXApecoinWorthOfTokens: No signing key set, proof invalid");
            }
            return false;
        }

        // Decode the proof data
        (bytes memory signature, uint256 timestamp) = abi.decode(
            proof,
            (bytes, uint256)
        );

        if (msg.sender == address(0)) {
            console.log("BuyXApecoinWorthOfTokens: Proof timestamp:", timestamp);
            console.log("BuyXApecoinWorthOfTokens: Current timestamp:", block.timestamp);
            console.log(
                "BuyXApecoinWorthOfTokens: Proof validity duration:",
                proofValidityDuration
            );
        }

        // Check if the proof has expired
        if (
            proofValidityDuration > 0 &&
            block.timestamp > timestamp + proofValidityDuration
        ) {
            if (msg.sender == address(0)) {
                console.log("BuyXApecoinWorthOfTokens: Proof has expired");
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
            console.log("BuyXApecoinWorthOfTokens: Message hash created");
        }

        // Recover the signer and verify
        address signer = ECDSA.recover(messageHash, signature);
        if (msg.sender == address(0)) {
            console.log("BuyXApecoinWorthOfTokens: Recovered signer:", signer);
        }

        bool isValid = signer == signingKey;
        if (msg.sender == address(0)) {
            console.log("BuyXApecoinWorthOfTokens: Proof verification result:", isValid);
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
            console.log("BuyXApecoinWorthOfTokens: Checking eligibility for user", user);
            console.log("BuyXApecoinWorthOfTokens: Current time", block.timestamp);
            console.log("BuyXApecoinWorthOfTokens: Start date", startDate);
            console.log("BuyXApecoinWorthOfTokens: End date", endDate);
        }

        // Convert to array
        address[] memory users = new address[](1);
        users[0] = user;

        // Use internal array method
        bool[] memory results = _checkEligibilityForUsers(users);

        // Log the result (only when called directly)
        if (msg.sender == address(0)) {
            console.log(
                "BuyXApecoinWorthOfTokens: Eligibility result for user",
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
                console.log("BuyXApecoinWorthOfTokens: Checking eligibility for user", user);
                console.log("BuyXApecoinWorthOfTokens: User Apecoin spent", apecoinSpent[user]);
                console.log("BuyXApecoinWorthOfTokens: Required amount", requiredAmount);
            }

            // Check date constraints
            if (block.timestamp < startDate) {
                if (msg.sender == address(0)) {
                    console.log("BuyXApecoinWorthOfTokens: Current time is before start date");
                }
                results[i] = false;
                continue;
            }

            if (endDate > 0 && block.timestamp > endDate) {
                if (msg.sender == address(0)) {
                    console.log("BuyXApecoinWorthOfTokens: Current time is after end date");
                }
                results[i] = false;
                continue;
            }

            // Check if the user has spent the required amount of Apecoin
            results[i] = apecoinSpent[user] >= requiredAmount;
            
            if (msg.sender == address(0)) {
                console.log(
                    "BuyXApecoinWorthOfTokens: Eligibility check result for user",
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
                "BuyXApecoinWorthOfTokens: Verifying eligibility proof for user",
                user
            );
        }
        bool result = _verifyProof(user, proof);
        if (msg.sender == address(0)) {
            console.log("BuyXApecoinWorthOfTokens: Verification result:", result);
        }
        return result;
    }

    /**
     * @notice Get config information for the activity
     * @return Token address
     * @return Apecoin address
     * @return Required Apecoin amount
     * @return Start date
     * @return End date
     * @return Minimum purchase amount
     */
    function getConfig()
        external
        view
        returns (address, address, uint256, uint256, uint256, uint256)
    {
        return (
            tokenAddress,
            apecoinAddress,
            requiredAmount,
            startDate,
            endDate,
            minPurchaseAmount
        );
    }

    /**
     * @notice Get the user's Apecoin spent
     * @param user Address of the user
     * @return Amount of Apecoin spent by the user
     */
    function getUserApecoinSpent(
        address user
    ) external view returns (uint256) {
        return apecoinSpent[user];
    }

    /**
     * @notice Debugging helper to check contract state
     */
    function debugActivityState()
        external
        view
        returns (
            address activityTokenAddress,
            address activityApecoinAddress,
            uint256 activityRequiredAmount,
            uint256 activityStartDate,
            uint256 activityEndDate,
            uint256 activityMinPurchaseAmount,
            address activitySigningKey,
            uint256 proofDuration
        )
    {
        return (
            tokenAddress,
            apecoinAddress,
            requiredAmount,
            startDate,
            endDate,
            minPurchaseAmount,
            signingKey,
            proofValidityDuration
        );
    }
}