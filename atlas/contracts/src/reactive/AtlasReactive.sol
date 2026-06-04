// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AtlasReactive
/// @notice Reactive Smart Contract deployed on Reactive Network. Subscribes to:
///         (a) Chainlink ETH/USD price feed events on Sepolia
///         (b) Pool Swap events on Unichain Sepolia
///         Computes oracle-vs-pool divergence and fires `rebalanceCallback` on AtlasHook
///         (destination: Unichain Sepolia) when divergence exceeds threshold.
/// @dev See ../architecture.md section 5 for the cross-chain message schema and
///      ../user-flow.md flow 3 for the autonomous rebalance sequence.
///
/// IMPLEMENTATION NOTES:
///   - Inherits from Reactive Network's IReactive base contract (TODO: import once SDK pinned).
///   - The `react` function is the RSC entrypoint invoked by the RN runtime on subscribed events.
///   - Emits cross-chain callback via the RN protocol (TODO: confirm exact call shape).
contract AtlasReactive {
    // ============ STORAGE ============

    /// @dev The Chainlink price feed on the origin chain (Sepolia for hackathon).
    address public chainlinkFeed;

    /// @dev The pool address on the destination chain whose swaps we monitor.
    address public poolAddress;

    /// @dev The AtlasHook address on the destination chain to call back.
    address public atlasHook;

    /// @dev Divergence threshold in basis points. Above this, fire rebalance.
    uint256 public rebalanceThresholdBps;

    /// @dev Cooldown between callbacks (in destination-chain blocks).
    uint256 public cooldownBlocks;

    /// @dev Block of the last issued callback.
    uint256 public lastCallbackBlock;

    /// @dev Monotonically increasing nonce for callback anti-replay.
    uint256 public callbackNonce;

    /// @dev Last observed oracle price (1e18 scaled).
    uint256 public lastOraclePrice;

    /// @dev Last observed pool price (1e18 scaled).
    uint256 public lastPoolPrice;

    // ============ EVENTS ============

    event SubscriptionsRegistered();
    event DivergenceObserved(uint256 oraclePrice, uint256 poolPrice, uint256 divergenceBps);
    event CallbackDispatched(uint256 nonce, int256 delta);

    // ============ CONSTRUCTOR ============

    constructor(
        address _chainlinkFeed,
        address _poolAddress,
        address _atlasHook,
        uint256 _rebalanceThresholdBps,
        uint256 _cooldownBlocks
    ) {
        chainlinkFeed = _chainlinkFeed;
        poolAddress = _poolAddress;
        atlasHook = _atlasHook;
        rebalanceThresholdBps = _rebalanceThresholdBps;
        cooldownBlocks = _cooldownBlocks;
    }

    // ============ REACTIVE ENTRYPOINT ============

    /// @notice Called by the Reactive Network runtime on each subscribed event.
    /// @dev TODO: signature must match RN's IReactive once SDK is integrated.
    function react(
        uint256 chainId,
        address emitter,
        uint256 topic0,
        uint256 topic1,
        uint256 topic2,
        uint256 topic3,
        bytes calldata data,
        uint256 blockNumber,
        uint256 opCode
    ) external {
        // TODO: distinguish event source by (chainId, emitter, topic0)
        // TODO: if Chainlink price update: update lastOraclePrice from data
        // TODO: if pool Swap: update lastPoolPrice from tick
        // TODO: compute divergence, fire callback if threshold breached and cooldown elapsed
    }

    // ============ INTERNAL ============

    /// @dev Computes the divergence between oracle and pool prices in basis points.
    function _computeDivergenceBps(uint256 oracle, uint256 pool) internal pure returns (uint256) {
        // TODO: return abs(oracle - pool) * 10000 / oracle
    }

    /// @dev Constructs and emits the cross-chain callback to AtlasHook.
    function _dispatchCallback(int256 delta) internal {
        // TODO: increment nonce, build RebalanceCallbackData, emit RN cross-chain message
    }
}
