// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {MockPerpAdapter} from "../src/adapters/MockPerpAdapter.sol";
import {IPriceOracle} from "../src/oracles/IPriceOracle.sol";

/// @dev Settable mock for unit tests; not part of production contracts.
contract MockPriceOracle is IPriceOracle {
    uint256 public price;

    constructor(uint256 _initialPrice) {
        price = _initialPrice;
    }

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getPrice() external view returns (uint256) {
        return price;
    }
}

contract MockPerpAdapterTest is Test {
    MockPerpAdapter adapter;
    MockPriceOracle oracle;

    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);

    uint256 constant SCALE = 1e18;
    uint256 constant INITIAL_PRICE = 3500e18; // $3500/ETH
    int256 constant INITIAL_FUNDING_BPS = 1000; // 10% APR, shorts earn

    function setUp() public {
        oracle = new MockPriceOracle(INITIAL_PRICE);
        adapter = new MockPerpAdapter(address(oracle), INITIAL_FUNDING_BPS);
    }

    // ============ openShort ============

    function test_OpenShort_StoresPosition() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        (
            address owner,
            uint256 size,
            uint256 entryPrice,
            uint256 lastFundingBlock,
            int256 accruedFunding,
            int256 realizedPnL,
            bool open
        ) = adapter.positions(id);

        assertEq(owner, ALICE);
        assertEq(size, 1e18);
        assertEq(entryPrice, INITIAL_PRICE);
        assertEq(lastFundingBlock, block.number);
        assertEq(accruedFunding, 0);
        assertEq(realizedPnL, 0);
        assertTrue(open);
    }

    function test_OpenShort_RevertsOnZeroSize() public {
        vm.expectRevert(MockPerpAdapter.ZeroSize.selector);
        adapter.openShort(0);
    }

    function test_OpenShort_IncrementsCounter() public {
        bytes32 id1 = adapter.openShort(1e18);
        bytes32 id2 = adapter.openShort(2e18);
        assertEq(id1, bytes32(uint256(1)));
        assertEq(id2, bytes32(uint256(2)));
    }

    // ============ getPositionValue ============

    function test_GetPositionValue_ReturnsCurrentNotional() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);
        // 1 ETH short at $3500 mark = $3500 notional
        assertEq(adapter.getPositionValue(id), 3500e18);

        oracle.setPrice(3000e18);
        // Same size, lower mark = $3000 notional
        assertEq(adapter.getPositionValue(id), 3000e18);
    }

    function test_GetPositionValue_ZeroAfterClose() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(1e18);
        adapter.closeShort(id);
        vm.stopPrank();
        assertEq(adapter.getPositionValue(id), 0);
    }

    // ============ funding accrual ============

    function test_FundingAccrued_AfterOneYear() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        // Advance one year worth of blocks
        vm.roll(block.number + adapter.BLOCKS_PER_YEAR());

        // Expected: 1 ETH * $3500 * 10% = $350 in 1e18 scale
        int256 funding = adapter.getFundingAccrued(id);
        assertEq(funding, 350e18);
    }

    function test_FundingAccrued_HalfYear() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.roll(block.number + adapter.BLOCKS_PER_YEAR() / 2);

        // $175 expected
        int256 funding = adapter.getFundingAccrued(id);
        assertEq(funding, 175e18);
    }

    function test_FundingAccrued_NegativeRate() public {
        adapter.setFundingRate(-500); // shorts PAY 5% APR
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.roll(block.number + adapter.BLOCKS_PER_YEAR());

        // Expected: -1 * $175 = -$175 (5% of $3500)
        int256 funding = adapter.getFundingAccrued(id);
        assertEq(funding, -175e18);
    }

    // ============ resizeShort ============

    function test_ResizeShort_IncreaseAveragesEntryPrice() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18); // 1 ETH at $3500

        oracle.setPrice(3000e18);

        vm.prank(ALICE);
        adapter.resizeShort(id, 1e18); // add another 1 ETH at $3000

        (, uint256 size, uint256 entryPrice,,,,) = adapter.positions(id);
        assertEq(size, 2e18);
        // Weighted avg: (1e18 * 3500 + 1e18 * 3000) / 2 = 3250
        assertEq(entryPrice, 3250e18);
    }

    function test_ResizeShort_DecreaseRealizesPnL_Profitable() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(2e18); // 2 ETH at $3500

        oracle.setPrice(3000e18); // price drops, short profits

        vm.prank(ALICE);
        adapter.resizeShort(id, -1e18); // close 1 ETH

        (, uint256 size,,,, int256 realizedPnL,) = adapter.positions(id);
        assertEq(size, 1e18);
        // Realized: 1 ETH * ($3500 - $3000) = $500
        assertEq(realizedPnL, 500e18);
    }

    function test_ResizeShort_RevertsOnFullClose() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.prank(ALICE);
        vm.expectRevert(MockPerpAdapter.ResizeWouldFullyClose.selector);
        adapter.resizeShort(id, -1e18);
    }

    function test_ResizeShort_RevertsOnZeroDelta() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.prank(ALICE);
        vm.expectRevert(MockPerpAdapter.InvalidDelta.selector);
        adapter.resizeShort(id, 0);
    }

    function test_ResizeShort_RevertsOnNotOwner() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.prank(BOB);
        vm.expectRevert(MockPerpAdapter.NotOwner.selector);
        adapter.resizeShort(id, 1e17);
    }

    function test_ResizeShort_RevertsOnClosed() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(1e18);
        adapter.closeShort(id);

        vm.expectRevert(MockPerpAdapter.PositionNotOpen.selector);
        adapter.resizeShort(id, 1e17);
        vm.stopPrank();
    }

    // ============ closeShort ============

    function test_CloseShort_ReturnsZeroAtSamePrice() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(1e18);
        int256 pnl = adapter.closeShort(id);
        vm.stopPrank();
        // No price move, no time elapsed -> zero PnL.
        assertEq(pnl, 0);
    }

    function test_CloseShort_ProfitOnPriceDrop() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(1e18); // 1 ETH at $3500
        vm.stopPrank();

        oracle.setPrice(3200e18); // drops $300

        vm.prank(ALICE);
        int256 pnl = adapter.closeShort(id);
        // $300 profit on 1 ETH short
        assertEq(pnl, 300e18);
    }

    function test_CloseShort_LossOnPriceRise() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(1e18);
        vm.stopPrank();

        oracle.setPrice(3700e18); // rises $200

        vm.prank(ALICE);
        int256 pnl = adapter.closeShort(id);
        assertEq(pnl, -200e18);
    }

    function test_CloseShort_IncludesFunding() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.roll(block.number + adapter.BLOCKS_PER_YEAR());

        vm.prank(ALICE);
        int256 pnl = adapter.closeShort(id);
        // No price move, but 1 year funding at 10% on $3500 = $350.
        assertEq(pnl, 350e18);
    }

    function test_CloseShort_IncludesRealizedPnLFromPartialClose() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(2e18); // 2 ETH at $3500
        vm.stopPrank();

        oracle.setPrice(3000e18);
        vm.prank(ALICE);
        adapter.resizeShort(id, -1e18); // realize $500

        oracle.setPrice(3200e18); // partial recovery
        vm.prank(ALICE);
        int256 pnl = adapter.closeShort(id);
        // Realized: $500 (from partial close at $3000)
        // Unrealized on remaining 1 ETH at $3200 mark, entry still $3500: $300
        assertEq(pnl, 800e18);
    }

    function test_CloseShort_RevertsOnNotOwner() public {
        vm.prank(ALICE);
        bytes32 id = adapter.openShort(1e18);

        vm.prank(BOB);
        vm.expectRevert(MockPerpAdapter.NotOwner.selector);
        adapter.closeShort(id);
    }

    function test_CloseShort_RevertsOnClosed() public {
        vm.startPrank(ALICE);
        bytes32 id = adapter.openShort(1e18);
        adapter.closeShort(id);
        vm.expectRevert(MockPerpAdapter.PositionNotOpen.selector);
        adapter.closeShort(id);
        vm.stopPrank();
    }

    // ============ admin ============

    function test_SetFundingRate_OnlyAdmin() public {
        vm.prank(ALICE);
        vm.expectRevert(MockPerpAdapter.NotAdmin.selector);
        adapter.setFundingRate(500);
    }

    function test_SetFundingRate_UpdatesRate() public {
        adapter.setFundingRate(500);
        assertEq(adapter.fundingRateAnnualBps(), 500);
    }
}
