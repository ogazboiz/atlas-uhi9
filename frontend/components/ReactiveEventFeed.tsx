"use client";

import {useEffect, useState} from "react";
import {usePublicClient, useWatchContractEvent} from "wagmi";
import {parseAbiItem, type Log} from "viem";
import {ATLAS, REACTIVE} from "@/lib/contracts";

const REBALANCE_EVENT = parseAbiItem(
    "event RebalanceCallbackReceived(bytes32 indexed poolId, int256 appliedDelta, uint256 nonce)",
);

type FeedEvent = {
    nonce: bigint;
    appliedDelta: bigint;
    txHash: `0x${string}`;
    blockNumber: bigint;
    timestamp: number;
};

export function ReactiveEventFeed() {
    const publicClient = usePublicClient();
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [now, setNow] = useState(Math.floor(Date.now() / 1000));

    // Tick clock every 5s for relative-time display.
    useEffect(() => {
        const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
        return () => clearInterval(i);
    }, []);

    // Fetch historical events on mount.
    useEffect(() => {
        if (!publicClient) return;
        let cancelled = false;
        (async () => {
            try {
                const latest = await publicClient.getBlockNumber();
                const HISTORY = 50000n;
                const fromBlock = latest > HISTORY ? latest - HISTORY : 0n;
                const logs = await publicClient.getLogs({
                    address: ATLAS.hook,
                    event: REBALANCE_EVENT,
                    fromBlock,
                    toBlock: "latest",
                });
                if (cancelled) return;
                const enriched = await Promise.all(
                    logs.map(async (log) => {
                        const block = await publicClient.getBlock({blockHash: log.blockHash!});
                        return {
                            nonce: log.args.nonce!,
                            appliedDelta: log.args.appliedDelta!,
                            txHash: log.transactionHash!,
                            blockNumber: log.blockNumber!,
                            timestamp: Number(block.timestamp),
                        } satisfies FeedEvent;
                    }),
                );
                if (cancelled) return;
                setEvents(enriched.sort((a, b) => Number(b.blockNumber - a.blockNumber)));
            } catch (err) {
                console.error("failed to fetch history", err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [publicClient]);

    // Watch new events live.
    useWatchContractEvent({
        address: ATLAS.hook,
        abi: [REBALANCE_EVENT],
        eventName: "RebalanceCallbackReceived",
        onLogs: async (logs: Log[]) => {
            if (!publicClient) return;
            for (const raw of logs) {
                try {
                    const block = await publicClient.getBlock({blockHash: raw.blockHash!});
                    const args = (raw as {args?: {nonce?: bigint; appliedDelta?: bigint}}).args;
                    if (args?.nonce === undefined || args.appliedDelta === undefined) continue;
                    const ev: FeedEvent = {
                        nonce: args.nonce,
                        appliedDelta: args.appliedDelta,
                        txHash: raw.transactionHash!,
                        blockNumber: raw.blockNumber!,
                        timestamp: Number(block.timestamp),
                    };
                    setEvents((prev) => {
                        if (prev.some((e) => e.nonce === ev.nonce)) return prev;
                        return [ev, ...prev].sort((a, b) => Number(b.blockNumber - a.blockNumber));
                    });
                } catch (err) {
                    console.error("watch handler failed", err);
                }
            }
        },
    });

    return (
        <section className="atlas-card-strong p-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Live feed
                    </div>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                        Reactive callbacks
                    </h2>
                </div>
                <span className="font-mono text-[11px] text-zinc-500">
                    {events.length} observed
                </span>
            </div>

            <p className="mb-5 text-xs text-zinc-400">
                Each row is a{" "}
                <code className="rounded bg-white/[0.04] px-1 py-0.5 text-zinc-300">
                    RebalanceCallbackReceived
                </code>{" "}
                event after a cross-chain callback from Lasna landed. Press a trigger and watch a new row appear in
                ~15-20 seconds.
            </p>

            {events.length === 0 ? (
                <div className="atlas-card flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-200">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <div className="text-sm text-zinc-400">No callbacks yet</div>
                    <div className="text-[11px] text-zinc-500">Trigger volatility above to see the first one</div>
                </div>
            ) : (
                <ul className="atlas-card divide-y divide-white/[0.04] overflow-hidden">
                    {events.slice(0, 8).map((e) => (
                        <EventRow key={`${e.txHash}-${e.nonce}`} ev={e} now={now} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function EventRow({ev, now}: {ev: FeedEvent; now: number}) {
    const ago = relativeTime(now - ev.timestamp);
    const deltaEth = formatDelta(ev.appliedDelta);
    const deltaPositive = ev.appliedDelta > 0n;
    return (
        <li className="atlas-fade-in flex items-center justify-between gap-4 px-4 py-3.5 text-sm transition-colors hover:bg-white/[0.02]">
            <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-40" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
                </span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-500">#{ev.nonce.toString()}</span>
                        <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                deltaPositive
                                    ? "border-white/15 bg-white/[0.04] text-zinc-300"
                                    : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                            }`}
                        >
                            {deltaPositive ? "+" : "−"}
                            {deltaEth} ETH
                        </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                        {ago} ·{" "}
                        <a
                            href={`https://sepolia.uniscan.xyz/tx/${ev.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono underline underline-offset-2 hover:text-zinc-300"
                        >
                            {short(ev.txHash)}
                        </a>
                    </div>
                </div>
            </div>
            <a
                href={`${REACTIVE.reactiveExplorer}/address/${REACTIVE.reactive}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[11px] text-zinc-500 transition-colors hover:text-amber-200"
            >
                Lasna ↗
            </a>
        </li>
    );
}

function short(hash: string) {
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function relativeTime(seconds: number): string {
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDelta(weiDelta: bigint): string {
    const abs = weiDelta < 0n ? -weiDelta : weiDelta;
    // Show with up to 4 decimal places.
    const whole = abs / 10n ** 18n;
    const frac = ((abs % 10n ** 18n) * 10000n) / 10n ** 18n;
    const fracStr = frac.toString().padStart(4, "0").replace(/0+$/, "");
    return fracStr.length === 0 ? whole.toString() : `${whole}.${fracStr}`;
}
