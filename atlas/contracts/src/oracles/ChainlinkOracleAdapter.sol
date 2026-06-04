// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal Chainlink AggregatorV3 interface needed by Atlas.
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

/// @title ChainlinkOracleAdapter
/// @notice Wraps a Chainlink price feed with staleness checks and decimal normalization.
/// @dev Reverts on stale data. Designed to be the single source of truth for price reads
///      across AtlasHook, MockPerpAdapter, and AtlasReactive.
contract ChainlinkOracleAdapter {
    // ============ IMMUTABLES ============

    /// @dev The underlying Chainlink aggregator.
    IAggregatorV3 public immutable feed;

    /// @dev Maximum age of a price update before it is considered stale (seconds).
    uint256 public immutable maxStaleness;

    /// @dev Decimals exposed by the feed (e.g., 8 for ETH/USD on Sepolia).
    uint8 public immutable feedDecimals;

    // ============ ERRORS ============

    error StalePrice(uint256 updatedAt, uint256 nowTimestamp);
    error InvalidPrice(int256 answer);

    // ============ CONSTRUCTOR ============

    constructor(address _feed, uint256 _maxStaleness) {
        feed = IAggregatorV3(_feed);
        maxStaleness = _maxStaleness;
        feedDecimals = IAggregatorV3(_feed).decimals();
    }

    // ============ EXTERNAL VIEWS ============

    /// @notice Returns the latest price scaled to 1e18.
    /// @dev Reverts if the price is stale or non-positive.
    function getPrice() external view returns (uint256) {
        // TODO: pull latestRoundData, enforce staleness, scale to 1e18, return
    }

    /// @notice Returns the latest price along with its timestamp.
    function getPriceWithTimestamp() external view returns (uint256 price, uint256 updatedAt) {
        // TODO: same as getPrice but also returns the updatedAt
    }
}
