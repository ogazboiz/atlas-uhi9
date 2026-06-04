// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "uniswap-hooks/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPerpAdapter} from "./adapters/IPerpAdapter.sol";

/// @title AtlasHook
/// @notice Uniswap v4 hook that pairs every LP position with a matched perpetual short,
///         providing delta-neutral exposure with smoothed yield.
/// @dev Cross-chain rebalance triggers arrive via `rebalanceCallback`, fired by AtlasReactive
///      on Reactive Network. See ../architecture.md section 4.2 for the full sequence diagram.
contract AtlasHook is BaseHook, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;

    // ============ STRUCTS ============

    /// @dev Per-LP-position state. Indexed by keccak(owner, poolId, tickLower, tickUpper).
    struct AtlasPosition {
        address owner;
        uint256 liquidity;
        int24 tickLower;
        int24 tickUpper;
        bytes32 perpPositionId;
        uint256 hedgeSize;
        uint256 lastRebalanceBlock;
        bool open;
    }

    /// @dev Anti-replay payload from AtlasReactive RSC.
    struct RebalanceCallbackData {
        PoolId poolId;
        int256 deltaSize;
        uint256 nonce;
        uint256 deadline;
    }

    // ============ STORAGE ============

    /// @dev positionKey => AtlasPosition
    mapping(bytes32 => AtlasPosition) public positions;

    /// @dev Authenticated RSC address allowed to call rebalanceCallback.
    address public reactiveCallback;

    /// @dev The smoothing vault collecting fees and funding income.
    address public vault;

    /// @dev The perp adapter used to manage hedge legs.
    IPerpAdapter public perpAdapter;

    /// @dev Last consumed nonce from RSC (monotonically increasing).
    uint256 public lastNonce;

    /// @dev Maximum rebalance delta per callback, in basis points of position size (e.g., 2000 = 20%).
    uint256 public rebalanceCapBps;

    // ============ EVENTS ============

    event HedgeOpened(bytes32 indexed positionKey, uint256 size, bytes32 perpPositionId);
    event HedgeResized(bytes32 indexed positionKey, int256 delta, uint256 newSize);
    event HedgeClosed(bytes32 indexed positionKey, int256 finalPnl);
    event RebalanceCallback(PoolId indexed poolId, int256 delta, uint256 nonce);
    event RebalanceCapped(PoolId indexed poolId, int256 requested, int256 applied);
    event RebalanceFailed(PoolId indexed poolId, string reason);

    // ============ ERRORS ============

    error NotReactiveCallback();
    error NonceUsed(uint256 nonce);
    error CallbackExpired(uint256 deadline);
    error HedgeOpenFailed();
    error HedgeCloseFailed();

    // ============ CONSTRUCTOR ============

    constructor(IPoolManager _poolManager, address _vault, IPerpAdapter _perpAdapter, address _reactiveCallback)
        BaseHook(_poolManager)
    {
        vault = _vault;
        perpAdapter = _perpAdapter;
        reactiveCallback = _reactiveCallback;
        rebalanceCapBps = 2000; // 20% per call
    }

    // ============ HOOK PERMISSIONS ============

    /// @inheritdoc BaseHook
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: true,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ============ HOOK CALLBACKS ============

    /// @dev Called after liquidity is added. Computes delta and opens matched perp short.
    function _afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) internal override returns (bytes4, BalanceDelta) {
        // TODO: compute hedge size from liquidity + ticks + current price
        // TODO: call perpAdapter.openShort(hedgeSize)
        // TODO: store AtlasPosition
        // TODO: emit HedgeOpened
    }

    /// @dev Called before liquidity is removed. Closes proportional hedge.
    function _beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4) {
        // TODO: load AtlasPosition, compute proportional hedge to close
        // TODO: call perpAdapter.resizeShort or closeShort
        // TODO: forward PnL to vault
        // TODO: emit HedgeClosed
    }

    /// @dev Called after each swap. Routes accrued fees to vault.
    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        // TODO: read fees collected, route to vault.depositFromHook
    }

    // ============ REACTIVE CALLBACK ============

    /// @notice Called by AtlasReactive RSC to trigger a hedge rebalance.
    /// @dev Restricted to the registered RSC address. Verifies nonce monotonicity and deadline.
    function rebalanceCallback(RebalanceCallbackData calldata data) external nonReentrant {
        if (msg.sender != reactiveCallback) revert NotReactiveCallback();
        if (data.nonce <= lastNonce) revert NonceUsed(data.nonce);
        if (block.timestamp > data.deadline) revert CallbackExpired(data.deadline);
        lastNonce = data.nonce;
        // TODO: cap delta, resize hedge via perpAdapter, emit RebalanceCallback
    }

    // ============ VIEWS ============

    /// @notice Returns the current hedge status for a given position key.
    function getHedgeStatus(bytes32 positionKey) external view returns (AtlasPosition memory) {
        return positions[positionKey];
    }
}
