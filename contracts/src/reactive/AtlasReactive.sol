// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";
import {IReactive} from "reactive-lib/interfaces/IReactive.sol";

/// @title AtlasReactive
/// @notice Reactive Smart Contract deployed on Reactive Network (Lasna testnet, chain 5318007).
///         Subscribes to MockPriceOracle.PriceUpdated events on Unichain Sepolia (chain 1301)
///         and fires a cross-chain callback to AtlasCallback whenever the price moves enough
///         to warrant a hedge rebalance.
/// @dev MODEL:
///        - RSC listens to PriceUpdated(oldPrice, newPrice) emitted by MockPriceOracle.
///        - On every event, increments a nonce, computes a signed delta proportional to
///          the price change percentage, and emits Callback to the destination chain.
///        - AtlasCallback on Unichain receives the call, forwards to AtlasHook.
///        - Hook validates msg.sender == reactiveCallback and applies the rebalance.
///
///      DESIGN NOTES adopted from PerpHinge and vfa-hooks winners:
///        - service.subscribe() gated by `if (!vm)` so unit tests don't pre-attempt subscriptions.
///        - react() takes IReactive.LogRecord and dispatches on topic_0.
///        - Indexed event args read from log.topic_1, topic_2, topic_3.
///        - Non-indexed args decoded from log.data via abi.decode.
///        - Callback payload uses primitives (not encoded structs) and includes a leading
///          `address(0)` placeholder for the RVM ID injected by the relayer.
contract AtlasReactive is AbstractReactive {
    // ============ CONSTANTS ============

    /// @dev Reactive Network destination is Unichain Sepolia in this deployment.
    uint256 public constant DESTINATION_CHAIN_ID = 1301;

    /// @dev Gas budget for the destination-side callback.
    uint64 public constant CALLBACK_GAS = 500_000;

    /// @dev keccak256("PriceUpdated(uint256,uint256)") — emitted by MockPriceOracle.
    uint256 public constant PRICE_UPDATED_TOPIC = uint256(keccak256("PriceUpdated(uint256,uint256)"));

    // ============ STORAGE ============

    /// @dev Owner that deployed the RSC (also pays the subscription fee). Set in constructor.
    address public owner;

    /// @dev Oracle address on the destination chain that this RSC subscribes to.
    address public oracleOnDestination;

    /// @dev AtlasCallback address on the destination chain that we relay through.
    address public callbackOnDestination;

    /// @dev Pool ID used to address the hedge on the destination side. Configurable so the
    ///      same RSC can serve multiple pools later.
    bytes32 public poolId;

    /// @dev Monotonically increasing callback nonce, consumed by the hook for anti-replay.
    uint256 public callbackNonce;

    /// @dev Tracked last-seen price (1e18 scaled).
    uint256 public lastObservedPrice;

    /// @dev Minimum price change in basis points to trigger a callback.
    uint256 public thresholdBps;

    /// @dev True once subscribe() has been called.
    bool public subscribed;

    // ============ EVENTS ============

    event SubscribedToOracle(uint256 chainId, address oracle);
    event PriceObserved(uint256 oldPrice, uint256 newPrice, uint256 divergenceBps);
    event CallbackDispatched(uint256 indexed nonce, int256 deltaSize, uint256 deadline);
    event BelowThreshold(uint256 divergenceBps);

    // ============ CONSTRUCTOR ============

    /// @param _oracle           MockPriceOracle address on the destination chain.
    /// @param _callback         AtlasCallback address on the destination chain.
    /// @param _poolId           Atlas pool ID (keccak of PoolKey) on the destination chain.
    /// @param _thresholdBps     Minimum divergence (bps) to fire a callback. Use 0 to fire on every change.
    constructor(address _oracle, address _callback, bytes32 _poolId, uint256 _thresholdBps) payable {
        owner = msg.sender;
        oracleOnDestination = _oracle;
        callbackOnDestination = _callback;
        poolId = _poolId;
        thresholdBps = _thresholdBps;
        // Subscriptions are initialized post-deploy via initSubscriptions().
        // Pattern adopted from vfa-hooks: deploy + fund + subscribe as separate steps
        // so the contract balance is settled before paying the system contract fee.
    }

    /// @notice One-shot subscription initializer. Owner-only, runs on the Reactive Network.
    function initSubscriptions() external rnOnly {
        require(msg.sender == owner, "owner only");
        require(!subscribed, "already subscribed");
        subscribed = true;
        service.subscribe(
            DESTINATION_CHAIN_ID,
            oracleOnDestination,
            PRICE_UPDATED_TOPIC,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        emit SubscribedToOracle(DESTINATION_CHAIN_ID, oracleOnDestination);
    }

    // ============ REACTIVE ENTRYPOINT ============

    /// @dev Called by the Reactive Network runtime for each matching log on the origin chain.
    function react(IReactive.LogRecord calldata log) external vmOnly {
        // Only respond to PriceUpdated from our configured oracle.
        if (log.topic_0 != PRICE_UPDATED_TOPIC) return;
        if (log._contract != oracleOnDestination) return;

        // PriceUpdated(uint256 oldPrice, uint256 newPrice) — both non-indexed.
        (uint256 oldPrice, uint256 newPrice) = abi.decode(log.data, (uint256, uint256));

        // Compute divergence in basis points. Use newPrice as the reference for direction.
        uint256 divergenceBps;
        if (newPrice >= oldPrice) {
            divergenceBps = oldPrice == 0 ? type(uint256).max : (newPrice - oldPrice) * 10_000 / oldPrice;
        } else {
            divergenceBps = (oldPrice - newPrice) * 10_000 / oldPrice;
        }

        emit PriceObserved(oldPrice, newPrice, divergenceBps);

        if (divergenceBps < thresholdBps) {
            emit BelowThreshold(divergenceBps);
            return;
        }

        // Signed delta: positive = grow short (price dropped); negative = shrink short (price rose).
        // Scale: 10^14 wei per 1bp of divergence. Hook caps the magnitude anyway.
        int256 deltaSize = newPrice < oldPrice
            ? int256(divergenceBps * 1e14)
            : -int256(divergenceBps * 1e14);

        callbackNonce += 1;
        uint256 deadline = block.timestamp + 600; // 10 minutes

        bytes memory payload = abi.encodeWithSignature(
            "rebalanceHedge(address,bytes32,int256,uint256,uint256)",
            address(0), // RVM ID slot, filled by the relayer
            poolId,
            deltaSize,
            callbackNonce,
            deadline
        );

        emit Callback(DESTINATION_CHAIN_ID, callbackOnDestination, CALLBACK_GAS, payload);
        emit CallbackDispatched(callbackNonce, deltaSize, deadline);

        lastObservedPrice = newPrice;
    }

    // ============ ADMIN ============

    /// @notice Force a fresh subscribe call. Useful if the previous subscribe was unwound.
    function resubscribe() external rnOnly {
        require(msg.sender == owner, "owner only");
        service.subscribe(
            DESTINATION_CHAIN_ID,
            oracleOnDestination,
            PRICE_UPDATED_TOPIC,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        emit SubscribedToOracle(DESTINATION_CHAIN_ID, oracleOnDestination);
    }

    /// @notice Update the configured threshold (in bps).
    function setThreshold(uint256 newThresholdBps) external rnOnly {
        require(msg.sender == owner, "owner only");
        thresholdBps = newThresholdBps;
    }
}
