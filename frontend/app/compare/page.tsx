"use client";

import Link from "next/link";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {formatUnits, parseUnits} from "viem";
import {ATLAS} from "@/lib/contracts";
import {MOCK_ORACLE_ABI} from "@/lib/abis";
import {PriceChart, type ChartPoint} from "@/components/PriceChart";

/// Initial LP composition for the chart: 1 ETH + 3500 USDC.
/// Vanilla value = ETH_qty * price + USDC_qty; Atlas value stays flat (delta-neutral).
const ETH_QTY = 1;
const USDC_QTY = 3500;
const ATLAS_FLAT_VALUE = ETH_QTY * 3500 + USDC_QTY; // $7000

export default function ComparePage() {
    const {isConnected} = useAccount();
    const [points, setPoints] = useState<ChartPoint[]>([]);
    const [busy, setBusy] = useState(false);
    const seedTime = useRef<number | null>(null);

    // Live oracle read, polled every 4 seconds.
    const {data: rawPrice} = useReadContract({
        address: ATLAS.oracle,
        abi: MOCK_ORACLE_ABI,
        functionName: "getPrice",
        query: {refetchInterval: 4000},
    });

    const currentPrice = useMemo(() => {
        if (rawPrice === undefined) return null;
        return Number(formatUnits(rawPrice as bigint, 18));
    }, [rawPrice]);

    // Push a new point whenever the price changes (or on first read).
    useEffect(() => {
        if (currentPrice === null) return;
        const now = Math.floor(Date.now() / 1000);
        if (seedTime.current === null) {
            // Seed a flat baseline so the chart isn't a single dot on first load.
            const baseline: ChartPoint[] = [];
            for (let i = 30; i > 0; i--) {
                baseline.push({
                    time: now - i,
                    vanilla: ETH_QTY * currentPrice + USDC_QTY,
                    atlas: ATLAS_FLAT_VALUE,
                });
            }
            seedTime.current = now;
            setPoints(baseline);
            return;
        }
        setPoints((prev) => {
            const last = prev[prev.length - 1];
            const t = Math.max(now, (last?.time ?? now) + 1);
            return [...prev, {time: t, vanilla: ETH_QTY * currentPrice + USDC_QTY, atlas: ATLAS_FLAT_VALUE}];
        });
    }, [currentPrice]);

    const {writeContractAsync} = useWriteContract();
    const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
    const {isLoading: txMining} = useWaitForTransactionReceipt({hash: pendingTx});

    const triggerVolatility = useCallback(
        async (deltaPct: number) => {
            if (!currentPrice || busy || !isConnected) return;
            setBusy(true);
            try {
                const newPrice = currentPrice * (1 + deltaPct / 100);
                const hash = await writeContractAsync({
                    address: ATLAS.oracle,
                    abi: MOCK_ORACLE_ABI,
                    functionName: "setPrice",
                    args: [parseUnits(newPrice.toFixed(6), 18)],
                });
                setPendingTx(hash);
            } catch (err) {
                console.error(err);
                setBusy(false);
            }
        },
        [currentPrice, busy, isConnected, writeContractAsync],
    );

    // Reset busy flag once tx confirms.
    useEffect(() => {
        if (!txMining && pendingTx && busy) setBusy(false);
    }, [txMining, pendingTx, busy]);

    const vanillaValue = currentPrice !== null ? ETH_QTY * currentPrice + USDC_QTY : null;
    const drawdown = vanillaValue !== null ? ((vanillaValue - ATLAS_FLAT_VALUE) / ATLAS_FLAT_VALUE) * 100 : null;

    return (
        <div className="flex flex-col flex-1">
            <Header />
            <main className="flex flex-1 flex-col px-6 py-10 max-w-6xl mx-auto w-full">
                <div className="mb-8">
                    <Link href="/" className="text-xs text-zinc-500 hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-4xl font-semibold tracking-tight mt-2 mb-2">Atlas vs Vanilla LP</h1>
                    <p className="text-zinc-400 max-w-2xl">
                        Both lines start at $7,000 (1 ETH + 3500 USDC). The Atlas line is delta-hedged so it stays
                        flat; the vanilla line tracks the volatile asset. Trigger a price move below to see the
                        divergence open up in real time.
                    </p>
                </div>

                <StatsBar
                    currentPrice={currentPrice}
                    vanillaValue={vanillaValue}
                    atlasValue={ATLAS_FLAT_VALUE}
                    drawdownPct={drawdown}
                />

                <section className="border border-zinc-900 rounded-xl p-6 mt-6 bg-zinc-950">
                    <PriceChart data={points} />
                    <div className="flex gap-6 text-xs text-zinc-500 mt-4">
                        <Legend color="#10b981" label="Atlas LP (hedged)" />
                        <Legend color="#71717a" label="Vanilla LP (unhedged)" />
                    </div>
                </section>

                <TriggerPanel
                    onTrigger={triggerVolatility}
                    busy={busy || txMining}
                    isConnected={isConnected}
                    currentPrice={currentPrice}
                />
            </main>
            <Footer />
        </div>
    );
}

function Header() {
    return (
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-900">
            <Link href="/" className="text-lg font-semibold tracking-tight">
                Atlas
            </Link>
            <ConnectButton showBalance={false} chainStatus="icon" />
        </header>
    );
}

function StatsBar({
    currentPrice,
    vanillaValue,
    atlasValue,
    drawdownPct,
}: {
    currentPrice: number | null;
    vanillaValue: number | null;
    atlasValue: number;
    drawdownPct: number | null;
}) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="ETH price (oracle)" value={currentPrice !== null ? `$${currentPrice.toFixed(2)}` : "—"} />
            <Stat label="Vanilla LP value" value={vanillaValue !== null ? `$${vanillaValue.toFixed(2)}` : "—"} />
            <Stat label="Atlas LP value" value={`$${atlasValue.toFixed(2)}`} accent />
            <Stat
                label="Atlas vs vanilla"
                value={
                    drawdownPct !== null ? `${drawdownPct > 0 ? "+" : ""}${(-drawdownPct).toFixed(2)}%` : "—"
                }
                accent={drawdownPct !== null && drawdownPct < 0}
                negative={drawdownPct !== null && drawdownPct > 0}
            />
        </div>
    );
}

function Stat({
    label,
    value,
    accent,
    negative,
}: {
    label: string;
    value: string;
    accent?: boolean;
    negative?: boolean;
}) {
    return (
        <div className="border border-zinc-900 rounded-lg p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
            <div
                className={`text-2xl font-semibold ${
                    accent ? "text-emerald-400" : negative ? "text-rose-400" : "text-white"
                }`}
            >
                {value}
            </div>
        </div>
    );
}

function Legend({color, label}: {color: string; label: string}) {
    return (
        <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{backgroundColor: color}} />
            <span>{label}</span>
        </div>
    );
}

function TriggerPanel({
    onTrigger,
    busy,
    isConnected,
    currentPrice,
}: {
    onTrigger: (deltaPct: number) => void;
    busy: boolean;
    isConnected: boolean;
    currentPrice: number | null;
}) {
    const buttons: {pct: number; label: string; tone: "danger" | "muted" | "accent"}[] = [
        {pct: -15, label: "Dump 15%", tone: "danger"},
        {pct: -5, label: "Dump 5%", tone: "muted"},
        {pct: 5, label: "Pump 5%", tone: "muted"},
        {pct: 15, label: "Pump 15%", tone: "accent"},
    ];

    return (
        <section className="border border-zinc-900 rounded-xl p-6 mt-6 bg-zinc-950">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-xl font-semibold">Trigger volatility</h2>
                    <p className="text-sm text-zinc-500 mt-1">
                        Calls <code className="text-zinc-300">setPrice()</code> on the on-chain oracle. The chart
                        updates within a few seconds of the transaction confirming.
                    </p>
                </div>
                {!isConnected && <span className="text-xs text-amber-400">Connect a wallet to trigger</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {buttons.map((b) => (
                    <button
                        key={b.pct}
                        disabled={!isConnected || busy || currentPrice === null}
                        onClick={() => onTrigger(b.pct)}
                        className={`
                            rounded-lg py-3 text-sm font-medium border transition-colors
                            disabled:opacity-40 disabled:cursor-not-allowed
                            ${
                                b.tone === "danger"
                                    ? "border-rose-900 hover:border-rose-700 hover:bg-rose-950/50 text-rose-300"
                                    : b.tone === "accent"
                                      ? "border-emerald-900 hover:border-emerald-700 hover:bg-emerald-950/50 text-emerald-300"
                                      : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 text-zinc-300"
                            }
                        `}
                    >
                        {b.label}
                    </button>
                ))}
            </div>
            {busy && <p className="text-xs text-zinc-500 mt-3">Waiting for tx confirmation...</p>}
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-zinc-900 px-6 py-8 text-xs text-zinc-500">
            <div className="max-w-6xl mx-auto">
                Oracle: {ATLAS.oracle} · Vault: {ATLAS.vault} · Hook: {ATLAS.hook}
            </div>
        </footer>
    );
}
