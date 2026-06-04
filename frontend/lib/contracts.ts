import {type Address} from "viem";

/// Deployed Atlas contract addresses on Unichain Sepolia (chain 1301).
/// Source of truth is contracts/deployments/1301.json written by Deploy.s.sol.
/// Keep this file in sync after redeploys.
export const ATLAS = {
    hook: "0xb0a98b7301772DC8328e3b8B08436C5E993d4640" as Address,
    vault: "0xC86b482A6F30f8B149a98Fa5B2b2a0a026cbcC9b" as Address,
    perpAdapter: "0xcaC535eef5BfdC09fB1a53086551aE5d1b90a4Af" as Address,
    oracle: "0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff" as Address,
    weth: "0xF6D2B84FC826dd20d98dD70FCfEFfb0E4252704B" as Address,
    usdc: "0x35AF67973B14EB15A49311de78cC388d530b67Eb" as Address,
    volatileIsCurrency0: false,
} as const;

/// Uniswap v4 PoolManager on Unichain Sepolia.
export const POOL_MANAGER: Address = "0x00B036B58a818B1BC34d502D3fE730Db729e62AC";

/// Reactive Network components (cross-chain integration).
/// Source: contracts/deployments/reactive-1301.json
export const REACTIVE = {
    callback: "0x725Fdf9116cd7083D7287B49f7dBB8FF7c11266D" as Address, // AtlasCallback on Unichain Sepolia
    callbackProxy: "0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4" as Address, // RN proxy on Unichain
    reactive: "0xA9797768554213476B0D1E853cf9b91E7A187BF1" as Address, // AtlasReactive on Lasna
    reactiveChainId: 5318007,
    reactiveExplorer: "https://lasna.reactscan.net",
    poolId: "0x48856097ba659752848795efaa9b943b1fa79484bb65b0e840e11742f4986283",
} as const;

/// The Atlas-managed pool configuration. currency0 = lower address.
const c0Lower = ATLAS.usdc.toLowerCase() < ATLAS.weth.toLowerCase();
export const POOL_CONFIG = {
    fee: 3000,
    tickSpacing: 60,
    currency0: (c0Lower ? ATLAS.usdc : ATLAS.weth) as Address,
    currency1: (c0Lower ? ATLAS.weth : ATLAS.usdc) as Address,
} as const;
