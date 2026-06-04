// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPerpAdapter} from "./IPerpAdapter.sol";
import {IPriceOracle} from "../oracles/IPriceOracle.sol";

/// @title MockPerpAdapter
/// @notice Demo implementation of IPerpAdapter that simulates a perpetual short with
///         mark-price tracking, weighted-average entry, partial-close PnL realization,
///         and linear funding accrual. No real tokens move; the mock is a virtual
///         accounting contract used to demo the Atlas hedge loop end-to-end.
/// @dev Funding rate is signed in basis points per year:
///        positive => shorts EARN funding (bull regime, typical for ETH)
///        negative => shorts PAY funding (bear regime)
///      All internal math uses 1e18 scaling for prices, sizes, and PnL.
contract MockPerpAdapter is IPerpAdapter {
    // ============ CONSTANTS ============

    /// @dev Approximate blocks per year on a 2-second chain like Unichain.
    uint256 public constant BLOCKS_PER_YEAR = 15_768_000;

    /// @dev Basis points denominator.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Scaling factor for prices and sizes.
    uint256 internal constant SCALE = 1e18;

    // ============ STRUCTS ============

    struct Position {
        address owner;
        uint256 size; // volatile-asset units, 1e18 scaled
        uint256 entryPrice; // quote-per-asset, 1e18 scaled
        uint256 lastFundingBlock;
        int256 accruedFunding; // 1e18 scaled USDC equivalent
        int256 realizedPnL; // 1e18 scaled, from partial closes
        bool open;
    }

    // ============ STORAGE ============

    /// @dev positionId => Position
    mapping(bytes32 => Position) public positions;

    /// @dev Monotonically increasing counter for unique position IDs.
    uint256 public positionCounter;

    /// @dev Source of mark price for PnL and funding calculations.
    IPriceOracle public immutable ORACLE;

    /// @dev Signed annual funding rate in basis points (positive = shorts earn).
    int256 public fundingRateAnnualBps;

    /// @dev Admin allowed to update funding rate (set at construction for hackathon).
    address public immutable ADMIN;

    // ============ EVENTS ============

    event ShortOpened(bytes32 indexed positionId, address indexed owner, uint256 size, uint256 entryPrice);
    event ShortResized(bytes32 indexed positionId, int256 delta, uint256 newSize);
    event ShortClosed(bytes32 indexed positionId, int256 totalPnL);
    event FundingAccrued(bytes32 indexed positionId, int256 amount, uint256 throughBlock);
    event FundingRateUpdated(int256 oldRate, int256 newRate);

    // ============ ERRORS ============

    error PositionNotOpen();
    error InvalidDelta();
    error NotOwner();
    error ZeroSize();
    error NotAdmin();
    error ResizeWouldFullyClose();

    // ============ CONSTRUCTOR ============

    constructor(address _oracle, int256 _initialFundingRateBps) {
        ORACLE = IPriceOracle(_oracle);
        fundingRateAnnualBps = _initialFundingRateBps;
        ADMIN = msg.sender;
    }

    // ============ ADMIN ============

    /// @notice Updates the annual funding rate (signed bps).
    /// @dev Restricted to the deployer. Used for demos that want to simulate regime shifts.
    function setFundingRate(int256 newRate) external {
        if (msg.sender != ADMIN) revert NotAdmin();
        int256 old = fundingRateAnnualBps;
        fundingRateAnnualBps = newRate;
        emit FundingRateUpdated(old, newRate);
    }

    // ============ EXTERNAL ============

    /// @inheritdoc IPerpAdapter
    function openShort(uint256 size) external override returns (bytes32 positionId) {
        if (size == 0) revert ZeroSize();

        uint256 entryPrice = ORACLE.getPrice();
        positionCounter += 1;
        positionId = bytes32(positionCounter);

        positions[positionId] = Position({
            owner: msg.sender,
            size: size,
            entryPrice: entryPrice,
            lastFundingBlock: block.number,
            accruedFunding: 0,
            realizedPnL: 0,
            open: true
        });

        emit ShortOpened(positionId, msg.sender, size, entryPrice);
    }

    /// @inheritdoc IPerpAdapter
    function resizeShort(bytes32 positionId, int256 delta) external override returns (uint256 newSize) {
        Position storage pos = positions[positionId];
        if (!pos.open) revert PositionNotOpen();
        if (pos.owner != msg.sender) revert NotOwner();
        if (delta == 0) revert InvalidDelta();

        // Roll funding forward to the current block before mutating state.
        _accrueFundingToNow(positionId, pos);

        uint256 currentPrice = ORACLE.getPrice();

        if (delta > 0) {
            // Increase size: weighted-average entry price.
            uint256 increase = uint256(delta);
            uint256 totalSize = pos.size + increase;
            pos.entryPrice = (pos.size * pos.entryPrice + increase * currentPrice) / totalSize;
            pos.size = totalSize;
        } else {
            uint256 decrease = uint256(-delta);
            if (decrease >= pos.size) revert ResizeWouldFullyClose();

            // Realize PnL on the closed portion. Short profits when current < entry.
            int256 priceDiff = int256(pos.entryPrice) - int256(currentPrice);
            int256 realized = int256(decrease) * priceDiff / int256(SCALE);
            pos.realizedPnL += realized;
            pos.size -= decrease;
        }

        emit ShortResized(positionId, delta, pos.size);
        return pos.size;
    }

    /// @inheritdoc IPerpAdapter
    function closeShort(bytes32 positionId) external override returns (int256 pnl) {
        Position storage pos = positions[positionId];
        if (!pos.open) revert PositionNotOpen();
        if (pos.owner != msg.sender) revert NotOwner();

        // Final funding accrual.
        _accrueFundingToNow(positionId, pos);

        // Unrealized PnL on remaining size at current mark.
        uint256 currentPrice = ORACLE.getPrice();
        int256 priceDiff = int256(pos.entryPrice) - int256(currentPrice);
        int256 unrealized = int256(pos.size) * priceDiff / int256(SCALE);

        pnl = pos.realizedPnL + unrealized + pos.accruedFunding;

        pos.open = false;
        emit ShortClosed(positionId, pnl);
    }

    // ============ VIEWS ============

    /// @inheritdoc IPerpAdapter
    function getPositionValue(bytes32 positionId) external view override returns (uint256) {
        Position memory pos = positions[positionId];
        if (!pos.open) return 0;
        uint256 currentPrice = ORACLE.getPrice();
        return pos.size * currentPrice / SCALE;
    }

    /// @inheritdoc IPerpAdapter
    function getFundingAccrued(bytes32 positionId) external view override returns (int256) {
        Position memory pos = positions[positionId];
        if (!pos.open) return pos.accruedFunding;
        return pos.accruedFunding + _pendingFunding(pos);
    }

    /// @inheritdoc IPerpAdapter
    function getPositionSize(bytes32 positionId) external view override returns (uint256) {
        return positions[positionId].size;
    }

    /// @notice Returns the unrealized PnL on the remaining size at current mark.
    function getUnrealizedPnL(bytes32 positionId) external view returns (int256) {
        Position memory pos = positions[positionId];
        if (!pos.open) return 0;
        uint256 currentPrice = ORACLE.getPrice();
        int256 priceDiff = int256(pos.entryPrice) - int256(currentPrice);
        return int256(pos.size) * priceDiff / int256(SCALE);
    }

    /// @notice Returns total PnL: realized + unrealized + funding accrued.
    function getTotalPnL(bytes32 positionId) external view returns (int256) {
        Position memory pos = positions[positionId];
        int256 unrealized;
        if (pos.open) {
            uint256 currentPrice = ORACLE.getPrice();
            int256 priceDiff = int256(pos.entryPrice) - int256(currentPrice);
            unrealized = int256(pos.size) * priceDiff / int256(SCALE);
        }
        int256 funding = pos.accruedFunding + (pos.open ? _pendingFunding(pos) : int256(0));
        return pos.realizedPnL + unrealized + funding;
    }

    // ============ INTERNAL ============

    /// @dev Materializes pending funding into accruedFunding and updates lastFundingBlock.
    function _accrueFundingToNow(bytes32 positionId, Position storage pos) internal {
        if (pos.lastFundingBlock == block.number) return;
        int256 pending = _pendingFunding(pos);
        pos.accruedFunding += pending;
        pos.lastFundingBlock = block.number;
        emit FundingAccrued(positionId, pending, block.number);
    }

    /// @dev Computes funding accrued since lastFundingBlock at the current rate.
    /// @dev Uses entryPrice as the reference notional for stability across price moves.
    function _pendingFunding(Position memory pos) internal view returns (int256) {
        if (!pos.open) return 0;
        uint256 elapsed = block.number - pos.lastFundingBlock;
        if (elapsed == 0) return 0;

        // notional (1e18) = size * entryPrice / SCALE
        uint256 notional = pos.size * pos.entryPrice / SCALE;
        // annualFunding (1e18) = notional * |rate| / BPS_DENOMINATOR
        // pending (1e18)       = annualFunding * elapsed / BLOCKS_PER_YEAR
        // Combined to keep precision:
        uint256 absRate = fundingRateAnnualBps >= 0 ? uint256(fundingRateAnnualBps) : uint256(-fundingRateAnnualBps);
        uint256 magnitude = notional * absRate * elapsed / (BPS_DENOMINATOR * BLOCKS_PER_YEAR);
        return fundingRateAnnualBps >= 0 ? int256(magnitude) : -int256(magnitude);
    }
}
