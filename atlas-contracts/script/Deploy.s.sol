// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AtlasHook} from "../src/AtlasHook.sol";
import {AtlasVault} from "../src/AtlasVault.sol";
import {IPerpAdapter} from "../src/adapters/IPerpAdapter.sol";
import {MockPerpAdapter} from "../src/adapters/MockPerpAdapter.sol";
import {ChainlinkOracleAdapter} from "../src/oracles/ChainlinkOracleAdapter.sol";

/// @title Atlas Deploy Script
/// @notice Single-command deployment of all Atlas contracts on the pool chain.
/// @dev Deploy order:
///        1. ChainlinkOracleAdapter (wraps ETH/USD feed)
///        2. MockPerpAdapter (configured with oracle)
///        3. AtlasVault (ERC-4626; hook set in step 4 via setter or constructor)
///        4. AtlasHook (mined for required permission bits; configured with vault + adapter + RSC addr)
///        5. Initialize WETH/USDC pool with AtlasHook registered
///        6. Out-of-band: deploy AtlasReactive on Reactive Network (separate script)
///
/// Writes addresses to deployments/{chainId}.json for frontend consumption.
contract Deploy is Script {
    // ============ CONFIG ============

    address constant CHAINLINK_ETH_USD_SEPOLIA = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    uint256 constant ORACLE_MAX_STALENESS = 300; // 5 minutes
    uint256 constant INITIAL_COUPON_BPS = 800;   // 8% APR
    uint256 constant MAX_COUPON_BPS = 1500;      // 15% APR cap

    // ============ STATE ============

    address public oracle;
    address public perpAdapter;
    address public vault;
    address public hook;

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPk);

        // TODO: deploy contracts in order, configure cross-references, mine hook address
        // TODO: write addresses to deployments/{block.chainid}.json

        vm.stopBroadcast();

        console2.log("Oracle:      ", oracle);
        console2.log("PerpAdapter: ", perpAdapter);
        console2.log("Vault:       ", vault);
        console2.log("Hook:        ", hook);
    }
}
