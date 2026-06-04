// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IPerpAdapter
/// @notice Abstract interface for perpetual venue integrations used by Atlas to hedge LP delta.
/// @dev Concrete implementations: MockPerpAdapter (demo), HyperliquidAdapter (production roadmap),
///      GMXAdapter (alternative roadmap). The adapter pattern lets Atlas swap venues without
///      changing hook or vault logic.
interface IPerpAdapter {
    /// @notice Opens a new short position sized in the underlying volatile asset.
    /// @param size The size of the short in volatile-asset units (e.g., ETH).
    /// @return positionId Unique handle for the opened position.
    function openShort(uint256 size) external returns (bytes32 positionId);

    /// @notice Resizes an existing position by a signed delta.
    /// @param positionId The position handle returned by openShort.
    /// @param delta Positive to increase short size, negative to reduce.
    /// @return newSize Resulting short size.
    function resizeShort(bytes32 positionId, int256 delta) external returns (uint256 newSize);

    /// @notice Closes the position fully and returns realized PnL (signed).
    /// @param positionId The position handle.
    /// @return pnl Realized profit (positive) or loss (negative) in quote currency units.
    function closeShort(bytes32 positionId) external returns (int256 pnl);

    /// @notice Returns the current mark-to-market value of the position in quote currency.
    function getPositionValue(bytes32 positionId) external view returns (uint256);

    /// @notice Returns funding accrued since position opening (positive = earned, negative = paid).
    function getFundingAccrued(bytes32 positionId) external view returns (int256);

    /// @notice Returns current short size for the position.
    function getPositionSize(bytes32 positionId) external view returns (uint256);
}
