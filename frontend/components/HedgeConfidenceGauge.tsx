"use client";

import {useEffect, useState} from "react";
import {usePublicClient, useReadContract} from "wagmi";
import {parseAbiItem} from "viem";
import {ATLAS} from "@/lib/contracts";
import {MOCK_ORACLE_ABI, ATLAS_VAULT_ABI, MOCK_PERP_ADAPTER_ABI} from "@/lib/abis";
import {computeConfidence, type ConfidenceResult} from "@/lib/confidence";

const REBALANCE_EVENT = parseAbiItem(
    "event RebalanceCallbackReceived(bytes32 indexed poolId, int256 appliedDelta, uint256 nonce)",
);

const SAMPLES = 20;

/// Reads four on-chain signals on a short interval, runs them through the
/// confidence engine in `lib/confidence.ts`, and renders the result as a
/// semicircle gauge with a component breakdown.
export function HedgeConfidenceGauge() {
    const publicClient = usePublicClient();
    const [priceSamples, setPriceSamples] = useState<bigint[]>([]);
    const [blocksSinceLastCallback, setBlocksSinceLastCallback] = useState<number>(0);

    const {data: oraclePrice} = useReadContract({
        address: ATLAS.oracle,
        abi: MOCK_ORACLE_ABI,
        functionName: "getPrice",
        query: {refetchInterval: 3000},
    });
    const {data: bufferHealth} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "bufferHealth",
        query: {refetchInterval: 10000},
    });
    const {data: depositsPaused} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "depositsPaused",
        query: {refetchInterval: 10000},
    });
    const {data: fundingRateBps} = useReadContract({
        address: ATLAS.perpAdapter,
        abi: MOCK_PERP_ADAPTER_ABI,
        functionName: "fundingRateAnnualBps",
        query: {refetchInterval: 30000},
    });

    // Maintain a rolling window of oracle prices for volatility.
    useEffect(() => {
        if (oraclePrice === undefined) return;
        setPriceSamples((prev) => {
            const next = [...prev, oraclePrice as bigint];
            return next.length > SAMPLES ? next.slice(-SAMPLES) : next;
        });
    }, [oraclePrice]);

    // Compute "blocks since last RSC callback" by scanning recent events.
    useEffect(() => {
        if (!publicClient) return;
        let cancelled = false;
        async function tick() {
            try {
                const latest = await publicClient!.getBlockNumber();
                const lookback = latest > 5000n ? latest - 5000n : 0n;
                const logs = await publicClient!.getLogs({
                    address: ATLAS.hook,
                    event: REBALANCE_EVENT,
                    fromBlock: lookback,
                    toBlock: "latest",
                });
                if (cancelled) return;
                if (logs.length === 0) {
                    setBlocksSinceLastCallback(Number(latest - lookback));
                    return;
                }
                const newest = logs.reduce(
                    (max, l) => ((l.blockNumber ?? 0n) > max ? (l.blockNumber ?? 0n) : max),
                    0n,
                );
                setBlocksSinceLastCallback(Number(latest - newest));
            } catch (err) {
                console.error("freshness scan failed", err);
            }
        }
        tick();
        const i = setInterval(tick, 15000);
        return () => {
            cancelled = true;
            clearInterval(i);
        };
    }, [publicClient]);

    const result = computeConfidence({
        pricesScaled1e18: priceSamples,
        blocksSinceLastCallback,
        bufferHealthBps: (bufferHealth as bigint) ?? 0n,
        fundingRateAnnualBps: fundingRateBps !== undefined ? Number(fundingRateBps as bigint) : 0,
        depositsPaused: (depositsPaused as boolean) ?? false,
    });

    return (
        <section className="border border-zinc-900 rounded-xl p-6 bg-zinc-950">
            <div className="flex flex-col md:flex-row gap-6 items-center">
                <Gauge result={result} />
                <Breakdown result={result} />
            </div>
        </section>
    );
}

function Gauge({result}: {result: ConfidenceResult}) {
    const score = result.score;
    const tierColor =
        result.tier === "HIGH" ? "#10b981" : result.tier === "MEDIUM" ? "#f59e0b" : "#f43f5e";

    // Semicircle from -90deg (left) to +90deg (right). 0 -> -90, 100 -> +90.
    const angle = -90 + (score / 100) * 180;
    const cx = 100;
    const cy = 100;
    const r = 80;

    // SVG arc path: from left (-90deg) to right (+90deg).
    const startX = cx - r;
    const endX = cx + r;
    // Filled portion based on score
    const tipX = cx + r * Math.cos((angle * Math.PI) / 180);
    const tipY = cy + r * Math.sin((angle * Math.PI) / 180);

    const largeArcFlag = 0; // semi-arc, never > 180

    return (
        <div className="flex flex-col items-center shrink-0">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                AI Hedge Confidence
            </div>
            <svg width="220" height="140" viewBox="0 0 200 120">
                {/* Background semicircle */}
                <path
                    d={`M ${startX} ${cy} A ${r} ${r} 0 ${largeArcFlag} 1 ${endX} ${cy}`}
                    fill="none"
                    stroke="#27272a"
                    strokeWidth="12"
                    strokeLinecap="round"
                />
                {/* Filled arc from left to current */}
                <path
                    d={`M ${startX} ${cy} A ${r} ${r} 0 ${largeArcFlag} 1 ${tipX} ${tipY}`}
                    fill="none"
                    stroke={tierColor}
                    strokeWidth="12"
                    strokeLinecap="round"
                    style={{transition: "stroke 0.6s ease"}}
                />
                {/* Score text */}
                <text
                    x={cx}
                    y={cy - 10}
                    textAnchor="middle"
                    fontSize="36"
                    fontWeight="600"
                    fill="white"
                    style={{fontVariantNumeric: "tabular-nums"}}
                >
                    {score}
                </text>
                <text
                    x={cx}
                    y={cy + 10}
                    textAnchor="middle"
                    fontSize="11"
                    fill={tierColor}
                    fontWeight="600"
                    letterSpacing="2"
                >
                    {result.tier}
                </text>
            </svg>
            <div className="text-xs text-zinc-500 mt-1 max-w-[220px] text-center">
                Composite of 4 on-chain signals
            </div>
        </div>
    );
}

function Breakdown({result}: {result: ConfidenceResult}) {
    return (
        <div className="flex-1 w-full min-w-0">
            <h3 className="text-base font-semibold mb-1">Hedge confidence breakdown</h3>
            <p className="text-xs text-zinc-500 mb-4">{result.summary}</p>
            <ul className="space-y-2">
                {result.components.map((c) => (
                    <li key={c.label}>
                        <div className="flex items-baseline justify-between gap-2 mb-1 text-sm">
                            <span className="text-zinc-300">{c.label}</span>
                            <span className="text-zinc-400 tabular-nums text-xs">
                                {Math.round(c.value)}/100 · weight {Math.round(c.weight * 100)}%
                            </span>
                        </div>
                        <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full"
                                style={{
                                    width: `${c.value}%`,
                                    backgroundColor: tierColor(c.value),
                                    transition: "width 0.6s ease, background-color 0.6s ease",
                                }}
                            />
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">{c.detail}</div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function tierColor(v: number): string {
    if (v >= 75) return "#10b981";
    if (v >= 50) return "#f59e0b";
    return "#f43f5e";
}
