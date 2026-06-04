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
        <section className="border border-zinc-900 rounded-xl p-6 mt-6 bg-zinc-950">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Live Reactive event feed</h2>
                <span className="text-xs text-zinc-500">{events.length} callbacks observed</span>
            </div>
            <p className="text-sm text-zinc-500 mb-5">
                Each row below is a <code className="text-zinc-300">RebalanceCallbackReceived</code> event emitted
                by AtlasHook after a cross-chain callback from Lasna landed and completed. Trigger a price move
                above; a new row will stream in within roughly 15-20 seconds.
            </p>

            {events.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
                    No events observed yet. Trigger a volatility event above to see the first cross-chain callback.
                </div>
            ) : (
                <ul className="divide-y divide-zinc-900 border border-zinc-900 rounded-lg overflow-hidden">
                    {events.slice(0, 12).map((e) => (
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
        <li className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <div className="min-w-0">
                    <div className="font-medium text-zinc-200">
                        Callback #{ev.nonce.toString()}{" "}
                        <span className={`ml-2 text-xs ${deltaPositive ? "text-rose-400" : "text-emerald-400"}`}>
                            {deltaPositive ? "+" : ""}
                            {deltaEth} ETH hedge
                        </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                        {ago} ·{" "}
                        <a
                            href={`https://sepolia.uniscan.xyz/tx/${ev.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-zinc-300"
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
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
            >
                Lasna RSC ↗
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
