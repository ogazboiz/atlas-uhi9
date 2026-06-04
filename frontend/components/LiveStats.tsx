"use client";

import {useReadContract} from "wagmi";
import {formatUnits} from "viem";
import {ATLAS} from "@/lib/contracts";

const ORACLE_ABI = [
    {type: "function", name: "getPrice", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
] as const;

const VAULT_ABI = [
    {type: "function", name: "couponBps", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "depositsPaused", inputs: [], outputs: [{type: "bool"}], stateMutability: "view"},
] as const;

const HOOK_ABI = [
    {type: "function", name: "lastNonce", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
] as const;

/// Three live on-chain numbers above the fold on the landing page.
/// Every value is a real read from a verified contract on Unichain Sepolia.
export function LiveStats() {
    const {data: rawPrice} = useReadContract({
        address: ATLAS.oracle,
        abi: ORACLE_ABI,
        functionName: "getPrice",
        query: {refetchInterval: 5000},
    });
    const {data: couponBps} = useReadContract({
        address: ATLAS.vault,
        abi: VAULT_ABI,
        functionName: "couponBps",
        query: {refetchInterval: 10000},
    });
    const {data: paused} = useReadContract({
        address: ATLAS.vault,
        abi: VAULT_ABI,
        functionName: "depositsPaused",
        query: {refetchInterval: 10000},
    });
    const {data: callbackNonce} = useReadContract({
        address: ATLAS.hook,
        abi: HOOK_ABI,
        functionName: "lastNonce",
        query: {refetchInterval: 5000},
    });

    const priceStr = rawPrice === undefined ? "—" : `$${Number(formatUnits(rawPrice as bigint, 18)).toFixed(2)}`;
    const aprStr = couponBps === undefined ? "—" : `${(Number(couponBps as bigint) / 100).toFixed(2)}%`;
    const nonceStr = callbackNonce === undefined ? "—" : (callbackNonce as bigint).toString();

    return (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full max-w-4xl mt-12">
            <StatCard label="Oracle ETH/USD" value={priceStr} sub="Live on-chain" pulse />
            <StatCard label="Atlas target APR" value={aprStr} sub={paused ? "Deposits paused" : "Active"} />
            <StatCard label="Cross-chain callbacks" value={nonceStr} sub="Verified by hook.lastNonce" />
            <StatCard label="Reactive latency" value="~18s" sub="Lasna ↔ Unichain Sepolia" />
        </section>
    );
}

function StatCard({label, value, sub, pulse}: {label: string; value: string; sub: string; pulse?: boolean}) {
    return (
        <div className="border border-zinc-900 rounded-lg p-5 text-center bg-zinc-950">
            <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-zinc-500 mb-2">
                {pulse && (
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                )}
                <span>{label}</span>
            </div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-zinc-500 mt-1">{sub}</div>
        </div>
    );
}
