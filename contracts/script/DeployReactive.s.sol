// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {AtlasCallback} from "../src/reactive/AtlasCallback.sol";
import {AtlasReactive} from "../src/reactive/AtlasReactive.sol";

interface IAtlasHookAdmin {
    function setReactiveCallback(address _new) external;
}

/// @title DeployReactive
/// @notice Two-phase deploy for the Reactive Network integration. Pattern adopted from
///         PerpHinge's 01_DeployReactive.s.sol.
/// @dev
///   PHASE 1 - on the pool chain (Unichain Sepolia, chain 1301):
///     DEPLOY_PHASE=callback POOL_ID=0x... \
///     forge script script/DeployReactive.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC --broadcast
///
///     Deploys AtlasCallback, then calls hook.setReactiveCallback(callback). Reads hook
///     address from deployments/1301.json.
///
///   PHASE 2 - on Reactive Network Lasna (chain 5318007):
///     DEPLOY_PHASE=reactive POOL_ID=0x... CALLBACK_ADDRESS=0x... \
///     forge script script/DeployReactive.s.sol --rpc-url $REACTIVE_TESTNET_RPC --broadcast --value 0.05ether
///
///     Deploys AtlasReactive, constructor pays the subscription fee and registers the
///     oracle.PriceUpdated subscription on Unichain Sepolia.
contract DeployReactive is Script {
    using stdJson for string;

    /// @dev Reactive Network callback proxy address on both Unichain Sepolia and mainnet.
    address constant UNICHAIN_CALLBACK_PROXY = 0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4;

    /// @dev Default threshold in bps (0 = fire on every price change). Demo-tuned.
    uint256 constant DEFAULT_THRESHOLD_BPS = 0;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        string memory phase = vm.envString("DEPLOY_PHASE");

        if (keccak256(bytes(phase)) == keccak256("callback")) {
            _deployCallback(pk);
        } else if (keccak256(bytes(phase)) == keccak256("reactive")) {
            _deployReactive(pk);
        } else {
            revert("Set DEPLOY_PHASE to 'callback' or 'reactive'");
        }
    }

    function _deployCallback(uint256 pk) internal {
        // Load hook address from the pool-chain deployment artifact.
        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        address hook = json.readAddress(".hook");

        console2.log("=== Phase 1: AtlasCallback on chain ", block.chainid);
        console2.log("Callback proxy:", UNICHAIN_CALLBACK_PROXY);
        console2.log("Hook:          ", hook);

        vm.startBroadcast(pk);
        AtlasCallback callback = new AtlasCallback(UNICHAIN_CALLBACK_PROXY, hook);
        IAtlasHookAdmin(hook).setReactiveCallback(address(callback));
        vm.stopBroadcast();

        console2.log("AtlasCallback: ", address(callback));
        console2.log("hook.reactiveCallback set");

        _writeReactiveArtifact(address(callback), address(0));
    }

    function _deployReactive(uint256 pk) internal {
        address callback = vm.envAddress("CALLBACK_ADDRESS");
        bytes32 poolIdRaw = vm.envBytes32("POOL_ID");

        // Oracle address on the destination chain (Unichain Sepolia) comes from the
        // pool-chain artifact. Foundry reads it from local file: deployments/1301.json.
        string memory json = vm.readFile("deployments/1301.json");
        address oracle = json.readAddress(".oracle");

        console2.log("=== Phase 2: AtlasReactive on chain ", block.chainid);
        console2.log("Oracle (dest): ", oracle);
        console2.log("Callback (dest):", callback);
        console2.log("PoolId:        ");
        console2.logBytes32(poolIdRaw);

        vm.startBroadcast(pk);
        // Deploy WITH funding: balance is set BEFORE the system contract debits the
        // subscription fee via the pay() callback (see AbstractPayer.coverDebt).
        AtlasReactive reactive = new AtlasReactive{value: 0.05 ether}(
            oracle, callback, poolIdRaw, DEFAULT_THRESHOLD_BPS
        );
        // Initialize the oracle subscription as a separate call now that the contract
        // is funded. Pattern from vfa-hooks SettlementExecutor.
        reactive.initSubscriptions();
        vm.stopBroadcast();

        console2.log("AtlasReactive: ", address(reactive));
    }

    /// @dev Append reactive addresses to the existing chain deployment file.
    function _writeReactiveArtifact(address callback, address reactive) internal {
        string memory key = "atlasReactive";
        vm.serializeAddress(key, "callback", callback);
        string memory json = vm.serializeAddress(key, "reactive", reactive);
        string memory path = string.concat("deployments/reactive-", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Reactive artifact:", path);
    }
}
