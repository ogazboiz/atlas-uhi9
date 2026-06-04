// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPerpAdapter} from "./IPerpAdapter.sol";

/// @title MockPerpAdapter
/// @notice Demo implementation of IPerpAdapter that simulates a perpetual short position
///         with mark price tracking and funding accrual. Used for the hackathon demo to
///         eliminate dependency on a live perp venue.
/// @dev Funding rate model: positive funding (paid to shorts) when oracle price drops
///      relative to mark; negative when oracle rises faster than mark. Tuned to mimic
///      typical Hyperliquid behavior on ETH/USD pairs.
contract MockPerpAdapter is IPerpAdapter {
    // ============ STORAGE ============

    /// @dev Per-position state.
    struct Position {
        address owner;
        uint256 size;            // volatile-asset units
        uint256 entryPrice;      // quote-currency per asset, 1e18 scaled
        uint256 openedAtBlock;
        int256 accruedFunding;   // quote-currency, 1e18 scaled
        bool open;
    }

    /// @dev positionId => Position
    mapping(bytes32 => Position) public positions;

    /// @dev Counter for generating unique position IDs.
    uint256 public positionCounter;

    /// @dev Oracle for mark-price simulation. Set at construction.
    address public immutable oracle;

    // ============ EVENTS ============

    event ShortOpened(bytes32 indexed positionId, address indexed owner, uint256 size, uint256 entryPrice);
    event ShortResized(bytes32 indexed positionId, int256 delta, uint256 newSize);
    event ShortClosed(bytes32 indexed positionId, int256 pnl);
    event FundingAccrued(bytes32 indexed positionId, int256 amount);

    // ============ ERRORS ============

    error PositionNotOpen();
    error InvalidDelta();
    error NotOwner();

    // ============ CONSTRUCTOR ============

    constructor(address _oracle) {
        oracle = _oracle;
    }

    // ============ EXTERNAL ============

    /// @inheritdoc IPerpAdapter
    function openShort(uint256 size) external override returns (bytes32 positionId) {
        // TODO: read entry price from oracle, allocate position struct, emit event, return positionId
    }

    /// @inheritdoc IPerpAdapter
    function resizeShort(bytes32 positionId, int256 delta) external override returns (uint256 newSize) {
        // TODO: validate owner, accrue funding to current block, apply delta, emit event
    }

    /// @inheritdoc IPerpAdapter
    function closeShort(bytes32 positionId) external override returns (int256 pnl) {
        // TODO: accrue funding, compute PnL vs entry, close position, emit event
    }

    /// @inheritdoc IPerpAdapter
    function getPositionValue(bytes32 positionId) external view override returns (uint256) {
        // TODO: mark to current oracle price, return notional value
    }

    /// @inheritdoc IPerpAdapter
    function getFundingAccrued(bytes32 positionId) external view override returns (int256) {
        // TODO: compute funding accrual since last update based on mark-vs-oracle drift
    }

    /// @inheritdoc IPerpAdapter
    function getPositionSize(bytes32 positionId) external view override returns (uint256) {
        return positions[positionId].size;
    }
}
