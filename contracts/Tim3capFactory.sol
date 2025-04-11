// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./Tim3cap.sol";
import "./interfaces/IActivity.sol";
import "./interfaces/IReward.sol";

/**
 * @title Tim3capFactory
 * @notice Factory contract for creating new Tim3cap instances
 * @dev Uses minimal proxy pattern (EIP-1167) for gas-efficient deployment
 */
contract Tim3capFactory is Ownable {
    // Tim3cap implementation address
    address public immutable tim3capImplementation;

    // Contract registry
    address public registry;

    // Deployer wallet with special permissions
    address public deployerWallet;

    // Fee configuration
    struct AffiliateFeeConfig {
        address feeRecipient;
        uint256 feePercentage;
        bool isEnabled;
    }

    AffiliateFeeConfig public affiliateFeeConfig;

    // Discount configuration
    bytes32 public discountMerkleRoot;

    // Authorized origins mapping
    mapping(address => bool) public authorizedOrigins;

    // Events
    event Tim3capDeployed(
        address indexed contractAddress,
        string activityType,
        string rewardType,
        Tim3cap.EligibilityConfig eligibilityConfig
    );
    event DeployerWalletUpdated(address newDeployer);
    event OriginAuthorizationUpdated(address origin, bool authorized);
    event AffiliateFeeConfigUpdated(
        address feeRecipient,
        uint256 feePercentage,
        bool isEnabled
    );
    event DiscountMerkleRootUpdated(bytes32 newRoot);

    /**
     * @notice Constructor initializes the factory with Tim3cap implementation
     * @param _tim3capImplementation Address of the Tim3cap implementation contract
     * @param _registry Address of the Tim3cap registry contract
     * @param _deployerWallet Address of the deployer wallet
     * @param _feeRecipient Address to receive fees
     * @param _feePercentage Fee percentage in basis points
     */
    constructor(
        address _tim3capImplementation,
        address _registry,
        address _deployerWallet,
        address _feeRecipient,
        uint256 _feePercentage
    ) {
        require(
            _tim3capImplementation != address(0),
            "Invalid implementation address"
        );

        _transferOwnership(msg.sender);
        tim3capImplementation = _tim3capImplementation;
        registry = _registry;
        deployerWallet = _deployerWallet;

        // Initialize fee configuration
        affiliateFeeConfig = AffiliateFeeConfig({
            feeRecipient: _feeRecipient,
            feePercentage: _feePercentage,
            isEnabled: true
        });

        // Authorize the deployer wallet as an origin
        authorizedOrigins[_deployerWallet] = true;
    }

    /**
     * @notice Create a new Tim3cap contract
     * @param activityType Type of activity contract
     * @param activityImplementation Address of the activity implementation
     * @param activityConfig Configuration for the activity contract
     * @param rewardType Type of reward contract
     * @param rewardImplementation Address of the reward implementation
     * @param rewardConfig Configuration for the reward contract
     * @param eligibilityConfig Configuration for the eligibility service
     * @param origin Address of the origin contract
     * @param creator Address of the creator
     * @param affiliate Address of the affiliate
     * @return Address of the newly created Tim3cap contract
     */
    function createTim3cap(
        string memory activityType,
        address activityImplementation,
        bytes memory activityConfig,
        string memory rewardType,
        address rewardImplementation,
        bytes memory rewardConfig,
        Tim3cap.EligibilityConfig memory eligibilityConfig,
        address origin,
        address creator,
        address affiliate
    ) external returns (address) {
        // Verify authorization
        require(
            msg.sender == deployerWallet || authorizedOrigins[origin],
            "Unauthorized origin or caller"
        );

        // Clone the activity and reward implementations
        address activityClone = Clones.clone(activityImplementation);
        address rewardClone = Clones.clone(rewardImplementation);

        // Clone the Tim3cap implementation first
        address tim3capClone = Clones.clone(tim3capImplementation);

        // Initialize the clones
        IActivity(activityClone).initializeClone(activityConfig, creator);
        IReward(rewardClone).initializeClone(rewardConfig, creator, tim3capClone);

        // Initialize the Tim3cap contract
        Tim3cap(payable(tim3capClone)).initialize(
            activityClone,
            rewardClone,
            creator,
            eligibilityConfig,
            affiliateFeeConfig.feeRecipient,
            affiliateFeeConfig.feePercentage,
            affiliateFeeConfig.isEnabled,
            affiliate
        );

        // Emit deployment event
        emit Tim3capDeployed(
            tim3capClone,
            activityType,
            rewardType,
            eligibilityConfig
        );

        return tim3capClone;
    }

    /**
     * @notice Set the deployer wallet address
     * @param newDeployer Address of the new deployer wallet
     */
    function setDeployerWallet(address newDeployer) external onlyOwner {
        deployerWallet = newDeployer;
        emit DeployerWalletUpdated(newDeployer);
    }

    /**
     * @notice Update the authorization status of an origin
     * @param origin Address of the origin
     * @param authorized Whether the origin is authorized
     */
    function updateAuthorizedOrigin(
        address origin,
        bool authorized
    ) external onlyOwner {
        authorizedOrigins[origin] = authorized;
        emit OriginAuthorizationUpdated(origin, authorized);
    }

    /**
     * @notice Set the affiliate fee configuration
     * @param _feeRecipient Address to receive fees
     * @param _feePercentage Fee percentage in basis points
     * @param _isEnabled Whether fees are enabled
     */
    function setAffiliateFeeConfig(
        address _feeRecipient,
        uint256 _feePercentage,
        bool _isEnabled
    ) external onlyOwner {
        require(_feePercentage <= 1000, "Fee percentage too high"); // 10% maximum

        affiliateFeeConfig = AffiliateFeeConfig({
            feeRecipient: _feeRecipient,
            feePercentage: _feePercentage,
            isEnabled: _isEnabled
        });

        emit AffiliateFeeConfigUpdated(
            _feeRecipient,
            _feePercentage,
            _isEnabled
        );
    }

    /**
     * @notice Update the discount Merkle root
     * @param newRoot New Merkle root for discount verification
     */
    function updateDiscountMerkleRoot(bytes32 newRoot) external onlyOwner {
        discountMerkleRoot = newRoot;
        emit DiscountMerkleRootUpdated(newRoot);
    }
}
