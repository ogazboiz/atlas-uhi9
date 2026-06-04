// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "uniswap-hooks/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AtlasVault} from "./AtlasVault.sol";
import {IPerpAdapter} from "./adapters/IPerpAdapter.sol";

/// @title AtlasHook
/// @notice Uniswap v4 hook that pairs LP liquidity with an aggregate per-pool perpetual
///         short, providing delta-neutral exposure with smoothed yield.
/// @dev MODEL: One aggregate hedge per pool. Each LP records a per-position contribution
///      used to unwind their share of the hedge on withdrawal. RSC callbacks operate on
///      the aggregate hedge, not on individual LPs.
///
///      VOLATILE CURRENCY: Constructor takes a flag to handle either token ordering.
///      The flag picks whether to read amount0 or amount1 from BalanceDelta.
///
///      FEE CAPTURE: For MVP we expose `notifyFees(amount)` as an admin shim to deposit
///      fee revenue into the vault. Production uses afterSwapReturnDelta to extract
///      fees directly. See ../feature-breakdown.md F2/F6.
///
///      Sequence diagrams in ../architecture.md sections 4.1, 4.2, 4.4.
contract AtlasHook is BaseHook, ReentrancyGuard {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;

    // ============ CONSTANTS ============

    uint256 public constant REBALANCE_CAP_BPS = 2_000; // 20% per single callback
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ============ STRUCTS ============

    struct PoolHedge {
        bytes32 perpPositionId;
        uint256 totalHedgeSize;
        uint256 lastRebalanceBlock;
        bool open;
    }

    struct RebalanceCallback {
        bytes32 poolId;
        int256 deltaSize;
        uint256 nonce;
        uint256 deadline;
    }

    // ============ IMMUTABLES ============

    AtlasVault public immutable VAULT;
    IPerpAdapter public immutable PERP_ADAPTER;
    /// @dev True if currency0 of the pool is the volatile asset to hedge.
    bool public immutable VOLATILE_IS_CURRENCY0;
    address public immutable ADMIN;

    // ============ STORAGE ============

    /// @dev Authenticated RSC address allowed to call rebalanceCallback. Set post-deploy.
    address public reactiveCallback;

    /// @dev Last consumed nonce from RSC (monotonically increasing).
    uint256 public lastNonce;

    /// @dev poolId => aggregate hedge state.
    mapping(bytes32 => PoolHedge) public poolHedges;

    /// @dev keccak(lp, poolId, tickLower, tickUpper) => the LP's contribution to the hedge.
    mapping(bytes32 => uint256) public lpContributions;

    // ============ EVENTS ============

    event HedgeOpened(bytes32 indexed poolId, bytes32 perpPositionId, uint256 size);
    event HedgeResized(bytes32 indexed poolId, int256 delta, uint256 newTotalSize);
    event HedgeClosed(bytes32 indexed poolId, int256 finalPnL);
    event LPContributionAdded(bytes32 indexed positionKey, uint256 amount);
    event LPContributionUnwound(bytes32 indexed positionKey, uint256 amount);
    event RebalanceCallbackReceived(bytes32 indexed poolId, int256 appliedDelta, uint256 nonce);
    event RebalanceCapped(bytes32 indexed poolId, int256 requested, int256 applied);
    event ReactiveCallbackUpdated(address oldAddr, address newAddr);
    event FeesNotified(bytes32 indexed poolId, uint256 amount);

    // ============ ERRORS ============

    error NotReactiveCallback();
    error NonceUsed(uint256 nonce);
    error CallbackExpired(uint256 deadline);
    error NotAdmin();

    // ============ CONSTRUCTOR ============

    constructor(
        IPoolManager _poolManager,
        AtlasVault _vault,
        IPerpAdapter _perpAdapter,
        bool _volatileIsCurrency0,
        address _admin
    ) BaseHook(_poolManager) {
        VAULT = _vault;
        PERP_ADAPTER = _perpAdapter;
        VOLATILE_IS_CURRENCY0 = _volatileIsCurrency0;
        ADMIN = _admin;
    }

    // ============ MODIFIERS ============

    modifier onlyAdmin() {
        if (msg.sender != ADMIN) revert NotAdmin();
        _;
    }

    // ============ HOOK PERMISSIONS ============

    /// @inheritdoc BaseHook
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
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

    /// @dev On liquidity add, open or grow the pool's aggregate perp short.
    function _afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta, // feesAccrued — not consumed in MVP
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        int256 volAmount = int256(VOLATILE_IS_CURRENCY0 ? delta.amount0() : delta.amount1());
        if (volAmount >= 0) {
            return (this.afterAddLiquidity.selector, toBalanceDelta(0, 0));
        }
        uint256 hedgeSize = uint256(-volAmount);
        if (hedgeSize == 0) {
            return (this.afterAddLiquidity.selector, toBalanceDelta(0, 0));
        }

        bytes32 poolId = PoolId.unwrap(key.toId());
        PoolHedge storage hedge = poolHedges[poolId];

        if (hedge.open) {
            PERP_ADAPTER.resizeShort(hedge.perpPositionId, int256(hedgeSize));
            hedge.totalHedgeSize += hedgeSize;
            emit HedgeResized(poolId, int256(hedgeSize), hedge.totalHedgeSize);
        } else {
            bytes32 perpId = PERP_ADAPTER.openShort(hedgeSize);
            hedge.perpPositionId = perpId;
            hedge.totalHedgeSize = hedgeSize;
            hedge.lastRebalanceBlock = block.number;
            hedge.open = true;
            emit HedgeOpened(poolId, perpId, hedgeSize);
        }

        bytes32 positionKey = _positionKey(sender, poolId, params.tickLower, params.tickUpper);
        lpContributions[positionKey] += hedgeSize;
        emit LPContributionAdded(positionKey, hedgeSize);

        return (this.afterAddLiquidity.selector, toBalanceDelta(0, 0));
    }

    /// @dev On liquidity remove, unwind the LP's contribution to the aggregate hedge.
    ///      MVP behavior: full-unwind of the LP's tracked contribution. Partial unwinds
    ///      proportional to liquidity removed are a post-MVP refinement.
    function _beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata
    ) internal override returns (bytes4) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        bytes32 positionKey = _positionKey(sender, poolId, params.tickLower, params.tickUpper);

        uint256 contribution = lpContributions[positionKey];
        if (contribution == 0) return this.beforeRemoveLiquidity.selector;

        PoolHedge storage hedge = poolHedges[poolId];
        if (!hedge.open) return this.beforeRemoveLiquidity.selector;

        if (contribution >= hedge.totalHedgeSize) {
            int256 pnl = PERP_ADAPTER.closeShort(hedge.perpPositionId);
            hedge.totalHedgeSize = 0;
            hedge.open = false;
            emit HedgeClosed(poolId, pnl);
        } else {
            PERP_ADAPTER.resizeShort(hedge.perpPositionId, -int256(contribution));
            hedge.totalHedgeSize -= contribution;
            emit HedgeResized(poolId, -int256(contribution), hedge.totalHedgeSize);
        }

        lpContributions[positionKey] = 0;
        emit LPContributionUnwound(positionKey, contribution);
        return this.beforeRemoveLiquidity.selector;
    }

    /// @dev afterSwap is wired but MVP only emits an observability hook.
    ///      Production routes captured fees via afterSwapReturnDelta into the vault.
    function _afterSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        return (this.afterSwap.selector, int128(0));
    }

    // ============ REACTIVE CALLBACK ============

    /// @notice Struct-arg entrypoint kept for tests and direct off-chain callers.
    /// @dev Production RSC callbacks come through `rebalanceFromReactive` (primitive args).
    function rebalanceCallback(RebalanceCallback calldata data) external nonReentrant {
        _processRebalance(data.poolId, data.deltaSize, data.nonce, data.deadline);
    }

    /// @notice Primitive-arg entrypoint called by AtlasCallback after a Reactive Network
    ///         callback proxy invocation. Same auth + idempotency rules as the struct path.
    /// @dev Pattern adopted from PerpHinge / vfa-hooks: callback contracts pass primitives,
    ///      not encoded structs, to keep RVM payload encoding simple.
    function rebalanceFromReactive(bytes32 poolId, int256 deltaSize, uint256 nonce, uint256 deadline)
        external
        nonReentrant
    {
        _processRebalance(poolId, deltaSize, nonce, deadline);
    }

    /// @dev Core rebalance logic shared by both external entrypoints.
    function _processRebalance(bytes32 poolId, int256 deltaSize, uint256 nonce, uint256 deadline) internal {
        if (msg.sender != reactiveCallback) revert NotReactiveCallback();
        if (nonce <= lastNonce) revert NonceUsed(nonce);
        if (block.timestamp > deadline) revert CallbackExpired(deadline);
        lastNonce = nonce;

        PoolHedge storage hedge = poolHedges[poolId];
        if (!hedge.open || deltaSize == 0) {
            emit RebalanceCallbackReceived(poolId, 0, nonce);
            return;
        }

        uint256 cap = hedge.totalHedgeSize * REBALANCE_CAP_BPS / BPS_DENOMINATOR;
        if (cap == 0) cap = 1;
        int256 applied = deltaSize;
        uint256 absDelta = applied >= 0 ? uint256(applied) : uint256(-applied);
        if (absDelta > cap) {
            applied = applied >= 0 ? int256(cap) : -int256(cap);
            emit RebalanceCapped(poolId, deltaSize, applied);
        }

        if (applied > 0) {
            PERP_ADAPTER.resizeShort(hedge.perpPositionId, applied);
            hedge.totalHedgeSize += uint256(applied);
        } else {
            uint256 reduction = uint256(-applied);
            if (reduction >= hedge.totalHedgeSize) {
                reduction = hedge.totalHedgeSize - 1;
                applied = -int256(reduction);
            }
            PERP_ADAPTER.resizeShort(hedge.perpPositionId, -int256(reduction));
            hedge.totalHedgeSize -= reduction;
        }
        hedge.lastRebalanceBlock = block.number;

        emit RebalanceCallbackReceived(poolId, applied, nonce);
    }

    // ============ ADMIN ============

    /// @notice Sets / rotates the address authorized to call rebalanceCallback.
    function setReactiveCallback(address _new) external onlyAdmin {
        emit ReactiveCallbackUpdated(reactiveCallback, _new);
        reactiveCallback = _new;
    }

    /// @notice Demo-only: route fee revenue into the vault.
    /// @dev Admin must approve vault to pull `amount` of the underlying first. Production
    ///      replaces this path with afterSwapReturnDelta extraction.
    function notifyFees(bytes32 poolId, uint256 amount) external onlyAdmin {
        VAULT.depositFromHook(amount);
        emit FeesNotified(poolId, amount);
    }

    // ============ INTERNAL ============

    function _positionKey(address lp, bytes32 poolId, int24 lower, int24 upper) internal pure returns (bytes32) {
        return keccak256(abi.encode(lp, poolId, lower, upper));
    }
}
