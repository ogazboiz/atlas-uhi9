// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AbstractCallback} from "reactive-lib/abstract-base/AbstractCallback.sol";

interface IAtlasHook {
    function rebalanceFromReactive(bytes32 poolId, int256 deltaSize, uint256 nonce, uint256 deadline) external;
}

/// @title AtlasCallback
/// @notice Sits on the pool chain (Unichain Sepolia). Receives cross-chain callbacks
///         from the Reactive Network relayer and forwards them to AtlasHook.
/// @dev Inherits AbstractCallback which gives us `rvmIdOnly(_rvm_id)` to validate the
///      callback was actually invoked by the registered ReactVM. The hook itself further
///      restricts to `msg.sender == reactiveCallback`, giving two-layer auth.
///
///      Pattern adopted from PerpHinge's PerpHingeCallback (24 LOC) and vfa-hooks'
///      SettlementExecutor (auth isolation from market economics). We keep this contract
///      thin: validate, forward, log.
contract AtlasCallback is AbstractCallback {
    /// @dev The hook on the same chain that owns the hedge state.
    IAtlasHook public immutable HOOK;

    event RebalanceForwarded(bytes32 indexed poolId, int256 deltaSize, uint256 nonce, bool success);
    event CallbackFailed(bytes32 indexed poolId, bytes reason);

    /// @param _callbackSender Reactive Network's official callback proxy on this chain.
    /// @param _hook           Deployed AtlasHook address on the same chain.
    constructor(address _callbackSender, address _hook) AbstractCallback(_callbackSender) payable {
        HOOK = IAtlasHook(_hook);
    }

    /// @notice Forwarded entrypoint from the Reactive Network relayer.
    /// @dev Signature must match the payload encoded by AtlasReactive.react().
    ///      `_rvm_id` is injected by RN and validated by rvmIdOnly.
    function rebalanceHedge(
        address _rvm_id,
        bytes32 poolId,
        int256 deltaSize,
        uint256 nonce,
        uint256 deadline
    ) external rvmIdOnly(_rvm_id) {
        try HOOK.rebalanceFromReactive(poolId, deltaSize, nonce, deadline) {
            emit RebalanceForwarded(poolId, deltaSize, nonce, true);
        } catch (bytes memory reason) {
            // Swallow hook reverts so a single bad nonce doesn't brick the RVM pipeline.
            // The hook's own RebalanceCapped / NonceUsed / CallbackExpired guarantees are
            // already on-chain; this catch just keeps the RVM healthy.
            emit RebalanceForwarded(poolId, deltaSize, nonce, false);
            emit CallbackFailed(poolId, reason);
        }
    }

    receive() external payable override {}
}
