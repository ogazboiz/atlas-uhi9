// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";

import {AtlasHook} from "../src/AtlasHook.sol";

/// @title AtlasHook tests
/// @notice Unit tests for the Atlas hook lifecycle: deposit, hedge open, rebalance, withdraw.
/// @dev Coverage target: 80%+ per ../tech-stack.md.
contract AtlasHookTest is Test {
    AtlasHook hook;

    function setUp() public {
        // TODO: deploy mocks for PoolManager, vault, perpAdapter, RSC
        // TODO: mine hook address with required permissions
        // TODO: deploy AtlasHook
    }

    function test_HedgeOpensOnAddLiquidity() public {
        // TODO: trigger afterAddLiquidity, assert perpAdapter.openShort was called with correct size
    }

    function test_HedgeClosesOnRemoveLiquidity() public {
        // TODO: open hedge, then remove liquidity, assert perpAdapter.closeShort was called
    }

    function test_RebalanceCallback_OnlyFromRSC() public {
        // TODO: call rebalanceCallback from non-RSC address, expect revert NotReactiveCallback
    }

    function test_RebalanceCallback_NonceReplayReverts() public {
        // TODO: call with same nonce twice, expect NonceUsed revert
    }

    function test_RebalanceCallback_ExpiredDeadlineReverts() public {
        // TODO: call with past deadline, expect CallbackExpired revert
    }

    function test_RebalanceCallback_DeltaCapped() public {
        // TODO: call with delta > rebalanceCapBps, expect cap applied and RebalanceCapped event
    }
}
