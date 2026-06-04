// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IPriceOracle
/// @notice Minimal price oracle interface. All Atlas internal accounting uses 1e18-scaled prices.
/// @dev Concrete implementations: ChainlinkOracleAdapter (production), MockPriceOracle (tests).
interface IPriceOracle {
    /// @notice Returns the latest price scaled to 1e18.
    /// @dev Reverts on stale or invalid data. Caller may assume the returned value is fresh.
    function getPrice() external view returns (uint256);
}
