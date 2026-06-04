// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

/// @title InitializePool
/// @notice Initializes the Atlas-managed USDC/WETH pool on Unichain Sepolia (or any
///         chain whose deployment lives in deployments/{chainId}.json).
/// @dev Reads addresses from deployments/{chainId}.json. Computes PoolKey with USDC as
///      currency0 (lower address) and the Atlas hook registered. Initial sqrtPriceX96
///      encodes $3500/ETH so subsequent LP math has a realistic starting point.
///
///      Required env: DEPLOYER_PRIVATE_KEY, POOL_MANAGER
///      Run:          forge script script/InitializePool.s.sol --rpc-url $RPC --broadcast
contract InitializePool is Script {
    using stdJson for string;

    /// @dev sqrtPriceX96 for $3500/ETH with USDC (6 dec) as currency0, WETH (18 dec) as currency1.
    /// @dev Computed offline: sqrt(1e18 / (3500 * 1e6)) * 2^96
    uint160 constant SQRT_PRICE_X96_3500 = 1339200372865057397661790107598848;

    /// @dev v4 pool fee tier (0.30%).
    uint24 constant FEE = 3000;

    /// @dev Tick spacing matching the fee tier per v4 conventions.
    int24 constant TICK_SPACING = 60;

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address poolManager = vm.envAddress("POOL_MANAGER");

        // Load deployed addresses for this chain.
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address weth = json.readAddress(".weth");
        address usdc = json.readAddress(".usdc");
        address hook = json.readAddress(".hook");
        bool volatileIsCurrency0 = json.readBool(".volatileIsCurrency0");

        // Build the PoolKey with the lower address as currency0.
        (address c0, address c1) = weth < usdc ? (weth, usdc) : (usdc, weth);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hook)
        });

        console2.log("=== Initialize Atlas Pool ===");
        console2.log("Chain ID:           ", block.chainid);
        console2.log("PoolManager:        ", poolManager);
        console2.log("Hook:               ", hook);
        console2.log("Currency0:          ", c0);
        console2.log("Currency1:          ", c1);
        console2.log("VolatileIsCurrency0:", volatileIsCurrency0);
        console2.log("Fee tier:           ", FEE);
        console2.log("Tick spacing:       ", TICK_SPACING);

        vm.startBroadcast(deployerPk);
        int24 startingTick = IPoolManager(poolManager).initialize(key, SQRT_PRICE_X96_3500);
        vm.stopBroadcast();

        console2.log("Initial tick:       ", startingTick);
    }
}
