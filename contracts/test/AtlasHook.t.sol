// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";

import {AtlasHook} from "../src/AtlasHook.sol";
import {AtlasVault} from "../src/AtlasVault.sol";
import {MockPerpAdapter} from "../src/adapters/MockPerpAdapter.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";

/// @title AtlasHookTest
/// @notice Unit tests for AtlasHook callbacks.
/// @dev The test contract acts as both the deployer (admin) AND the PoolManager so that
///      onlyPoolManager-guarded entrypoints can be called directly without a real v4
///      stack. Hook address is mined via HookMiner so BaseHook's address validation
///      passes.
contract AtlasHookTest is Test {
    using PoolIdLibrary for PoolKey;

    AtlasHook hook;
    AtlasVault vault;
    MockPerpAdapter perpAdapter;
    MockPriceOracle oracle;
    ERC20Mock asset;

    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant RSC = address(0xCAFE);

    PoolKey poolKey;
    bytes32 poolIdRaw;

    function setUp() public {
        asset = new ERC20Mock();
        oracle = new MockPriceOracle(3500e18);
        perpAdapter = new MockPerpAdapter(address(oracle), 1000);
        vault = new AtlasVault(asset, 800, 1500);

        uint160 flags = uint160(
            Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
        );

        bytes memory ctorArgs = abi.encode(
            IPoolManager(address(this)),
            vault,
            perpAdapter,
            true, // volatile is currency0
            address(this) // admin
        );

        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), flags, type(AtlasHook).creationCode, ctorArgs);

        hook = new AtlasHook{salt: salt}(
            IPoolManager(address(this)), vault, perpAdapter, true, address(this)
        );
        require(address(hook) == hookAddr, "hook address mismatch");

        vault.setHook(address(hook));
        hook.setReactiveCallback(RSC);

        poolKey = PoolKey({
            currency0: Currency.wrap(address(0xA0)),
            currency1: Currency.wrap(address(0xB0)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolIdRaw = PoolId.unwrap(poolKey.toId());

        asset.mint(address(this), 1_000_000e18);
        asset.approve(address(vault), type(uint256).max);
    }

    function _params() internal pure returns (ModifyLiquidityParams memory) {
        return ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 1e18, salt: bytes32(0)});
    }

    // ============ afterAddLiquidity ============

    function test_AfterAddLiquidity_OpensHedgeOnFirstDeposit() public {
        BalanceDelta delta = toBalanceDelta(int128(-1e18), int128(-3500e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");

        (, uint256 totalSize,, bool open) = hook.poolHedges(poolIdRaw);
        assertTrue(open);
        assertEq(totalSize, 1e18);
    }

    function test_AfterAddLiquidity_ResizesHedgeOnSecondDeposit() public {
        BalanceDelta delta = toBalanceDelta(int128(-1e18), int128(-3500e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");
        hook.afterAddLiquidity(BOB, poolKey, _params(), delta, toBalanceDelta(0, 0), "");

        (, uint256 totalSize,, bool open) = hook.poolHedges(poolIdRaw);
        assertTrue(open);
        assertEq(totalSize, 2e18); // two LPs each contribute 1 ETH
    }

    function test_AfterAddLiquidity_TracksLPContribution() public {
        BalanceDelta delta = toBalanceDelta(int128(-2e18), int128(-7000e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");

        bytes32 positionKey = keccak256(abi.encode(ALICE, poolIdRaw, int24(-60), int24(60)));
        assertEq(hook.lpContributions(positionKey), 2e18);
    }

    function test_AfterAddLiquidity_NoOpOnZeroVolatileDelta() public {
        BalanceDelta delta = toBalanceDelta(int128(0), int128(-3500e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");

        (,, , bool open) = hook.poolHedges(poolIdRaw);
        assertFalse(open);
    }

    function test_AfterAddLiquidity_RespectsVolatileCurrencyConfig() public {
        // Redeploy hook configured with VOLATILE_IS_CURRENCY0 = false
        uint160 flags = uint160(
            Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
        );
        AtlasVault v2 = new AtlasVault(asset, 800, 1500);
        bytes memory ctorArgs =
            abi.encode(IPoolManager(address(this)), v2, perpAdapter, false, address(this));
        (address hookAddr2, bytes32 salt2) =
            HookMiner.find(address(this), flags, type(AtlasHook).creationCode, ctorArgs);
        AtlasHook hook2 =
            new AtlasHook{salt: salt2}(IPoolManager(address(this)), v2, perpAdapter, false, address(this));
        require(address(hook2) == hookAddr2);
        v2.setHook(address(hook2));

        // currency1 is now the volatile leg; amount1 of -1e18 should trigger a hedge.
        BalanceDelta delta = toBalanceDelta(int128(-3500e6), int128(-1e18));
        hook2.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");
        (, uint256 size,, bool open) = hook2.poolHedges(poolIdRaw);
        assertTrue(open);
        assertEq(size, 1e18);
    }

    // ============ beforeRemoveLiquidity ============

    function test_BeforeRemoveLiquidity_ClosesHedgeOnFullExit() public {
        BalanceDelta delta = toBalanceDelta(int128(-1e18), int128(-3500e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");

        hook.beforeRemoveLiquidity(ALICE, poolKey, _params(), "");

        (,, , bool open) = hook.poolHedges(poolIdRaw);
        assertFalse(open);
    }

    function test_BeforeRemoveLiquidity_ResizesOnPartialPoolExit() public {
        // Two LPs each contribute 1 ETH; one exits.
        BalanceDelta delta = toBalanceDelta(int128(-1e18), int128(-3500e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");
        hook.afterAddLiquidity(BOB, poolKey, _params(), delta, toBalanceDelta(0, 0), "");

        hook.beforeRemoveLiquidity(ALICE, poolKey, _params(), "");

        (, uint256 size,, bool open) = hook.poolHedges(poolIdRaw);
        assertTrue(open);
        assertEq(size, 1e18); // BOB's 1 ETH remains
    }

    function test_BeforeRemoveLiquidity_NoOpForUnknownPosition() public {
        // Calling without prior add should be a no-op.
        hook.beforeRemoveLiquidity(ALICE, poolKey, _params(), "");
        (,, , bool open) = hook.poolHedges(poolIdRaw);
        assertFalse(open);
    }

    // ============ rebalanceCallback ============

    function _callback(int256 deltaSize, uint256 nonce) internal view returns (AtlasHook.RebalanceCallback memory) {
        return AtlasHook.RebalanceCallback({
            poolId: poolIdRaw,
            deltaSize: deltaSize,
            nonce: nonce,
            deadline: block.timestamp + 100
        });
    }

    function _seedHedge() internal {
        BalanceDelta delta = toBalanceDelta(int128(-10e18), int128(-35000e6));
        hook.afterAddLiquidity(ALICE, poolKey, _params(), delta, toBalanceDelta(0, 0), "");
    }

    function test_RebalanceCallback_OnlyFromRSC() public {
        _seedHedge();
        AtlasHook.RebalanceCallback memory data = _callback(1e17, 1);
        vm.prank(ALICE);
        vm.expectRevert(AtlasHook.NotReactiveCallback.selector);
        hook.rebalanceCallback(data);
    }

    function test_RebalanceCallback_NonceMustBeMonotonic() public {
        _seedHedge();
        vm.prank(RSC);
        hook.rebalanceCallback(_callback(1e17, 5));

        vm.prank(RSC);
        vm.expectRevert(abi.encodeWithSelector(AtlasHook.NonceUsed.selector, uint256(5)));
        hook.rebalanceCallback(_callback(1e17, 5));
    }

    function test_RebalanceCallback_ExpiredDeadlineReverts() public {
        _seedHedge();
        AtlasHook.RebalanceCallback memory data = _callback(1e17, 1);
        data.deadline = block.timestamp - 1;

        vm.prank(RSC);
        vm.expectRevert(abi.encodeWithSelector(AtlasHook.CallbackExpired.selector, data.deadline));
        hook.rebalanceCallback(data);
    }

    function test_RebalanceCallback_PositiveDeltaGrowsHedge() public {
        _seedHedge(); // 10 ETH hedge
        vm.prank(RSC);
        hook.rebalanceCallback(_callback(1e18, 1)); // +1 ETH, within 20% cap

        (, uint256 size,,) = hook.poolHedges(poolIdRaw);
        assertEq(size, 11e18);
    }

    function test_RebalanceCallback_NegativeDeltaShrinksHedge() public {
        _seedHedge();
        vm.prank(RSC);
        hook.rebalanceCallback(_callback(-5e17, 1)); // -0.5 ETH

        (, uint256 size,,) = hook.poolHedges(poolIdRaw);
        assertEq(size, 9_500_000_000_000_000_000); // 9.5 ETH
    }

    function test_RebalanceCallback_CapsLargeDelta() public {
        _seedHedge(); // 10 ETH; 20% cap = 2 ETH
        vm.prank(RSC);
        hook.rebalanceCallback(_callback(5e18, 1)); // try +5 ETH

        (, uint256 size,,) = hook.poolHedges(poolIdRaw);
        assertEq(size, 12e18); // grew by 2 ETH (capped)
    }

    function test_RebalanceCallback_ZeroDeltaIsNoop() public {
        _seedHedge();
        vm.prank(RSC);
        hook.rebalanceCallback(_callback(0, 1));

        (, uint256 size,,) = hook.poolHedges(poolIdRaw);
        assertEq(size, 10e18);
    }

    // ============ admin ============

    function test_SetReactiveCallback_OnlyAdmin() public {
        vm.prank(ALICE);
        vm.expectRevert(AtlasHook.NotAdmin.selector);
        hook.setReactiveCallback(BOB);
    }

    function test_NotifyFees_OnlyAdmin() public {
        vm.prank(ALICE);
        vm.expectRevert(AtlasHook.NotAdmin.selector);
        hook.notifyFees(poolIdRaw, 100e18);
    }

    function test_NotifyFees_DepositsToVault() public {
        // We are admin in setUp. Mint and approve the underlying so vault can pull it.
        // First seed the vault with a deposit so it has shares (otherwise depositFromHook
        // just sits as buffer — that's fine, we just check balance moved).
        asset.approve(address(vault), 1_000e18);
        // For notifyFees, the hook calls vault.depositFromHook(amount). The vault then
        // pulls from msg.sender, which from vault's perspective is the hook. So the hook
        // must approve the vault. Let's emulate that by pranking the hook to approve.
        vm.prank(address(hook));
        asset.approve(address(vault), 1_000e18);
        asset.transfer(address(hook), 500e18);

        hook.notifyFees(poolIdRaw, 500e18);

        assertEq(asset.balanceOf(address(vault)), 500e18);
    }
}
