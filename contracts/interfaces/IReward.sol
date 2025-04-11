// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IReward
 * @notice Interface for reward contracts in the Tim3cap platform
 * @dev Defines the required methods for all reward implementations
 */
interface IReward {
    /**
     * @notice Initialize the reward contract
     * @param config Configuration data for the reward
     */
    function initialize(bytes memory config) external;

/**
 * @notice Initialize the reward contract as a clone
 * @param config Configuration data for the reward
 * @param owner Address of the contract owner
 * @param controller Address of the controller (Tim3cap core)
 */
function initializeClone(bytes memory config, address owner, address controller) external;

    /**
     * @notice Claim a reward for a user
     * @param user Address of the user to receive the reward
     */
    function claim(address user) external;

    /**
     * @notice Check if a user can claim a reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(address user) external view returns (bool);

    /**
     * @notice Process fee on claim
     * @param user Address of the user claiming
     * @return Whether fee processing was successful
     */
    function processFeeOnClaim(address user) external returns (bool);

    /**
     * @notice Process fee with discount
     * @param user Address of the user claiming
     * @param discountRate Discount rate in basis points
     * @param merkleProof Merkle proof for the discount
     * @return Whether fee processing was successful
     */
    function processFeeWithDiscount(
        address user,
        uint256 discountRate,
        bytes32[] calldata merkleProof
    ) external returns (bool);

    /**
     * @notice Get the reward type identifier
     * @return Type identifier for the reward
     */
    function getRewardType() external pure returns (string memory);

    /**
     * @notice Validate configuration data
     * @param config Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(bytes memory config) external pure returns (bool);
    
}
