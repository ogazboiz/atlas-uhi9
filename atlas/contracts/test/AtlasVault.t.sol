// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

import {AtlasVault} from "../src/AtlasVault.sol";

contract AtlasVaultTest is Test {
    AtlasVault vault;
    ERC20Mock asset;

    address constant HOOK = address(0xBEEF);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);

    uint256 constant TARGET_COUPON = 800; // 8% APR
    uint256 constant MAX_COUPON = 1500; // 15% cap

    function setUp() public {
        asset = new ERC20Mock();
        vault = new AtlasVault(asset, HOOK, TARGET_COUPON, MAX_COUPON);

        asset.mint(ALICE, 100_000e18);
        asset.mint(BOB, 100_000e18);
        asset.mint(HOOK, 100_000e18);

        vm.prank(ALICE);
        asset.approve(address(vault), type(uint256).max);
        vm.prank(BOB);
        asset.approve(address(vault), type(uint256).max);
        vm.prank(HOOK);
        asset.approve(address(vault), type(uint256).max);
    }

    // ============ initialization ============

    function test_Constructor_SetsImmutables() public view {
        assertEq(vault.HOOK(), HOOK);
        assertEq(vault.TARGET_COUPON_BPS(), TARGET_COUPON);
        assertEq(vault.MAX_COUPON_BPS(), MAX_COUPON);
        assertEq(vault.couponBps(), TARGET_COUPON);
        assertEq(vault.name(), "Atlas LP - WETH/USDC");
        assertEq(vault.symbol(), "aLP-WETH-USDC");
    }

    function test_Constructor_RevertsIfInitialAboveMax() public {
        vm.expectRevert(AtlasVault.InitialCouponAboveMax.selector);
        new AtlasVault(asset, HOOK, MAX_COUPON + 1, MAX_COUPON);
    }

    // ============ deposit / withdraw ============

    function test_Deposit_MintsSharesAndUpdatesLastAssets() public {
        vm.prank(ALICE);
        uint256 shares = vault.deposit(1_000e18, ALICE);
        assertEq(shares, 1_000e18); // first deposit is 1:1
        assertEq(vault.balanceOf(ALICE), 1_000e18);
        assertEq(vault.lastAssets(), 1_000e18);
        assertEq(asset.balanceOf(address(vault)), 1_000e18);
    }

    function test_Withdraw_BurnsSharesAndReturnsAssets() public {
        vm.startPrank(ALICE);
        vault.deposit(1_000e18, ALICE);
        uint256 burned = vault.withdraw(500e18, ALICE, ALICE);
        vm.stopPrank();

        assertEq(burned, 500e18);
        assertEq(vault.balanceOf(ALICE), 500e18);
        assertEq(asset.balanceOf(ALICE), 99_500e18); // 100k - 1k deposit + 500 withdrawn
    }

    function test_SecondDeposit_PreservesExchangeRate() public {
        vm.prank(ALICE);
        vault.deposit(1_000e18, ALICE);

        vm.prank(BOB);
        uint256 bobShares = vault.deposit(2_000e18, BOB);

        // Same block, no coupon accrual; ratio stays 1:1
        assertEq(bobShares, 2_000e18);
    }

    // ============ lazy coupon accrual ============

    function test_TotalAssets_GrowsOverBlocks() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        // Roll forward exactly one year
        vm.roll(block.number + vault.BLOCKS_PER_YEAR());

        // 8% of 10,000 = 800
        assertEq(vault.totalAssets(), 10_800e18);
    }

    function test_TotalAssets_HalfYearAccruesHalf() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        vm.roll(block.number + vault.BLOCKS_PER_YEAR() / 2);

        // 4% of 10,000 = 400
        assertEq(vault.totalAssets(), 10_400e18);
    }

    function test_PreviewRedeem_ReflectsAccruedCoupon() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        vm.roll(block.number + vault.BLOCKS_PER_YEAR());

        // Alice should be able to redeem 10,800 worth (8% coupon on 10k principal).
        // 1-wei tolerance for OZ ERC-4626 virtual share/asset rounding.
        uint256 redeemAmount = vault.previewRedeem(vault.balanceOf(ALICE));
        assertApproxEqAbs(redeemAmount, 10_800e18, 1);
    }

    function test_AccrueCoupon_MaterializesOnDeposit() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        vm.roll(block.number + vault.BLOCKS_PER_YEAR());

        vm.prank(BOB);
        vault.deposit(1e18, BOB); // triggers accrual

        // After materialization, lastAssets reflects accrued growth + new deposit
        assertEq(vault.lastAssets(), 10_801e18);
    }

    // ============ depositFromHook (fee inflow) ============

    function test_DepositFromHook_OnlyHook() public {
        vm.prank(ALICE);
        vm.expectRevert(AtlasVault.NotHook.selector);
        vault.depositFromHook(100e18);
    }

    function test_DepositFromHook_GrowsBalanceNotObligation() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        vm.prank(HOOK);
        vault.depositFromHook(500e18);

        // lastAssets stays at deposit principal (obligation didn't change)
        assertEq(vault.lastAssets(), 10_000e18);
        // Vault balance includes the fee inflow
        assertEq(asset.balanceOf(address(vault)), 10_500e18);
        // Buffer = vault balance - obligation = 500
    }

    // ============ buffer health ============

    function test_BufferHealth_ZeroWhenNoSurplus() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);
        // Surplus = vault.balance(10000) - obligation(10000) = 0
        assertEq(vault.bufferHealth(), 0);
    }

    function test_BufferHealth_ScalesWithBuffer() public {
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        vm.prank(HOOK);
        vault.depositFromHook(200e18); // small buffer

        // 30-day obligation = 10000 * 800/10000 * 30/365 ≈ 65.75
        // 200 / 65.75 ≈ 3.04x ≈ 30410 bps
        uint256 health = vault.bufferHealth();
        assertGe(health, 30_000); // > 3.0x
        assertLe(health, 31_000); // < 3.1x
    }

    function test_BufferHealth_MaxWhenNoObligation() public view {
        // Pre-deposit state: no shares, no obligation
        assertEq(vault.bufferHealth(), type(uint256).max);
    }

    // ============ auto pause + halve ============

    function test_LowBuffer_PausesDepositsAndHalvesCoupon() public {
        // Stage: deposit, then drain via withdrawal to leave principal but no fee buffer.
        // Easier: deposit, accrue coupon, then trigger buffer check.
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);

        // Time passes; obligation grows but no fee inflow.
        vm.roll(block.number + vault.BLOCKS_PER_YEAR() / 12); // ~1 month

        // Trigger evaluation via a fresh deposit from BOB (will accrue coupon first).
        vm.prank(BOB);
        vault.deposit(1e18, BOB);

        // Now obligation > vault balance (since fees never came), buffer = 0 (health = 0)
        assertEq(vault.bufferHealth(), 0);
        assertTrue(vault.depositsPaused());
        assertLt(vault.couponBps(), TARGET_COUPON); // halved
    }

    function test_PausedDeposit_Reverts() public {
        // Force into paused state
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);
        vm.roll(block.number + vault.BLOCKS_PER_YEAR() / 12);
        vm.prank(BOB);
        vault.deposit(1e18, BOB);

        assertTrue(vault.depositsPaused());

        vm.prank(BOB);
        vm.expectRevert(AtlasVault.DepositsPaused.selector);
        vault.deposit(1e18, BOB);
    }

    function test_BufferRecovery_RestoresCoupon() public {
        // Step 1: trigger low buffer
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);
        vm.roll(block.number + vault.BLOCKS_PER_YEAR() / 12);
        vm.prank(BOB);
        vault.deposit(1e18, BOB);
        assertTrue(vault.depositsPaused());
        uint256 reducedCoupon = vault.couponBps();
        assertLt(reducedCoupon, TARGET_COUPON);

        // Step 2: heavy fee inflow restores buffer
        vm.prank(HOOK);
        vault.depositFromHook(5_000e18);

        // Buffer should now be healthy and coupon restored
        assertGe(vault.bufferHealth(), vault.BUFFER_HEALTHY_BPS());
        assertEq(vault.couponBps(), TARGET_COUPON);
        assertFalse(vault.depositsPaused());
    }

    // ============ withdrawal under low buffer ============

    function test_Withdraw_StillWorksWhenPaused() public {
        // Force pause
        vm.prank(ALICE);
        vault.deposit(10_000e18, ALICE);
        vm.roll(block.number + vault.BLOCKS_PER_YEAR() / 12);
        vm.prank(BOB);
        vault.deposit(1e18, BOB);
        assertTrue(vault.depositsPaused());

        // Top up the vault so the underlying withdraw transfer succeeds.
        vm.prank(HOOK);
        vault.depositFromHook(1_000e18);

        // Alice can still withdraw (her principal, not full promised amount because
        // there may not be enough; we just check the call succeeds for a small amount).
        vm.prank(ALICE);
        vault.withdraw(100e18, ALICE, ALICE);
    }
}
