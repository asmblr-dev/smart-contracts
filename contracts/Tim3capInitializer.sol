// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Tim3cap.sol";

/**
 * @title Tim3capInitializer
 * @notice Helper contract to initialize Tim3cap contracts when using minimal proxy pattern
 * @dev Contains initialization function that can be called by factory
 */
contract Tim3capInitializer {
    /**
     * @notice Initialize a Tim3cap contract
     * @param tim3cap Address of the Tim3cap contract to initialize
     * @param activity Address of the activity contract
     * @param reward Address of the reward contract
     * @param owner Address of the contract owner
     * @param eligibilityConfig Eligibility service configuration
     * @param feeRecipient Address to receive fees
     * @param feePercentage Fee percentage in basis points
     * @param feesEnabled Whether fees are enabled
     * @param affiliate Affiliate address for this contract
     */
    function initialize(
        address payable tim3cap,
        address activity,
        address reward,
        address owner,
        Tim3cap.EligibilityConfig memory eligibilityConfig,
        address feeRecipient,
        uint256 feePercentage,
        bool feesEnabled,
        address affiliate
    ) external {
        Tim3cap(tim3cap).initialize(
            activity,
            reward,
            owner,
            eligibilityConfig,
            feeRecipient,
            feePercentage,
            feesEnabled,
            affiliate
        );
    }
}