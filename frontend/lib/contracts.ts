import {type Address} from "viem";

/// Deployed Atlas contract addresses on Unichain Sepolia (chain 1301).
/// Source of truth is contracts/deployments/1301.json written by Deploy.s.sol.
/// Keep this file in sync after redeploys.
export const ATLAS = {
    hook: "0x6eA1Ad75D4904069523d29BA7d77C398262b4640" as Address,
    vault: "0x2d04a51EE6a19772691675205274B8516F2C5941" as Address,
    perpAdapter: "0x7AC657c76A96030d9B7e91540094E928d5c1375a" as Address,
    oracle: "0xd14F55BC9BFcEaDFF0d4A3C25bda54C7d56A1b89" as Address,
    weth: "0xF6D2B84FC826dd20d98dD70FCfEFfb0E4252704B" as Address,
    usdc: "0x35AF67973B14EB15A49311de78cC388d530b67Eb" as Address,
    volatileIsCurrency0: false,
} as const;

/// Uniswap v4 PoolManager on Unichain Sepolia.
export const POOL_MANAGER: Address = "0x00B036B58a818B1BC34d502D3fE730Db729e62AC";

/// Reactive Network components (cross-chain integration).
/// Source: contracts/deployments/reactive-1301.json
export const REACTIVE = {
    callback: "0x3d35ba0Bd93231cCa2B29eAe3461f03c3adE3BFB" as Address, // AtlasCallback on Unichain Sepolia
    callbackProxy: "0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4" as Address, // RN proxy on Unichain
    reactive: "0x9A8629e7D3FcCDbC4d1DE24d43013452cfF23cF0" as Address, // AtlasReactive on Lasna
    reactiveChainId: 5318007,
    reactiveExplorer: "https://lasna.reactscan.net",
    poolId: "0xed78b4fbdc483220ba4daef7fdd972fdae8a1a06690c5090d6e92a27ccfc2598",
} as const;

/// The Atlas-managed pool configuration. currency0 = lower address.
const c0Lower = ATLAS.usdc.toLowerCase() < ATLAS.weth.toLowerCase();
export const POOL_CONFIG = {
    fee: 3000,
    tickSpacing: 60,
    currency0: (c0Lower ? ATLAS.usdc : ATLAS.weth) as Address,
    currency1: (c0Lower ? ATLAS.weth : ATLAS.usdc) as Address,
} as const;
