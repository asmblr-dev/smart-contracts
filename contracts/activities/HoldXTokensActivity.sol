// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "../BaseActivity.sol";

/**
 * @title HoldXTokens
 * @notice Activity implementation for holding specific tokens
 * @dev Checks if a user holds the required amount of tokens from specified addresses
 */
contract HoldXTokens is BaseActivity {
    // Config structure for holding tokens
    struct Config {
        address[] tokenAddresses;
        mapping(address => uint256) requiredAmounts;
        uint256 startDate;
        uint256 endDate;
        uint256 snapshotDate;
    }

    // Config instance
    Config private _config;

    // Exposed config values
    address[] public tokenAddresses;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public snapshotDate;

    constructor() BaseActivity() {
        // Empty constructor is fine since it's just calling the parent
    }

    /**
     * @dev Internal initialization function for HoldXTokens
     * @param config Configuration data for the activity
     */
    function _initialize(bytes memory config) internal override {
        console.log("HoldXTokens: Initializing");

        // Decode config data
        (
            address[] memory _tokenAddresses,
            uint256[] memory _requiredAmounts,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _snapshotDate
        ) = abi.decode(
                config,
                (address[], uint256[], uint256, uint256, uint256)
            );

        // Validate input lengths
        require(
            _tokenAddresses.length == _requiredAmounts.length,
            "Input length mismatch"
        );

        console.log(
            "HoldXTokens: Decoded config with",
            _tokenAddresses.length,
            "token contracts"
        );
        console.log("HoldXTokens: Start date:", _startDate);
        console.log("HoldXTokens: End date:", _endDate);
        console.log("HoldXTokens: Snapshot date:", _snapshotDate);

        // Store config values
        tokenAddresses = _tokenAddresses;
        startDate = _startDate;
        endDate = _endDate;
        snapshotDate = _snapshotDate;

        // Store token addresses and required amounts
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            _config.tokenAddresses.push(_tokenAddresses[i]);
            _config.requiredAmounts[_tokenAddresses[i]] = _requiredAmounts[i];
            console.log(
                "HoldXTokens: Added token contract",
                _tokenAddresses[i],
                "with required amount",
                _requiredAmounts[i]
            );
        }

        console.log("HoldXTokens: Initialization complete");
    }

    /**
     * @notice Get the activity type identifier
     * @return Type identifier "HOLD_X_TOKENS"
     */
    function getActivityType() public pure override returns (string memory) {
        return "HOLD_X_TOKENS";
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
     * @notice Process an eligibility proof
     * @param user Address of the user
     * @param proof Eligibility proof from the eligibility service
     */
    function processEligibilityProof(
        address user,
        bytes calldata proof
    ) external {
        console.log("HoldXTokens: Processing eligibility proof for user", user);

        // Convert single address to array
        address[] memory users = new address[](1);
        users[0] = user;

        // Create array for the proof
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        // Process using internal array-based method
        _processEligibilityProofForUsers(users, proofs);

        console.log("HoldXTokens: Eligibility proof processed successfully");
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
        console.log("HoldXTokens: Verifying proof for user", user);
        console.log("HoldXTokens: Signing key is set to", signingKey);

        // If no signing key is set, any proof is invalid
        if (signingKey == address(0)) {
            console.log("HoldXTokens: No signing key set, proof invalid");
            return false;
        }

        // Decode the proof data
        (bytes memory signature, uint256 timestamp) = abi.decode(
            proof,
            (bytes, uint256)
        );

        console.log("HoldXTokens: Proof timestamp:", timestamp);
        console.log("HoldXTokens: Current timestamp:", block.timestamp);
        console.log(
            "HoldXTokens: Proof validity duration:",
            proofValidityDuration
        );

        // Check if the proof has expired
        if (
            proofValidityDuration > 0 &&
            block.timestamp > timestamp + proofValidityDuration
        ) {
            console.log("HoldXTokens: Proof has expired");
            return false;
        }

        // Create the message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(user, timestamp, getActivityType()))
            )
        );

        console.log("HoldXTokens: Message hash created");

        // Recover the signer and verify
        address signer = ECDSA.recover(messageHash, signature);
        console.log("HoldXTokens: Recovered signer:", signer);

        bool isValid = signer == signingKey;
        console.log("HoldXTokens: Proof verification result:", isValid);

        return isValid;
    }

    /**
     * @dev Internal method to process eligibility proofs for multiple users
     * @param users Array of user addresses
     * @param proofs Array of proofs corresponding to users
     */
    function _processEligibilityProofForUsers(
        address[] memory users,
        bytes[] memory proofs
    ) private {
        require(users.length == proofs.length, "Array length mismatch");
        console.log(
            "HoldXTokens: Processing eligibility proofs for",
            users.length,
            "users"
        );

        for (uint256 i = 0; i < users.length; i++) {
            console.log("HoldXTokens: Processing proof for user", users[i]);

            bool isValid = _verifyProof(users[i], proofs[i]);
            require(isValid, "Invalid eligibility proof");
            console.log(
                "HoldXTokens: Proof verified successfully for user",
                users[i]
            );

            emit EligibilityProofVerified(users[i], block.timestamp);
        }
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
            console.log("HoldXTokens: Checking eligibility for user", user);
            console.log("HoldXTokens: Current time", block.timestamp);
            console.log("HoldXTokens: Start date", startDate);
            console.log("HoldXTokens: End date", endDate);
        }

        // Convert to array
        address[] memory users = new address[](1);
        users[0] = user;

        // Use internal array method
        bool[] memory results = _checkEligibilityForUsers(users);

        // Log the result (only when called directly)
        if (msg.sender == address(0)) {
            console.log(
                "HoldXTokens: Eligibility result for user",
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
                console.log("HoldXTokens: Checking eligibility for user", user);
            }

            // Check date constraints
            if (block.timestamp < startDate) {
                if (msg.sender == address(0)) {
                    console.log("HoldXTokens: Current time is before start date");
                }
                results[i] = false;
                continue;
            }

            if (endDate > 0 && block.timestamp > endDate) {
                if (msg.sender == address(0)) {
                    console.log("HoldXTokens: Current time is after end date");
                }
                results[i] = false;
                continue;
            }

            // Assume eligible until proven otherwise
            results[i] = true;
            if (msg.sender == address(0)) {
                console.log("HoldXTokens: Time window check passed");
            }

            // Check token holdings for each contract
            for (uint256 j = 0; j < tokenAddresses.length; j++) {
                address tokenAddress = tokenAddresses[j];
                uint256 requiredAmount = _config.requiredAmounts[
                    tokenAddress
                ];

                if (msg.sender == address(0)) {
                    console.log(
                        "HoldXTokens: Checking token",
                        tokenAddress
                    );
                    console.log("HoldXTokens: Required amount", requiredAmount);
                }

                // For snapshot-based eligibility
                if (snapshotDate > 0) {
                    if (msg.sender == address(0)) {
                        console.log(
                            "HoldXTokens: Using snapshot date",
                            snapshotDate
                        );
                        console.log(
                            "HoldXTokens: Snapshot-based eligibility requires external verification"
                        );
                    }
                    // Snapshot-based eligibility would require external data
                    // This is handled by the eligibility service via proofs
                    results[i] = false;
                    break;
                }

                // For on-chain eligibility
                if (requiredAmount > 0) {
                    try IERC20(tokenAddress).balanceOf(user) returns (
                        uint256 balance
                    ) {
                        if (msg.sender == address(0)) {
                            console.log("HoldXTokens: User balance", balance);
                        }

                        if (balance < requiredAmount) {
                            if (msg.sender == address(0)) {
                                console.log("HoldXTokens: Insufficient balance");
                            }
                            results[i] = false;
                            break;
                        }
                    } catch {
                        if (msg.sender == address(0)) {
                            console.log("HoldXTokens: Failed to check balance");
                        }
                        results[i] = false;
                        break;
                    }
                }
            }

            if (msg.sender == address(0)) {
                console.log(
                    "HoldXTokens: Eligibility check result for user",
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
                "HoldXTokens: Verifying eligibility proof for user",
                user
            );
        }
        bool result = _verifyProof(user, proof);
        if (msg.sender == address(0)) {
            console.log("HoldXTokens: Verification result:", result);
        }
        return result;
    }

    /**
     * @dev Internal method to verify eligibility proofs for multiple users
     * @param users Array of user addresses
     * @param proofs Array of proofs corresponding to users
     * @return Array of verification results
     */
    function _verifyEligibilityProofForUsers(
        address[] memory users,
        bytes[] memory proofs
    ) private view returns (bool[] memory) {
        require(users.length == proofs.length, "Array length mismatch");
        if (msg.sender == address(0)) {
            console.log(
                "HoldXTokens: Verifying eligibility proofs for",
                users.length,
                "users"
            );
        }

        bool[] memory results = new bool[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            if (msg.sender == address(0)) {
                console.log("HoldXTokens: Verifying proof for user", users[i]);
            }
            // Use the private helper method instead of calling the external function
            results[i] = _verifyProof(users[i], proofs[i]);
            if (msg.sender == address(0)) {
                console.log(
                    "HoldXTokens: Verification result for user",
                    users[i],
                    ":",
                    results[i]
                );
            }
        }

        return results;
    }

    /**
     * @notice Get config information for the activity
     * @return Array of token addresses
     * @return Start date
     * @return End date
     * @return Snapshot date
     */
    function getConfig()
        external
        view
        returns (address[] memory, uint256, uint256, uint256)
    {
        return (
            tokenAddresses,
            startDate,
            endDate,
            snapshotDate
        );
    }

    /**
     * @notice Get required amount for a specific token
     * @param tokenAddress Address of the token
     * @return Required amount of tokens to hold
     */
    function getRequiredAmount(
        address tokenAddress
    ) external view returns (uint256) {
        return _config.requiredAmounts[tokenAddress];
    }

    /**
     * @notice Debugging helper to check contract state
     */
    function debugActivityState()
        external
        view
        returns (
            address[] memory tokenContracts,
            uint256 activityStartDate,
            uint256 activityEndDate,
            uint256 activitySnapshotDate,
            address activitySigningKey,
            uint256 proofDuration
        )
    {
        return (
            tokenAddresses,
            startDate,
            endDate,
            snapshotDate,
            signingKey,
            proofValidityDuration
        );
    }
}