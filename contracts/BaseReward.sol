// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";
import "./interfaces/IReward.sol";

/**
 * @title BaseReward
 * @notice Base implementation for reward contracts
 * @dev Abstract contract with common functionality for all reward types
 */
abstract contract BaseReward is IReward, Ownable, ReentrancyGuard {
    // Claim tracking
    mapping(address => bool) public hasClaimed;
    uint256 public totalClaims;

    // Claim period
    uint256 public claimStartDate;
    uint256 public claimFinishDate;

    // Status flags
    bool public active;
    bool internal _initialized;

    // Events
    event Claimed(address indexed user, uint256 timestamp);
    event ClaimPeriodUpdated(uint256 startDate, uint256 finishDate);
    event StatusChanged(bool active);
    event ControllerUpdated(address controller);

    // Modifier to prevent reinitialization
    modifier initializer() {
        console.log("BaseReward: Initializer called, initialized status:", _initialized);
        require(!_initialized, "Already initialized");
        _;
        _initialized = true;
        console.log("BaseReward: Contract initialized");
    }

    function isInitialized() public view returns (bool) {
        return _initialized;
    }

    // Modifier to restrict actions to the active period
    modifier whenActive() {
        console.log("BaseReward: whenActive check");
        console.log("BaseReward: Active status:", active);
        console.log("BaseReward: Current timestamp:", block.timestamp);
        console.log("BaseReward: Claim start date:", claimStartDate);
        console.log("BaseReward: Claim finish date:", claimFinishDate);
        
        require(active, "Reward is not active");
        
        bool withinTime = block.timestamp >= claimStartDate &&
                (claimFinishDate == 0 || block.timestamp <= claimFinishDate);
                
        console.log("BaseReward: Within time window:", withinTime);
        
        require(
            withinTime,
            "Outside claim period"
        );
        _;
    }

    /**
     * @notice Constructor disables initialization for the implementation contract
     */
    constructor() {
        console.log("BaseReward: Constructor called");
        _initialized = true;
        _transferOwnership(msg.sender); // Set the owner manually
        console.log("BaseReward: Implementation contract locked");
    }

    /**
     * @notice Initialize the reward contract as a clone
     * @param config Configuration data for the reward
     * @param owner Address of the contract owner
     */
    function initializeClone(
        bytes memory config,
        address owner,
        address controller
    ) external override initializer {
        console.log("BaseReward: Initializing clone with owner:", owner);
        console.log("BaseReward: Controller:", controller);
        
        require(owner != address(0), "Invalid owner address");
        _transferOwnership(owner);
        _initialize(config);
        _setController(controller); // New method
        
        console.log("BaseReward: Clone initialization complete");
    }

    function _initialize(bytes memory config) internal virtual {
        console.log("BaseReward: Internal initialization");
        require(validateConfig(config), "Invalid configuration");
        // Specific initialization logic to be implemented by derived contracts
    }

    /**
     * @notice Set claim period
     * @param startDate Start date of the claim period (timestamp)
     * @param finishDate End date of the claim period (timestamp, 0 for no end)
     */
    function setClaimPeriod(
        uint256 startDate,
        uint256 finishDate
    ) external onlyOwner {
        require(
            startDate <= finishDate || finishDate == 0,
            "Invalid claim period"
        );
        console.log("BaseReward: Setting claim period");
        console.log("BaseReward: Start date:", startDate);
        console.log("BaseReward: Finish date:", finishDate);
        
        claimStartDate = startDate;
        claimFinishDate = finishDate;
        emit ClaimPeriodUpdated(startDate, finishDate);
        
        console.log("BaseReward: Claim period updated");
    }

    /**
     * @notice Extend the claim period
     * @param extension Duration in seconds to extend the claim period
     */
    function extendClaimPeriod(uint256 extension) external onlyOwner {
        require(claimFinishDate > 0, "No finish date set");
        console.log("BaseReward: Extending claim period by", extension, "seconds");
        console.log("BaseReward: Original finish date:", claimFinishDate);
        
        claimFinishDate += extension;
        emit ClaimPeriodUpdated(claimStartDate, claimFinishDate);
        
        console.log("BaseReward: New finish date:", claimFinishDate);
    }

    /**
     * @notice Activate the reward
     */
    function activate() external onlyOwner {
        console.log("BaseReward: Activating reward");
        active = true;
        emit StatusChanged(true);
        console.log("BaseReward: Reward activated");
    }

    /**
     * @notice Deactivate the reward
     */
    function deactivate() external onlyOwner {
        console.log("BaseReward: Deactivating reward");
        active = false;
        emit StatusChanged(false);
        console.log("BaseReward: Reward deactivated");
    }

    /**
     * @notice Check if the claim period is active
     * @return Whether the claim period is active
     */
    function isClaimPeriodActive() external view returns (bool) {
        bool isActive = active &&
            block.timestamp >= claimStartDate &&
            (claimFinishDate == 0 || block.timestamp <= claimFinishDate);
            
        return isActive;
    }

    /**
     * @notice Process fee on claim (base implementation)
     * @param user Address of the user claiming
     * @return Whether fee processing was successful
     */
    function processFeeOnClaim(
        address user
    ) external virtual override returns (bool) {
        console.log("BaseReward: Processing fee for user", user);
        // Base implementation simply returns true
        // Derived contracts can override with fee handling logic
        return true;
    }

    /**
     * @notice Process fee with discount (base implementation)
     * @param user Address of the user claiming
     * @param discountRate Discount rate in basis points
     * @param merkleProof Merkle proof for the discount
     * @return Whether fee processing was successful
     */
    function processFeeWithDiscount(
        address user,
        uint256 discountRate,
        bytes32[] calldata merkleProof
    ) external virtual override returns (bool) {
        console.log("BaseReward: Processing fee with discount for user", user);
        console.log("BaseReward: Discount rate:", discountRate);
        // Base implementation simply returns true
        // Derived contracts can override with fee handling logic
        return true;
    }

    /**
     * @notice Check if a user can claim a reward
     * @param user Address of the user to check
     * @return Whether the user can claim
     */
    function canClaim(
        address user
    ) public view virtual override returns (bool) {
        bool activeStatus = active;
        bool hasClaimedBefore = hasClaimed[user];
        bool withinStartTime = block.timestamp >= claimStartDate;
        bool withinEndTime = claimFinishDate == 0 || block.timestamp <= claimFinishDate;
        
        // Don't log in view functions as they might be called internally
        // This is a special case since we're debugging
        if (msg.sender == address(0)) {
            console.log("BaseReward: Checking if user", user, "can claim");
            console.log("BaseReward: Active?", activeStatus);
            console.log("BaseReward: Has claimed?", hasClaimedBefore);
            console.log("BaseReward: After start time?", withinStartTime);
            console.log("BaseReward: Before end time?", withinEndTime);
        }
        
        bool result = activeStatus &&
            !hasClaimedBefore &&
            withinStartTime &&
            withinEndTime;
            
        // Don't log in view functions as they might be called internally
        if (msg.sender == address(0)) {
            console.log("BaseReward: Can claim result:", result);
        }
        
        return result;
    }

    /**
     * @dev Internal function to track a claim
     * @param user Address of the user claiming
     */
    function _trackClaim(address user) internal {
        console.log("BaseReward: Tracking claim for user", user);
        hasClaimed[user] = true;
        totalClaims++;
        emit Claimed(user, block.timestamp);
        console.log("BaseReward: Claim tracked successfully, total claims:", totalClaims);
    }

    /**
     * @notice Validate configuration data
     * @param config Configuration data to validate
     * @return Whether the configuration is valid
     */
    function validateConfig(
        bytes memory config
    ) public pure virtual override returns (bool);

    function _setController(address controller) internal virtual {
        // Base implementation doesn't do anything
        // Derived contracts will override this
        console.log("BaseReward: Setting controller address (base implementation)");
        emit ControllerUpdated(controller);
    }
}