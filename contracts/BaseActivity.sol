// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "hardhat/console.sol";
import "./interfaces/IActivity.sol";

/**
 * @title BaseActivity
 * @notice Base implementation for activity contracts
 * @dev Abstract contract with common functionality for all activity types
 */
abstract contract BaseActivity is IActivity, Ownable {
    using ECDSA for bytes32;
    
    // Eligibility service configuration
    address public signingKey;
    uint256 public proofValidityDuration;
    
    // Flag to prevent reinitialization
    bool private _initialized;
    
    // Event for proof verification
    event EligibilityProofVerified(address indexed user, uint256 timestamp);
    
    // Modifier to prevent reinitialization
    modifier initializer() {
        console.log("BaseActivity: Initializer called, initialized status:", _initialized);
        require(!_initialized, "Already initialized");
        _;
        _initialized = true;
        console.log("BaseActivity: Contract initialized");
    }
    
    /**
     * @notice Constructor disables initialization for the implementation contract
     */
    constructor() {
        console.log("BaseActivity: Constructor called");
        _initialized = true;
        _transferOwnership(msg.sender);
        console.log("BaseActivity: Implementation contract locked");
    }
    
    /**
     * @notice Initialize the activity contract as a clone
     * @param config Configuration data for the activity
     * @param owner Address of the contract owner
     */
    function initializeClone(bytes memory config, address owner) external override initializer {
        console.log("BaseActivity: Initializing clone with owner:", owner);
        require(owner != address(0), "Invalid owner address");
        _transferOwnership(owner);
        _initialize(config);
        console.log("BaseActivity: Clone initialization complete");
    }
    
    /**
     * @notice Initialize the activity contract
     * @param config Configuration data for the activity
     */
    function initialize(bytes memory config) external override initializer {
        console.log("BaseActivity: Initializing contract");
        _initialize(config);
        console.log("BaseActivity: Initialization complete");
    }
    
    /**
     * @notice Set the signing key for the eligibility service
     * @param _signingKey Address of the new signing key
     */
    function setSigningKey(address _signingKey) external onlyOwner {
        console.log("BaseActivity: Updating signing key from", signingKey, "to", _signingKey);
        require(_signingKey != address(0), "Invalid signing key");
        signingKey = _signingKey;
        console.log("BaseActivity: Signing key updated successfully");
    }
    
    /**
     * @notice Set the proof validity duration
     * @param _duration Duration in seconds
     */
    function setProofValidityDuration(uint256 _duration) external onlyOwner {
        console.log("BaseActivity: Updating proof validity duration from", proofValidityDuration, "to", _duration);
        proofValidityDuration = _duration;
        console.log("BaseActivity: Proof validity duration updated successfully");
    }
    
    /**
     * @notice Alias for checkEligibility to maintain compatibility
     * @param user Address of the user to check
     * @return Whether the user is eligible
     */
    function isEligible(address user) external view override returns (bool) {
        if (msg.sender == address(0)) {
            console.log("BaseActivity: isEligible check for user", user);
        }
        bool result = checkEligibility(user);
        if (msg.sender == address(0)) {
            console.log("BaseActivity: isEligible result:", result);
        }
        return result;
    }
    
    /**
     * @notice Verify an eligibility proof
     * @param user Address of the user
     * @param proof Eligibility proof from the eligibility service
     * @return Whether the proof is valid
     */
    function verifyEligibilityProof(
        address user,
        bytes calldata proof
    ) external view virtual returns (bool) {
        if (msg.sender == address(0)) {
            console.log("BaseActivity: Verifying eligibility proof for user", user);
            console.log("BaseActivity: Signing key is set to", signingKey);
        }
        
        // If no signing key is set, any proof is invalid
        if (signingKey == address(0)) {
            if (msg.sender == address(0)) {
                console.log("BaseActivity: No signing key set, proof invalid");
            }
            return false;
        }
        
        // Decode the proof data
        (bytes memory signature, uint256 timestamp) = abi.decode(proof, (bytes, uint256));
        
        if (msg.sender == address(0)) {
            console.log("BaseActivity: Proof timestamp:", timestamp);
            console.log("BaseActivity: Current timestamp:", block.timestamp);
            console.log("BaseActivity: Proof validity duration:", proofValidityDuration);
        }
        
        // Check if the proof has expired
        if (proofValidityDuration > 0 && block.timestamp > timestamp + proofValidityDuration) {
            if (msg.sender == address(0)) {
                console.log("BaseActivity: Proof has expired");
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
            console.log("BaseActivity: Message hash created");
        }
        
        // Recover the signer and verify
        address signer = ECDSA.recover(messageHash, signature);
        if (msg.sender == address(0)) {
            console.log("BaseActivity: Recovered signer:", signer);
        }
        
        bool isValid = signer == signingKey;
        if (msg.sender == address(0)) {
            console.log("BaseActivity: Proof verification result:", isValid);
        }
        
        return isValid;
    }
    
    /**
     * @dev Internal initialization function
     * @param config Configuration data for the activity
     */
    function _initialize(bytes memory config) internal virtual {
        console.log("BaseActivity: Internal initialization");
        require(validateConfig(config), "Invalid configuration");
        // Specific initialization logic to be implemented by derived contracts
    }
    
    /**
     * @notice Check eligibility for a user
     * @param user Address of the user to check
     * @return Whether the user is eligible
     */
    function checkEligibility(address user) public view virtual override returns (bool);
    
    /**
     * @notice Get the activity type identifier
     * @return Type identifier for the activity
     */
    function getActivityType() public pure virtual override returns (string memory);
    
    /**
     * @notice Validate configuration data
     * @param config Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(bytes memory config) public pure virtual override returns (bool);
    
    /**
     * @notice Debugging helper to check contract state
     */
    function debugState() external view returns (
        bool initialized,
        address currentSigningKey, 
        uint256 currentProofValidity,
        address currentOwner
    ) {
        return (
            _initialized,
            signingKey,
            proofValidityDuration,
            owner()
        );
    }
}