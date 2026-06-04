// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

import {AtlasVault} from "../src/AtlasVault.sol";

/// @title AtlasVault tests
/// @notice Unit tests for ERC-4626 mechanics, lazy coupon accrual, and buffer health.
contract AtlasVaultTest is Test {
    AtlasVault vault;
    ERC20Mock underlying;

    address constant HOOK = address(0xBEEF);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);

    function setUp() public {
        underlying = new ERC20Mock();
        vault = new AtlasVault(underlying, HOOK, 800, 1500); // 8% coupon, 15% cap
    }

    function test_DepositMintsShares() public {
        // TODO: alice deposits, expect proportional shares minted
    }

    function test_WithdrawBurnsSharesAndReturnsAssets() public {
        // TODO: deposit then withdraw, assert balances match
    }

    function test_LazyCouponAccrualAfterTime() public {
        // TODO: deposit, vm.roll forward, previewRedeem should reflect accrued coupon
    }

    function test_BufferHealth_ReportsCorrectRatio() public {
        // TODO: deposit, simulate fee inflows, assert bufferHealth in expected range
    }

    function test_BufferLow_PausesDepositsAndHalvesCoupon() public {
        // TODO: drain buffer below 0.5x, deposit should revert, couponBps should halve
    }

    function test_CouponCappedAtMax() public {
        // TODO: try to set coupon above maxCouponBps, expect revert
    }

    function test_DepositFromHook_OnlyHook() public {
        // TODO: call depositFromHook from non-hook address, expect NotHook revert
    }
}
