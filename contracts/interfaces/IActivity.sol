// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IActivity
 * @notice Interface for activity contracts in the Tim3cap platform
 * @dev Defines the required methods for all activity implementations
 */
interface IActivity {
    /**
     * @notice Initialize the activity contract
     * @param config Configuration data for the activity
     */
    function initialize(bytes memory config) external;
    
    /**
     * @notice Initialize the activity contract as a clone
     * @param config Configuration data for the activity
     * @param owner Address of the contract owner
     */
    function initializeClone(bytes memory config, address owner) external;
    
    /**
     * @notice Check eligibility for a user
     * @param user Address of the user to check
     * @return Whether the user is eligible
     */
    function checkEligibility(address user) external view returns (bool);
    
    /**
     * @notice Alias for checkEligibility to maintain compatibility
     * @param user Address of the user to check
     * @return Whether the user is eligible
     */
    function isEligible(address user) external view returns (bool);
    
    /**
     * @notice Verify an eligibility proof
     * @param user Address of the user
     * @param proof Eligibility proof from the eligibility service
     * @return Whether the proof is valid
     */
    function verifyEligibilityProof(address user, bytes calldata proof) external view returns (bool);
    
    /**
     * @notice Get the activity type identifier
     * @return Type identifier for the activity
     */
    function getActivityType() external pure returns (string memory);
    
    /**
     * @notice Validate configuration data
     * @param config Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(bytes memory config) external pure returns (bool);
}