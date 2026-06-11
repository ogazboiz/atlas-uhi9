"use client";

import {useEffect, useMemo, useState} from "react";
import {usePublicClient} from "wagmi";
import {parseAbiItem} from "viem";
import {ATLAS} from "@/lib/contracts";
import {AtlasChat} from "@/components/AtlasChat";
import {Chip, PageFrame, Shell, StatCard} from "@/components/Shell";
import {FadeIn, HoverLift, NumberTicker, Stagger, StaggerItem} from "@/components/motion/Motion";

type ActivityKind =
    | "Deposit"
    | "Withdraw"
    | "FeesDeposited"
    | "HedgeOpened"
    | "HedgeResized"
    | "HedgeClosed"
    | "RebalanceCallback";

type ActivityEvent = {
    kind: ActivityKind;
    blockNumber: bigint;
    timestamp: number;
    txHash: `0x${string}`;
    primary: string;
    secondary: string;
};

type FilterKey = "all" | "vault" | "hedge" | "reactive";

const FILTER_MATCH: Record<FilterKey, ActivityKind[] | null> = {
    all: null,
    vault: ["Deposit", "Withdraw", "FeesDeposited"],
    hedge: ["HedgeOpened", "HedgeResized", "HedgeClosed"],
    reactive: ["RebalanceCallback"],
};

const EVENTS = [
    {
        kind: "Deposit" as ActivityKind,
        address: ATLAS.vault,
        item: parseAbiItem(
            "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
        ),
        render: (l: {
            args: {sender?: `0x${string}`; owner?: `0x${string}`; assets?: bigint; shares?: bigint};
        }) => ({
            primary: `Deposit · ${fmt(l.args.assets ?? 0n, 2)} USDC`,
            secondary: `${shortAddr(l.args.owner ?? "0x0")} received ${fmt(l.args.shares ?? 0n, 4)} aLP`,
        }),
    },
    {
        kind: "Withdraw" as ActivityKind,
        address: ATLAS.vault,
        item: parseAbiItem(
            "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
        ),
        render: (l: {args: {owner?: `0x${string}`; assets?: bigint; shares?: bigint}}) => ({
            primary: `Withdraw · ${fmt(l.args.assets ?? 0n, 2)} USDC`,
            secondary: `${shortAddr(l.args.owner ?? "0x0")} burned ${fmt(l.args.shares ?? 0n, 4)} aLP`,
        }),
    },
    {
        kind: "FeesDeposited" as ActivityKind,
        address: ATLAS.vault,
        item: parseAbiItem("event FeesDeposited(uint256 amount)"),
        render: (l: {args: {amount?: bigint}}) => ({
            primary: `Hook fees → vault · ${fmt(l.args.amount ?? 0n, 4)} USDC`,
            secondary: "Routed via AtlasHook.notifyFees",
        }),
    },
    {
        kind: "HedgeOpened" as ActivityKind,
        address: ATLAS.hook,
        item: parseAbiItem("event HedgeOpened(bytes32 indexed poolId, bytes32 perpPositionId, uint256 size)"),
        render: (l: {args: {size?: bigint}}) => ({
            primary: `Hedge opened · ${fmt(l.args.size ?? 0n, 4)} ETH short`,
            secondary: "MockPerpAdapter received the open call",
        }),
    },
    {
        kind: "HedgeResized" as ActivityKind,
        address: ATLAS.hook,
        item: parseAbiItem("event HedgeResized(bytes32 indexed poolId, int256 delta, uint256 newTotalSize)"),
        render: (l: {args: {delta?: bigint; newTotalSize?: bigint}}) => {
            const d = l.args.delta ?? 0n;
            const sign = d < 0n ? "-" : "+";
            return {
                primary: `Hedge resized · ${sign}${fmt(d < 0n ? -d : d, 4)} ETH`,
                secondary: `New total ${fmt(l.args.newTotalSize ?? 0n, 4)} ETH`,
            };
        },
    },
    {
        kind: "HedgeClosed" as ActivityKind,
        address: ATLAS.hook,
        item: parseAbiItem("event HedgeClosed(bytes32 indexed poolId, int256 finalPnL)"),
        render: (l: {args: {finalPnL?: bigint}}) => ({
            primary: `Hedge closed · PnL ${(l.args.finalPnL ?? 0n) >= 0n ? "+" : "-"}${fmt(
                (l.args.finalPnL ?? 0n) >= 0n ? l.args.finalPnL ?? 0n : -(l.args.finalPnL ?? 0n),
                4,
            )}`,
            secondary: "Position fully unwound",
        }),
    },
    {
        kind: "RebalanceCallback" as ActivityKind,
        address: ATLAS.hook,
        item: parseAbiItem(
            "event RebalanceCallbackReceived(bytes32 indexed poolId, int256 appliedDelta, uint256 nonce)",
        ),
        render: (l: {args: {appliedDelta?: bigint; nonce?: bigint}}) => {
            const d = l.args.appliedDelta ?? 0n;
            const sign = d < 0n ? "-" : "+";
            return {
                primary: `Reactive callback #${l.args.nonce ?? 0n} · ${sign}${fmt(d < 0n ? -d : d, 4)} ETH`,
                secondary: "Cross-chain hedge adjustment from Lasna",
            };
        },
    },
] as const;

export default function ActivityPage() {
    const publicClient = usePublicClient();
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterKey>("all");

    useEffect(() => {
        if (!publicClient) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const latest = await publicClient.getBlockNumber();
                const fromBlock = latest > 50000n ? latest - 50000n : 0n;
                const allLogs: ActivityEvent[] = [];
                for (const cfg of EVENTS) {
                    const logs = await publicClient.getLogs({
                        address: cfg.address,
                        event: cfg.item,
                        fromBlock,
                        toBlock: "latest",
                    });
                    for (const log of logs) {
                        try {
                            const block = await publicClient.getBlock({blockHash: log.blockHash!});
                            const rendered = cfg.render(log as never);
                            allLogs.push({
                                kind: cfg.kind,
                                blockNumber: log.blockNumber!,
                                timestamp: Number(block.timestamp),
                                txHash: log.transactionHash!,
                                ...rendered,
                            });
                        } catch {
                            // skip undecodable
                        }
                    }
                }
                if (cancelled) return;
                setEvents(allLogs.sort((a, b) => Number(b.blockNumber - a.blockNumber)));
            } catch (err) {
                console.error("failed to load activity", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [publicClient]);

    const filtered = useMemo(() => {
        const match = FILTER_MATCH[filter];
        if (!match) return events;
        return events.filter((e) => match.includes(e.kind));
    }, [events, filter]);

    const counts = useMemo(() => {
        const deposits = events.filter((e) => e.kind === "Deposit").length;
        const withdraws = events.filter((e) => e.kind === "Withdraw").length;
        const callbacks = events.filter((e) => e.kind === "RebalanceCallback").length;
        return {deposits, withdraws, callbacks, total: events.length};
    }, [events]);

    return (
        <Shell>
            <PageFrame>
                <div className="mb-8">
                    <Chip tone="violet">Unified event timeline</Chip>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Activity
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                        Every on-chain event from the vault and hook. Pulled live from Unichain Sepolia. Reactive
                        callbacks from Lasna land here as rebalance entries.
                    </p>
                </div>

                <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" staggerChildren={0.07}>
                    <StaggerItem variant="scaleIn">
                        <HoverLift>
                            <StatCard
                                label="Total events"
                                value={loading ? "…" : <NumberTicker value={counts.total} />}
                                tone="default"
                            />
                        </HoverLift>
                    </StaggerItem>
                    <StaggerItem variant="scaleIn">
                        <HoverLift>
                            <StatCard
                                label="Deposits"
                                value={loading ? "…" : <NumberTicker value={counts.deposits} />}
                                tone="emerald"
                            />
                        </HoverLift>
                    </StaggerItem>
                    <StaggerItem variant="scaleIn">
                        <HoverLift>
                            <StatCard
                                label="Withdrawals"
                                value={loading ? "…" : <NumberTicker value={counts.withdraws} />}
                                tone="amber"
                            />
                        </HoverLift>
                    </StaggerItem>
                    <StaggerItem variant="scaleIn">
                        <HoverLift>
                            <StatCard
                                label="Reactive callbacks"
                                value={loading ? "…" : <NumberTicker value={counts.callbacks} />}
                                tone="violet"
                            />
                        </HoverLift>
                    </StaggerItem>
                </Stagger>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                    <FeedPanel
                        events={filtered}
                        loading={loading}
                        filter={filter}
                        setFilter={setFilter}
                        counts={counts}
                    />
                    <AtlasChat
                        title="Ask Atlas"
                        context={{
                            page: "/activity",
                            recentEvents: events.slice(0, 20).map((e) => ({
                                kind: e.kind,
                                blockNumber: e.blockNumber.toString(),
                                timestamp: e.timestamp,
                                primary: e.primary,
                                secondary: e.secondary,
                                txHash: e.txHash,
                            })),
                            totalEventCount: events.length,
                        }}
                        opener="I can summarise the activity on this page and answer questions about specific events. Try: 'How many reactive callbacks landed today?' or 'When was the last deposit?'"
                    />
                </div>
            </PageFrame>
        </Shell>
    );
}

function FeedPanel({
    events,
    loading,
    filter,
    setFilter,
    counts,
}: {
    events: ActivityEvent[];
    loading: boolean;
    filter: FilterKey;
    setFilter: (k: FilterKey) => void;
    counts: {deposits: number; withdraws: number; callbacks: number; total: number};
}) {
    const filters: {key: FilterKey; label: string; count: number}[] = [
        {key: "all", label: "All", count: counts.total},
        {key: "vault", label: "Vault", count: counts.deposits + counts.withdraws},
        {key: "hedge", label: "Hedge", count: 0},
        {key: "reactive", label: "Reactive", count: counts.callbacks},
    ];
    return (
        <section className="atlas-card-strong p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Timeline
                    </div>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Live events</h2>
                </div>
                <div className="flex flex-wrap gap-1">
                    {filters.map((f) => {
                        const active = filter === f.key;
                        return (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                                    active
                                        ? "bg-white text-black"
                                        : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
                                }`}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {loading ? (
                <ul className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <li key={i} className="atlas-card flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className="h-6 w-20 animate-pulse rounded bg-white/[0.04]" />
                                <div className="h-4 w-48 animate-pulse rounded bg-white/[0.04]" />
                            </div>
                            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04]" />
                        </li>
                    ))}
                </ul>
            ) : events.length === 0 ? (
                <div className="atlas-card flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
                    <div className="text-sm text-zinc-400">No events match this filter</div>
                    <div className="text-[11px] text-zinc-500">
                        Trigger an action on /compare or /deposit to populate the feed
                    </div>
                </div>
            ) : (
                <Stagger as="ul" className="atlas-card divide-y divide-white/[0.04] overflow-hidden" staggerChildren={0.03} delayChildren={0}>
                    {events.map((e, i) => (
                        <StaggerItem key={`${e.txHash}-${i}`}>
                            <li className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]">
                                <div className="flex min-w-0 items-center gap-3">
                                    <KindBadge kind={e.kind} />
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-zinc-100">{e.primary}</div>
                                        <div className="truncate text-[11px] text-zinc-500">{e.secondary}</div>
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className="text-[11px] text-zinc-400">
                                        {relativeTime(Math.floor(Date.now() / 1000) - e.timestamp)}
                                    </div>
                                    <a
                                        href={`https://sepolia.uniscan.xyz/tx/${e.txHash}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono text-[10px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
                                    >
                                        {short(e.txHash)}
                                    </a>
                                </div>
                            </li>
                        </StaggerItem>
                    ))}
                </Stagger>
            )}
        </section>
    );
}

function KindBadge({kind}: {kind: ActivityKind}) {
    // Strict single-accent palette. RebalanceCallback (the cross-chain hero
    // event) gets the amber primary. Everything else is neutral white/zinc.
    // Differentiation comes from the kind label itself, not hue.
    const primary = "bg-amber-500/10 text-amber-200 border-amber-400/30";
    const neutral = "bg-white/[0.04] text-zinc-300 border-white/10";
    const cls = kind === "RebalanceCallback" ? primary : neutral;
    return (
        <span
            className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${cls}`}
        >
            {kind}
        </span>
    );
}

function fmt(value: bigint, decimals: number): string {
    const whole = value / 10n ** 18n;
    const frac = ((value % 10n ** 18n) * 10n ** BigInt(decimals)) / 10n ** 18n;
    const fracStr = frac.toString().padStart(decimals, "0");
    return `${whole.toString()}.${fracStr}`;
}

function short(hash: string) {
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function shortAddr(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function relativeTime(seconds: number): string {
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
