// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Tim3capRegistry
 * @notice Registry for Tim3cap activity and reward implementations
 * @dev Manages valid implementations and combinations for the Tim3cap platform
 */
contract Tim3capRegistry is Ownable {
    mapping(string => address) public registeredActivities;
    mapping(string => address) public registeredRewards;
    mapping(string => mapping(string => bool)) public validCombinations;

    event ActivityRegistered(string activityType, address implementation);
    event RewardRegistered(string rewardType, address implementation);
    event CombinationUpdated(string activityType, string rewardType, bool isValid);

    /**
     * @notice Constructor initializes the registry with owner
     * @param _owner Address of the contract owner
     */
    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    function registerActivity(string memory activityType, address implementation) external onlyOwner {
        require(implementation != address(0), "Invalid implementation address");
        registeredActivities[activityType] = implementation;
        emit ActivityRegistered(activityType, implementation);
    }

    function registerReward(string memory rewardType, address implementation) external onlyOwner {
        require(implementation != address(0), "Invalid implementation address");
        registeredRewards[rewardType] = implementation;
        emit RewardRegistered(rewardType, implementation);
    }

    function setValidCombination(
        string memory activityType,
        string memory rewardType,
        bool isValid
    ) external onlyOwner {
        validCombinations[activityType][rewardType] = isValid;
        emit CombinationUpdated(activityType, rewardType, isValid);
    }

    function isValidCombination(
        string memory activityType,
        string memory rewardType
    ) external view returns (bool) {
        return validCombinations[activityType][rewardType];
    }

    function getActivityImplementation(string memory activityType) external view returns (address) {
        return registeredActivities[activityType];
    }

    function getRewardImplementation(string memory rewardType) external view returns (address) {
        return registeredRewards[rewardType];
    }
}
