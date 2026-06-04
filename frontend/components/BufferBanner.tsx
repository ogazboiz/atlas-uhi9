"use client";

import {useReadContract} from "wagmi";
import {ATLAS} from "@/lib/contracts";

const VAULT_ABI = [
    {type: "function", name: "bufferHealth", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "depositsPaused", inputs: [], outputs: [{type: "bool"}], stateMutability: "view"},
    {type: "function", name: "couponBps", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
] as const;

/// Site-wide banner that surfaces vault buffer state when it crosses safety thresholds.
/// Renders nothing while health is healthy. Surfaces an amber warning when deposits are
/// paused or coupon has been auto-reduced.
export function BufferBanner() {
    const {data: paused} = useReadContract({
        address: ATLAS.vault,
        abi: VAULT_ABI,
        functionName: "depositsPaused",
        query: {refetchInterval: 15000},
    });
    const {data: bufferHealth} = useReadContract({
        address: ATLAS.vault,
        abi: VAULT_ABI,
        functionName: "bufferHealth",
        query: {refetchInterval: 15000},
    });

    if (!paused) return null;

    const healthBps = bufferHealth === undefined ? 0n : (bufferHealth as bigint);
    const healthPct =
        healthBps > 1_000_000_000n ? "very low" : `${(Number(healthBps) / 100).toFixed(0)}%`;

    return (
        <div className="bg-amber-950 border-b border-amber-800 text-amber-200 text-xs">
            <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-2">
                <span aria-hidden>⚠</span>
                <span>
                    Atlas vault buffer is rebuilding ({healthPct} of 30-day coupon obligation). New deposits are
                    temporarily paused; existing positions are unaffected and continue to earn the reduced
                    coupon. The Reactive layer adjusts automatically as fees + funding flow in.
                </span>
            </div>
        </div>
    );
}
