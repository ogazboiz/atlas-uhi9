// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";

import {AtlasHook} from "../src/AtlasHook.sol";
import {AtlasVault} from "../src/AtlasVault.sol";
import {IPerpAdapter} from "../src/adapters/IPerpAdapter.sol";
import {MockPerpAdapter} from "../src/adapters/MockPerpAdapter.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";

/// @title Atlas Deploy Script
/// @notice One-command deployment of the full Atlas stack on the pool chain.
/// @dev Deploy order:
///        1. Mock WETH + USDC (skip with env: USE_REAL_TOKENS)
///        2. MockPriceOracle  (replace with ChainlinkOracleAdapter in production)
///        3. MockPerpAdapter  (replace with HyperliquidAdapter in production)
///        4. AtlasVault       (asset = USDC; hook bound later via setHook)
///        5. AtlasHook        (CREATE2-mined for required permission bits)
///        6. vault.setHook(address(hook))
///
///      reactiveCallback is set in a follow-up script after AtlasReactive is
///      deployed on Reactive Network.
///
///      Required env:
///        DEPLOYER_PRIVATE_KEY  - private key to broadcast from
///        POOL_MANAGER          - address of Uniswap v4 PoolManager on the target chain
///
///      Optional env:
///        WETH_ADDRESS, USDC_ADDRESS - skip mock token deployment
///
///      Run:
///        forge script script/Deploy.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC --broadcast
contract Deploy is Script {
    // ============ CONSTANTS ============

    /// @dev Standard CREATE2 deployer proxy used by `forge script`. Mining must target this.
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    uint256 constant INITIAL_PRICE = 3500e18; // $3500 / ETH
    int256 constant FUNDING_RATE_BPS = 1000; // 10% APR, shorts earn (bull-regime sim)
    uint256 constant INITIAL_COUPON_BPS = 800; // 8% APR fixed coupon
    uint256 constant MAX_COUPON_BPS = 1500; // 15% APR cap

    /// @dev Storage to ferry addresses across helpers and avoid stack-too-deep.
    struct Deployment {
        address weth;
        address usdc;
        address oracle;
        address perpAdapter;
        address vault;
        address hook;
        bool volatileIsCurrency0;
    }

    Deployment internal d;

    // ============ ENTRYPOINT ============

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(deployerPk);
        address poolManager = vm.envAddress("POOL_MANAGER");

        console2.log("=== Atlas Deployment ===");
        console2.log("Chain ID:    ", block.chainid);
        console2.log("Deployer:    ", admin);
        console2.log("PoolManager: ", poolManager);

        _deployCore(deployerPk, admin);
        _deployHook(deployerPk, admin, poolManager);
        _logAndWrite();
    }

    // ============ STEPS ============

    function _deployCore(uint256 pk, address admin) internal {
        vm.startBroadcast(pk);
        (d.weth, d.usdc) = _deployOrLoadTokens(admin);
        d.oracle = address(new MockPriceOracle(INITIAL_PRICE));
        d.perpAdapter = address(new MockPerpAdapter(d.oracle, FUNDING_RATE_BPS));
        d.vault = address(new AtlasVault(IERC20(d.usdc), INITIAL_COUPON_BPS, MAX_COUPON_BPS));
        vm.stopBroadcast();
    }

    function _deployHook(uint256 pk, address admin, address poolManager) internal {
        d.volatileIsCurrency0 = d.weth < d.usdc;
        uint160 flags = uint160(
            Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
        );
        bytes memory ctorArgs = abi.encode(
            IPoolManager(poolManager),
            AtlasVault(d.vault),
            IPerpAdapter(d.perpAdapter),
            d.volatileIsCurrency0,
            admin
        );
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(AtlasHook).creationCode, ctorArgs);

        vm.startBroadcast(pk);
        AtlasHook hook = new AtlasHook{salt: salt}(
            IPoolManager(poolManager),
            AtlasVault(d.vault),
            IPerpAdapter(d.perpAdapter),
            d.volatileIsCurrency0,
            admin
        );
        require(address(hook) == hookAddr, "deploy: hook address mismatch");
        AtlasVault(d.vault).setHook(address(hook));
        vm.stopBroadcast();

        d.hook = address(hook);
    }

    function _logAndWrite() internal {
        console2.log("WETH:        ", d.weth);
        console2.log("USDC:        ", d.usdc);
        console2.log("Oracle:      ", d.oracle);
        console2.log("PerpAdapter: ", d.perpAdapter);
        console2.log("Vault:       ", d.vault);
        console2.log("Hook:        ", d.hook);
        console2.log("VolatileIsCurrency0:", d.volatileIsCurrency0);

        _writeArtifact();
    }

    // ============ HELPERS ============

    /// @dev Loads token addresses from env if set, otherwise deploys ERC20Mock pair.
    function _deployOrLoadTokens(address recipient) internal returns (address weth, address usdc) {
        try vm.envAddress("WETH_ADDRESS") returns (address w) {
            weth = w;
            usdc = vm.envAddress("USDC_ADDRESS");
        } catch {
            ERC20Mock _weth = new ERC20Mock();
            ERC20Mock _usdc = new ERC20Mock();
            // Seed deployer with demo balances
            _weth.mint(recipient, 100e18);
            _usdc.mint(recipient, 500_000e6);
            weth = address(_weth);
            usdc = address(_usdc);
        }
    }

    /// @dev Writes the deployment to deployments/{chainId}.json for frontend pickup.
    function _writeArtifact() internal {
        string memory key = "atlasDeployment";
        vm.serializeAddress(key, "weth", d.weth);
        vm.serializeAddress(key, "usdc", d.usdc);
        vm.serializeAddress(key, "oracle", d.oracle);
        vm.serializeAddress(key, "perpAdapter", d.perpAdapter);
        vm.serializeAddress(key, "vault", d.vault);
        vm.serializeBool(key, "volatileIsCurrency0", d.volatileIsCurrency0);
        string memory json = vm.serializeAddress(key, "hook", d.hook);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Artifact written:", path);
    }
}
