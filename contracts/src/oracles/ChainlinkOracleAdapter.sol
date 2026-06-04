// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPriceOracle} from "./IPriceOracle.sol";

/// @notice Minimal Chainlink AggregatorV3 interface needed by Atlas.
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

/// @title ChainlinkOracleAdapter
/// @notice Wraps a Chainlink price feed with staleness checks and 1e18 decimal normalization.
/// @dev Reverts on stale or non-positive answers. Designed to be the single source of truth
///      for price reads across AtlasHook, MockPerpAdapter, and AtlasReactive.
contract ChainlinkOracleAdapter is IPriceOracle {
    // ============ IMMUTABLES ============

    /// @dev The underlying Chainlink aggregator.
    IAggregatorV3 public immutable FEED;

    /// @dev Maximum age of a price update before it is considered stale (seconds).
    uint256 public immutable MAX_STALENESS;

    /// @dev Decimals exposed by the feed (e.g., 8 for ETH/USD on Sepolia).
    uint8 public immutable FEED_DECIMALS;

    /// @dev Target internal scale.
    uint256 internal constant TARGET_SCALE = 1e18;

    // ============ ERRORS ============

    error StalePrice(uint256 updatedAt, uint256 nowTimestamp);
    error InvalidPrice(int256 answer);

    // ============ CONSTRUCTOR ============

    constructor(address _feed, uint256 _maxStaleness) {
        FEED = IAggregatorV3(_feed);
        MAX_STALENESS = _maxStaleness;
        FEED_DECIMALS = IAggregatorV3(_feed).decimals();
    }

    // ============ EXTERNAL VIEWS ============

    /// @inheritdoc IPriceOracle
    function getPrice() external view returns (uint256) {
        (uint256 price,) = _readAndScale();
        return price;
    }

    /// @notice Returns the latest price along with its timestamp.
    function getPriceWithTimestamp() external view returns (uint256 price, uint256 updatedAt) {
        return _readAndScale();
    }

    // ============ INTERNAL ============

    function _readAndScale() internal view returns (uint256 scaledPrice, uint256 updatedAt) {
        (, int256 answer,, uint256 _updatedAt,) = FEED.latestRoundData();

        if (answer <= 0) revert InvalidPrice(answer);
        if (block.timestamp - _updatedAt > MAX_STALENESS) {
            revert StalePrice(_updatedAt, block.timestamp);
        }

        // Scale to 1e18 regardless of source decimals.
        if (FEED_DECIMALS < 18) {
            scaledPrice = uint256(answer) * 10 ** (18 - FEED_DECIMALS);
        } else if (FEED_DECIMALS > 18) {
            scaledPrice = uint256(answer) / 10 ** (FEED_DECIMALS - 18);
        } else {
            scaledPrice = uint256(answer);
        }
        updatedAt = _updatedAt;
    }
}
