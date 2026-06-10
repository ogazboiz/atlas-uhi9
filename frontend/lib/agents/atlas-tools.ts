/// Atlas on-chain reader tools.
///
/// Each exported function is a durable workflow step ("use step"). They have
/// full Node.js access, are cached per-input by the WDK runtime, and retry
/// automatically on transient RPC failures. Tools are imported by the
/// DurableAgent in atlas-agent.ts and exposed to Claude Haiku so it can fetch
/// fresh on-chain state instead of relying on a static context block.

import {createPublicClient, defineChain, formatUnits, http, parseAbi, parseAbiItem} from "viem";

const ATLAS = {
    hook: "0xb0a98b7301772DC8328e3b8B08436C5E993d4640" as const,
    vault: "0xC86b482A6F30f8B149a98Fa5B2b2a0a026cbcC9b" as const,
    oracle: "0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff" as const,
    perpAdapter: "0xcaC535eef5BfdC09fB1a53086551aE5d1b90a4Af" as const,
    usdc: "0x35AF67973B14EB15A49311de78cC388d530b67Eb" as const,
} as const;

const unichainSepolia = defineChain({
    id: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: {decimals: 18, name: "Ether", symbol: "ETH"},
    rpcUrls: {default: {http: ["https://unichain-sepolia-rpc.publicnode.com"]}},
});

function getClient() {
    return createPublicClient({
        chain: unichainSepolia,
        transport: http(),
    });
}

// ============================================================================
// Tool 1: Vault state
// ============================================================================

const VAULT_ABI = parseAbi([
    "function totalAssets() view returns (uint256)",
    "function couponBps() view returns (uint256)",
    "function bufferHealth() view returns (uint256)",
    "function depositsPaused() view returns (bool)",
]);

export async function readVaultState() {
    const client = getClient();
    const [totalAssets, couponBps, bufferHealth, paused] = await Promise.all([
        client.readContract({address: ATLAS.vault, abi: VAULT_ABI, functionName: "totalAssets"}),
        client.readContract({address: ATLAS.vault, abi: VAULT_ABI, functionName: "couponBps"}),
        client.readContract({address: ATLAS.vault, abi: VAULT_ABI, functionName: "bufferHealth"}),
        client.readContract({address: ATLAS.vault, abi: VAULT_ABI, functionName: "depositsPaused"}),
    ]);
    const bufferRatio =
        bufferHealth > 10n ** 15n ? "unbounded" : `${(Number(bufferHealth) / 10_000).toFixed(2)}x`;
    return {
        totalAssetsUsdc: formatUnits(totalAssets, 18),
        currentAprPct: (Number(couponBps) / 100).toFixed(2),
        bufferHealthRatio: bufferRatio,
        depositsPaused: paused,
    };
}

// ============================================================================
// Tool 2: User position
// ============================================================================

const VAULT_USER_ABI = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function previewRedeem(uint256) view returns (uint256)",
]);

const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export async function readUserPosition({address}: {address: string}) {
    const client = getClient();
    const addr = address as `0x${string}`;
    const [aLpBalance, usdcBalance] = await Promise.all([
        client.readContract({address: ATLAS.vault, abi: VAULT_USER_ABI, functionName: "balanceOf", args: [addr]}),
        client.readContract({address: ATLAS.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [addr]}),
    ]);
    let claimValue = 0n;
    if (aLpBalance > 0n) {
        claimValue = await client.readContract({
            address: ATLAS.vault,
            abi: VAULT_USER_ABI,
            functionName: "previewRedeem",
            args: [aLpBalance],
        });
    }
    return {
        wallet: address,
        aLpShares: formatUnits(aLpBalance, 18),
        claimValueUsdc: formatUnits(claimValue, 18),
        usdcWalletBalance: formatUnits(usdcBalance, 18),
    };
}

// ============================================================================
// Tool 3: Oracle price
// ============================================================================

const ORACLE_ABI = parseAbi(["function getPrice() view returns (uint256)"]);

export async function readOraclePrice() {
    const client = getClient();
    const price = await client.readContract({address: ATLAS.oracle, abi: ORACLE_ABI, functionName: "getPrice"});
    return {
        ethUsd: `$${Number(formatUnits(price, 18)).toFixed(2)}`,
        rawWei: price.toString(),
        source: "MockPriceOracle (demo). Production wiring uses ChainlinkOracleAdapter on Sepolia.",
    };
}

// ============================================================================
// Tool 4: Recent Reactive callbacks
// ============================================================================

const REBALANCE_EVENT = parseAbiItem(
    "event RebalanceCallbackReceived(bytes32 indexed poolId, int256 appliedDelta, uint256 nonce)",
);

export async function readRecentCallbacks({limit}: {limit: number}) {
    const client = getClient();
    const lastNonce = await client.readContract({
        address: ATLAS.hook,
        abi: parseAbi(["function lastNonce() view returns (uint256)"]),
        functionName: "lastNonce",
    });
    const latest = await client.getBlockNumber();
    const lookback = latest > 50000n ? latest - 50000n : 0n;
    const logs = await client.getLogs({
        address: ATLAS.hook,
        event: REBALANCE_EVENT,
        fromBlock: lookback,
        toBlock: "latest",
    });
    const callbacks = await Promise.all(
        logs
            .slice(-limit)
            .reverse()
            .map(async (log) => {
                const block = await client.getBlock({blockHash: log.blockHash!});
                const delta = log.args.appliedDelta ?? 0n;
                return {
                    nonce: (log.args.nonce ?? 0n).toString(),
                    appliedDeltaEth: formatUnits(delta < 0n ? -delta : delta, 18) + (delta < 0n ? " (short reduced)" : " (short grown)"),
                    blockNumber: log.blockNumber!.toString(),
                    secondsAgo: Math.floor(Date.now() / 1000) - Number(block.timestamp),
                    txHash: log.transactionHash!,
                };
            }),
    );
    return {
        currentHookNonce: lastNonce.toString(),
        callbacksInWindow: callbacks.length,
        callbacks,
    };
}
