// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "hardhat/console.sol";
import "./interfaces/IActivity.sol";
import "./interfaces/IReward.sol";

/**
 * @title Tim3cap
 * @notice Core contract to manage activities and rewards for the Tim3cap platform
 * @dev Coordinates between activity contracts for eligibility and reward contracts for distribution
 */
contract Tim3cap is Ownable, Pausable {
    // Contract references
    IActivity public activity;
    IReward public reward;

    // Discount configuration
    bytes32 public discountMerkleRoot;

    // Eligibility service configuration
    struct EligibilityConfig {
        bool enabled;
        address signingKey;
        uint256 proofValidityDuration;
        bool requireProofForAllClaims;
    }

    EligibilityConfig public eligibilityConfig;

    // Fee handling
    address public feeRecipient;
    uint256 public feePercentage; // In basis points (e.g. 250 = 2.5%)
    bool public feesEnabled;
    address public affiliateAddress;

    // Events
    event Claimed(address indexed user, uint256 timestamp);
    event ClaimWithDiscount(
        address indexed user,
        uint256 discountRate,
        uint256 timestamp
    );
    event DiscountMerkleRootUpdated(bytes32 newRoot);
    event ActivityAndRewardUpdated(address activity, address reward);
    
    // Constants
    uint256 public constant MAX_FEE_PERCENTAGE = 1000; // 10% maximum fee

    // Flag to prevent reinitialization
    bool private _initialized;

    /**
     * @notice Constructor for implementation contract
     */
    constructor() {
        _initialized = true;
    }

    /**
     * @notice Initialize the contract with activity and reward implementations
     * @param _activity Address of the activity contract
     * @param _reward Address of the reward contract
     * @param _owner Address of the contract owner
     * @param _eligibilityConfig Eligibility service configuration
     * @param _feeRecipient Address to receive fees
     * @param _feePercentage Fee percentage in basis points
     * @param _feesEnabled Whether fees are enabled
     * @param _affiliate Affiliate address for this contract
     */
    function initialize(
        address _activity,
        address _reward,
        address _owner,
        EligibilityConfig memory _eligibilityConfig,
        address _feeRecipient,
        uint256 _feePercentage,
        bool _feesEnabled,
        address _affiliate
    ) external {
        console.log("Tim3cap: Initializing");
        require(!_initialized, "Already initialized");
        require(_activity != address(0), "Invalid activity address");
        require(_reward != address(0), "Invalid reward address");
        require(
            _feePercentage <= MAX_FEE_PERCENTAGE,
            "Fee percentage too high"
        );

        _transferOwnership(_owner);
        activity = IActivity(_activity);
        reward = IReward(_reward);
        eligibilityConfig = _eligibilityConfig;
        feeRecipient = _feeRecipient;
        feePercentage = _feePercentage;
        feesEnabled = _feesEnabled;
        affiliateAddress = _affiliate;

        _initialized = true;
        console.log("Tim3cap: Initialization complete");
    }

    /**
     * @notice Claim rewards if eligible
     * @param proof Eligibility proof from the eligibility service
     * @param discountRate Discount rate (in basis points) if applicable
     * @param discountProof Merkle proof for the discount if applicable
     */
    function claim(
        bytes calldata proof,
        uint256 discountRate,
        bytes32[] calldata discountProof
    ) external whenNotPaused {
        console.log("Tim3cap: Claim started for user", msg.sender);
        
        // Create array with single user
        address[] memory users = new address[](1);
        users[0] = msg.sender;

        // Create array with single proof
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        // Verify eligibility for the user
        console.log("Tim3cap: Checking eligibility");
        bool isEligible = _checkEligibilityForUsers(users, proofs)[0];
        console.log("Tim3cap: Eligibility result:", isEligible);
        
        require(isEligible, "Not eligible");
        console.log("Tim3cap: User is eligible");

        // Process claim with optional discount
        console.log("Tim3cap: Processing fee");
        bool feeProcessed;
        
        if (discountRate > 0 && discountProof.length > 0) {
            // Process the claim with the discount
            console.log("Tim3cap: Using discount rate", discountRate);
            feeProcessed = reward.processFeeWithDiscount(
                msg.sender,
                discountRate,
                discountProof
            );
            console.log("Tim3cap: Fee with discount result:", feeProcessed);
            
            if (feeProcessed) {
                emit ClaimWithDiscount(msg.sender, discountRate, block.timestamp);
            }
        } else {
            // Process the claim without a discount
            console.log("Tim3cap: Standard fee processing");
            feeProcessed = reward.processFeeOnClaim(msg.sender);
            console.log("Tim3cap: Standard fee result:", feeProcessed);
            
            if (feeProcessed) {
                emit Claimed(msg.sender, block.timestamp);
            }
        }
        
        require(feeProcessed, "Fee processing failed");
        console.log("Tim3cap: Fee processed successfully");

        // Distribute the reward
        console.log("Tim3cap: Calling reward.claim");
        reward.claim(msg.sender);
        console.log("Tim3cap: Claim completed successfully");
    }

    /**
     * @dev Internal method to check eligibility for multiple users
     * @param users Array of user addresses
     * @param proofs Array of proofs corresponding to users
     * @return Array of eligibility results
     */
    function _checkEligibilityForUsers(
        address[] memory users,
        bytes[] memory proofs
    ) internal view returns (bool[] memory) {
        require(users.length == proofs.length, "Array length mismatch");
        console.log("Tim3cap: Checking eligibility for", users.length, "users");

        bool[] memory results = new bool[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            bytes memory proof = proofs[i];
            
            console.log("Tim3cap: Checking user", user);
            console.log("Tim3cap: Eligibility enabled:", eligibilityConfig.enabled);

            // If eligibility service is disabled, fall back to on-chain check
            if (!eligibilityConfig.enabled) {
                console.log("Tim3cap: Using on-chain eligibility check");
                results[i] = activity.checkEligibility(user);
                console.log("Tim3cap: On-chain eligibility result:", results[i]);
                continue;
            }

            // If proof is not required for all claims, check on-chain eligibility first
            if (
                !eligibilityConfig.requireProofForAllClaims &&
                activity.checkEligibility(user)
            ) {
                console.log("Tim3cap: On-chain check passed, skipping proof");
                results[i] = true;
                continue;
            }

            // Otherwise, verify the eligibility proof
            console.log("Tim3cap: Verifying eligibility proof");
            results[i] = activity.verifyEligibilityProof(user, proof);
            console.log("Tim3cap: Proof verification result:", results[i]);
        }

        return results;
    }

    /**
     * @notice Update the activity and reward contracts
     * @param _activity New activity contract address
     * @param _reward New reward contract address
     */
    function setActivityAndReward(
        address _activity,
        address _reward
    ) external onlyOwner {
        require(_activity != address(0), "Invalid activity address");
        require(_reward != address(0), "Invalid reward address");

        activity = IActivity(_activity);
        reward = IReward(_reward);

        emit ActivityAndRewardUpdated(_activity, _reward);
    }

    /**
     * @notice Update the discount Merkle root
     * @param newRoot New Merkle root for discount verification
     */
    function setDiscountMerkleRoot(bytes32 newRoot) external onlyOwner {
        discountMerkleRoot = newRoot;
        emit DiscountMerkleRootUpdated(newRoot);
    }

    /**
     * @notice Update eligibility service configuration
     * @param _config New eligibility service configuration
     */
    function setEligibilityConfig(
        EligibilityConfig memory _config
    ) external onlyOwner {
        eligibilityConfig = _config;
    }

    /**
     * @notice Update fee configuration
     * @param _feeRecipient Address to receive fees
     * @param _feePercentage Fee percentage in basis points
     * @param _feesEnabled Whether fees are enabled
     */
    function setFeeConfig(
        address _feeRecipient,
        uint256 _feePercentage,
        bool _feesEnabled
    ) external onlyOwner {
        require(
            _feePercentage <= MAX_FEE_PERCENTAGE,
            "Fee percentage too high"
        );

        feeRecipient = _feeRecipient;
        feePercentage = _feePercentage;
        feesEnabled = _feesEnabled;
    }

    /**
     * @notice Update affiliate address
     * @param _affiliate New affiliate address
     */
    function setAffiliate(address _affiliate) external onlyOwner {
        affiliateAddress = _affiliate;
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Check eligibility for a user, using proof if required
     * @param user Address of the user to check
     * @param proof Eligibility proof from the eligibility service
     * @return Whether the user is eligible
     */
    function _checkEligibility(
        address user,
        bytes calldata proof
    ) internal view returns (bool) {
        // Convert to array and use the array-based method
        address[] memory users = new address[](1);
        users[0] = user;

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = proof;

        return _checkEligibilityForUsers(users, proofs)[0];
    }

    /**
     * @dev Verify a discount proof against the Merkle root
     * @param user Address of the user
     * @param discountRate Discount rate in basis points
     * @param proof Merkle proof for the discount
     * @return Whether the discount is valid
     */
    function _verifyDiscountProof(
        address user,
        uint256 discountRate,
        bytes32[] calldata proof
    ) internal view returns (bool) {
        // If no discount Merkle root is set, discount cannot be verified
        if (discountMerkleRoot == bytes32(0)) {
            return false;
        }

        // Create the leaf node by hashing the user address and discount rate
        bytes32 leaf = keccak256(abi.encodePacked(user, discountRate));

        // Verify the proof against the Merkle root
        return MerkleProof.verify(proof, discountMerkleRoot, leaf);
    }
    
    /**
     * @notice Debugging helper to check contract state
     */
    function debugState() external view returns (
        bool isInitialized,
        address activityAddr,
        address rewardAddr,
        bool isPaused,
        bool eligibilityEnabled,
        address eligibilitySigningKey,
        uint256 proofValidity
    ) {
        return (
            _initialized,
            address(activity),
            address(reward),
            paused(),
            eligibilityConfig.enabled,
            eligibilityConfig.signingKey,
            eligibilityConfig.proofValidityDuration
        );
    }
}