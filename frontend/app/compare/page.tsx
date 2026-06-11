"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {formatUnits, parseUnits} from "viem";
import {ATLAS} from "@/lib/contracts";
import {MOCK_ORACLE_ABI} from "@/lib/abis";
import {PriceChart, type ChartPoint} from "@/components/PriceChart";
import {ReactiveStatus} from "@/components/ReactiveStatus";
import {ReactiveEventFeed} from "@/components/ReactiveEventFeed";
import {HedgeConfidenceGauge} from "@/components/HedgeConfidenceGauge";
import {HedgedMercury} from "@/components/HedgedMercury";
import {FadeIn, NumberTicker} from "@/components/motion/Motion";
import {motion, useReducedMotion} from "motion/react";
const HOOK_NONCE_ABI = [
    {type: "function", name: "lastNonce", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
] as const;
import {Chip, PageFrame, SectionHeader, Shell, StatCard} from "@/components/Shell";

/// Initial LP composition for the chart: 1 ETH + 3500 USDC.
const ETH_QTY = 1;
const USDC_QTY = 3500;
const ATLAS_FLAT_VALUE = ETH_QTY * 3500 + USDC_QTY; // $7000

export default function ComparePage() {
    const {isConnected} = useAccount();
    const [points, setPoints] = useState<ChartPoint[]>([]);
    const [busy, setBusy] = useState(false);
    const seedTime = useRef<number | null>(null);

    const {data: rawPrice} = useReadContract({
        address: ATLAS.oracle,
        abi: MOCK_ORACLE_ABI,
        functionName: "getPrice",
        query: {refetchInterval: 1500},
    });
    const {data: lastNonce} = useReadContract({
        address: ATLAS.hook,
        abi: HOOK_NONCE_ABI,
        functionName: "lastNonce",
        query: {refetchInterval: 5000},
    });

    const currentPrice = useMemo(() => {
        if (rawPrice === undefined) return null;
        return Number(formatUnits(rawPrice as bigint, 18));
    }, [rawPrice]);

    useEffect(() => {
        if (currentPrice === null) return;
        const now = Math.floor(Date.now() / 1000);
        if (seedTime.current === null) {
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
    const [lastTrigger, setLastTrigger] = useState<number | null>(null);
    const [impactKey, setImpactKey] = useState(0);

    // Heal pulse increments whenever hook.lastNonce ticks (Reactive callback landed).
    const nonceNumber = lastNonce !== undefined ? Number(lastNonce as bigint) : 0;

    const triggerVolatility = useCallback(
        async (deltaPct: number) => {
            if (!currentPrice || busy || !isConnected) return;
            setBusy(true);
            setLastTrigger(deltaPct);
            // Fire local impact immediately so the blob reacts before tx confirms.
            setImpactKey((k) => k + Math.abs(deltaPct) * (deltaPct > 0 ? -1 : 1) || 1);
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

    useEffect(() => {
        if (!txMining && pendingTx && busy) setBusy(false);
    }, [txMining, pendingTx, busy]);

    useEffect(() => {
        function handle(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const map: Record<string, number> = {"1": -15, "2": -5, "3": 5, "4": 15};
            const pct = map[e.key];
            if (pct !== undefined) {
                e.preventDefault();
                triggerVolatility(pct);
            }
        }
        window.addEventListener("keydown", handle);
        return () => window.removeEventListener("keydown", handle);
    }, [triggerVolatility]);

    const vanillaValue = currentPrice !== null ? ETH_QTY * currentPrice + USDC_QTY : null;
    const drawdown = vanillaValue !== null ? ((vanillaValue - ATLAS_FLAT_VALUE) / ATLAS_FLAT_VALUE) * 100 : null;
    const atlasAhead = drawdown !== null && drawdown < 0; // vanilla below atlas = atlas ahead

    return (
        <Shell>
            <PageFrame>
                <div className="mb-8">
                    <Chip tone="emerald">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Live on Unichain Sepolia
                    </Chip>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Atlas vs <span className="text-zinc-500">Vanilla LP</span>
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                        Both positions start at $7,000 (1 ETH + 3500 USDC). The Atlas position is delta-hedged so
                        it stays flat. The vanilla position tracks ETH price. Press <Kbd>1</Kbd> to dump 15% and
                        watch the divergence open up live.
                    </p>
                </div>

                {/* Signature interactive hero: hedged mercury blobs */}
                <div className="atlas-card-strong relative mb-6 overflow-hidden p-4 sm:p-6">
                    <div className="absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[100px]" />
                    <div className="absolute right-1/4 bottom-0 -z-10 h-48 w-48 rounded-full bg-violet-500/[0.08] blur-[80px]" />
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                                The hedge, made visible
                            </div>
                            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                                Drag the blobs. Press 1-4 below. Watch the difference.
                            </h2>
                        </div>
                        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300 sm:inline-flex">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            </span>
                            Liquid simulation
                        </span>
                    </div>
                    <HedgedMercury
                        impactKey={impactKey}
                        healPulse={nonceNumber}
                        vanillaValue={vanillaValue ?? undefined}
                        atlasValue={ATLAS_FLAT_VALUE}
                    />
                </div>

                {/* Sticky stats bar */}
                <div className="sticky top-16 z-20 -mx-6 mb-6 border-b border-white/[0.06] bg-[#050608]/85 px-6 py-4 backdrop-blur-xl">
                    <StatsRow
                        currentPrice={currentPrice}
                        vanillaValue={vanillaValue}
                        atlasValue={ATLAS_FLAT_VALUE}
                        drawdownPct={drawdown}
                        atlasAhead={atlasAhead}
                    />
                </div>

                {/* Main grid: gauge | chart */}
                <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
                    <HedgeConfidenceGauge />
                    <ChartPanel points={points} />
                </div>

                {/* Trigger panel */}
                <div className="mt-4">
                    <TriggerPanel
                        onTrigger={triggerVolatility}
                        busy={busy || txMining}
                        isConnected={isConnected}
                        currentPrice={currentPrice}
                        lastTrigger={lastTrigger}
                    />
                </div>

                {/* Reactive subscription panel + event feed */}
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <ReactiveStatus />
                    <ReactiveEventFeed />
                </div>
            </PageFrame>
        </Shell>
    );
}

// ---------------------------------------------------------------------------
// Sticky stats row
// ---------------------------------------------------------------------------

function StatsRow({
    currentPrice,
    vanillaValue,
    atlasValue,
    drawdownPct,
    atlasAhead,
}: {
    currentPrice: number | null;
    vanillaValue: number | null;
    atlasValue: number;
    drawdownPct: number | null;
    atlasAhead: boolean;
}) {
    const versusValue = drawdownPct === null ? 0 : Math.abs(drawdownPct);

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard
                label="ETH price (oracle)"
                value={
                    currentPrice === null ? (
                        "—"
                    ) : (
                        <NumberTicker
                            value={currentPrice}
                            prefix="$"
                            minimumFractionDigits={2}
                            maximumFractionDigits={2}
                        />
                    )
                }
                hint="Updates the demo loop"
                tone="sky"
            />
            <StatCard
                label="Vanilla LP value"
                value={
                    vanillaValue === null ? (
                        "—"
                    ) : (
                        <NumberTicker
                            value={vanillaValue}
                            prefix="$"
                            minimumFractionDigits={2}
                            maximumFractionDigits={2}
                        />
                    )
                }
                hint="Half ETH, half USDC, unhedged"
                tone={atlasAhead ? "rose" : "default"}
            />
            <StatCard
                label="Atlas LP value"
                value={
                    <NumberTicker
                        value={atlasValue}
                        prefix="$"
                        minimumFractionDigits={2}
                        maximumFractionDigits={2}
                    />
                }
                hint="Delta-neutral, flat by design"
                tone="emerald"
            />
            <StatCard
                label="Atlas vs vanilla"
                value={
                    drawdownPct === null ? (
                        "—"
                    ) : (
                        <NumberTicker
                            value={versusValue}
                            prefix={atlasAhead ? "+" : "-"}
                            minimumFractionDigits={2}
                            maximumFractionDigits={2}
                            suffix="%"
                        />
                    )
                }
                hint={atlasAhead ? "Atlas is outperforming" : "Vanilla is ahead (briefly)"}
                tone={atlasAhead ? "emerald" : "rose"}
            />
        </div>
    );
}

function ChartPanel({points}: {points: ChartPoint[]}) {
    return (
        <div className="atlas-card-strong p-5">
            <SectionHeader
                eyebrow="Live chart"
                title="Position value over time"
                subtitle="Each new tick is an oracle read from on-chain. Pressing a trigger fires a setPrice tx and adds a step."
            />
            <PriceChart data={points} />
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
                <Legend color="#10b981" label="Atlas LP (hedged)" />
                <Legend color="#71717a" label="Vanilla LP (unhedged)" />
            </div>
        </div>
    );
}

function Legend({color, label}: {color: string; label: string}) {
    return (
        <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{backgroundColor: color}} />
            {label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// TriggerButton — press feedback with spring + active pulse.
// ---------------------------------------------------------------------------

function TriggerButton({
    button,
    disabled,
    active,
    onTrigger,
}: {
    button: {pct: number; label: string; hint: string; tone: "rose" | "muted" | "emerald"};
    disabled: boolean;
    active: boolean;
    onTrigger: (deltaPct: number) => void;
}) {
    const reduced = useReducedMotion();
    const toneClass =
        button.tone === "rose"
            ? "border-rose-500/30 text-rose-200 hover:border-rose-500/60 hover:bg-rose-500/10"
            : button.tone === "emerald"
              ? "border-emerald-500/30 text-emerald-200 hover:border-emerald-500/60 hover:bg-emerald-500/10"
              : "border-white/10 text-zinc-200 hover:border-white/25 hover:bg-white/[0.04]";

    const interaction = reduced
        ? {}
        : {
              whileHover: disabled ? undefined : {scale: 1.02},
              whileTap: disabled ? undefined : {scale: 0.96},
              transition: {type: "spring" as const, stiffness: 380, damping: 24, mass: 0.6},
          };

    return (
        <motion.button
            disabled={disabled}
            onClick={() => onTrigger(button.pct)}
            className={`group relative flex flex-col items-center justify-center gap-1.5 rounded-xl border px-4 py-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass} ${active ? "ring-2 ring-emerald-400/60" : ""}`}
            {...interaction}
        >
            <span className="text-base font-semibold">{button.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                press{" "}
                <kbd className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-zinc-300">{button.hint}</kbd>
            </span>
            {active && (
                <span className="absolute right-2 top-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            )}
        </motion.button>
    );
}

// ---------------------------------------------------------------------------
// Trigger panel
// ---------------------------------------------------------------------------

function TriggerPanel({
    onTrigger,
    busy,
    isConnected,
    currentPrice,
    lastTrigger,
}: {
    onTrigger: (deltaPct: number) => void;
    busy: boolean;
    isConnected: boolean;
    currentPrice: number | null;
    lastTrigger: number | null;
}) {
    const buttons: {pct: number; label: string; hint: string; tone: "rose" | "muted" | "emerald"}[] = [
        {pct: -15, label: "Dump 15%", hint: "1", tone: "rose"},
        {pct: -5, label: "Dump 5%", hint: "2", tone: "muted"},
        {pct: 5, label: "Pump 5%", hint: "3", tone: "muted"},
        {pct: 15, label: "Pump 15%", hint: "4", tone: "emerald"},
    ];

    return (
        <section className="atlas-card-strong p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Demo controls
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight text-white">Trigger volatility</h2>
                    <p className="mt-1.5 max-w-xl text-sm text-zinc-400">
                        Each button fires one <span className="font-mono text-zinc-300">setPrice()</span> tx on the
                        Atlas oracle. The chart updates within seconds. ~15-20 seconds later the Reactive Network
                        callback lands.
                    </p>
                </div>
                {!isConnected && (
                    <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                        <Dot color="#fbbf24" /> Connect wallet to trigger
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {buttons.map((b) => (
                    <TriggerButton
                        key={b.pct}
                        button={b}
                        disabled={!isConnected || busy || currentPrice === null}
                        active={lastTrigger === b.pct && busy}
                        onTrigger={onTrigger}
                    />
                ))}
            </div>

            <p className="mt-4 text-xs text-zinc-500">
                {busy ? (
                    <span className="inline-flex items-center gap-2 text-emerald-400">
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        Transaction pending. Chart will update once the new price is on-chain.
                    </span>
                ) : (
                    <>
                        Keyboard shortcuts <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd> map to the four
                        buttons left-to-right.
                    </>
                )}
            </p>
        </section>
    );
}

function Kbd({children}: {children: React.ReactNode}) {
    return (
        <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
            {children}
        </kbd>
    );
}

function Dot({color}: {color: string}) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{background: color}} />;
}
