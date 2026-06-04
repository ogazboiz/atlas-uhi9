"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {usePublicClient} from "wagmi";
import {parseAbiItem} from "viem";
import {ATLAS} from "@/lib/contracts";

type ActivityKind = "Deposit" | "Withdraw" | "FeesDeposited" | "HedgeOpened" | "HedgeResized" | "HedgeClosed" | "RebalanceCallback";

type ActivityEvent = {
    kind: ActivityKind;
    blockNumber: bigint;
    timestamp: number;
    txHash: `0x${string}`;
    primary: string; // short headline
    secondary: string; // detail line
};

const EVENTS = [
    {
        kind: "Deposit" as ActivityKind,
        address: ATLAS.vault,
        item: parseAbiItem("event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"),
        render: (l: {args: {sender?: `0x${string}`; owner?: `0x${string}`; assets?: bigint; shares?: bigint}}) => ({
            primary: `Deposit · ${fmt(l.args.assets ?? 0n, 2)} USDC`,
            secondary: `${shortAddr(l.args.owner ?? "0x0")} received ${fmt(l.args.shares ?? 0n, 4)} aLP`,
        }),
    },
    {
        kind: "Withdraw" as ActivityKind,
        address: ATLAS.vault,
        item: parseAbiItem("event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)"),
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
            primary: `Hedge closed · PnL ${(l.args.finalPnL ?? 0n) >= 0n ? "+" : "-"}${fmt((l.args.finalPnL ?? 0n) >= 0n ? (l.args.finalPnL ?? 0n) : -(l.args.finalPnL ?? 0n), 4)}`,
            secondary: "Position fully unwound",
        }),
    },
    {
        kind: "RebalanceCallback" as ActivityKind,
        address: ATLAS.hook,
        item: parseAbiItem("event RebalanceCallbackReceived(bytes32 indexed poolId, int256 appliedDelta, uint256 nonce)"),
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
                            // skip undecodable logs
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

    return (
        <div className="flex flex-col flex-1">
            <Header />
            <main className="flex flex-1 flex-col px-4 sm:px-6 py-6 sm:py-10 max-w-5xl mx-auto w-full">
                <div className="mb-6 sm:mb-8">
                    <Link href="/" className="text-xs text-zinc-500 hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 mb-2">Activity</h1>
                    <p className="text-zinc-400 max-w-2xl text-sm sm:text-base">
                        Unified timeline of every on-chain event from the vault and the hook. Pulled from the live
                        contracts on Unichain Sepolia. Reactive callbacks from Lasna land here as Rebalance entries.
                    </p>
                </div>

                <section className="border border-zinc-900 rounded-xl p-2 sm:p-4 bg-zinc-950">
                    {loading ? (
                        <Empty text="Loading recent events..." />
                    ) : events.length === 0 ? (
                        <Empty text="No events in the last 50k blocks. Trigger something on /compare or /deposit to populate this feed." />
                    ) : (
                        <ul className="divide-y divide-zinc-900">
                            {events.map((e, i) => (
                                <li key={`${e.txHash}-${i}`} className="px-3 sm:px-4 py-3 flex items-center justify-between gap-4 text-sm">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <KindBadge kind={e.kind} />
                                        <div className="min-w-0">
                                            <div className="font-medium text-zinc-200 truncate">{e.primary}</div>
                                            <div className="text-xs text-zinc-500 truncate">{e.secondary}</div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 text-xs text-zinc-500">
                                        <div>{relativeTime(Math.floor(Date.now() / 1000) - e.timestamp)}</div>
                                        <a
                                            href={`https://sepolia.uniscan.xyz/tx/${e.txHash}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline underline-offset-2 hover:text-zinc-300"
                                        >
                                            {short(e.txHash)}
                                        </a>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
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
            <div className="flex items-center gap-4">
                <Link href="/compare" className="text-sm text-zinc-400 hover:text-white hidden sm:inline">
                    Compare
                </Link>
                <Link href="/deposit" className="text-sm text-zinc-400 hover:text-white hidden sm:inline">
                    Deposit
                </Link>
                <Link href="/positions" className="text-sm text-zinc-400 hover:text-white hidden sm:inline">
                    Positions
                </Link>
                <ConnectButton showBalance={false} chainStatus="icon" />
            </div>
        </header>
    );
}

function KindBadge({kind}: {kind: ActivityKind}) {
    const styles: Record<ActivityKind, string> = {
        Deposit: "bg-emerald-950 text-emerald-300 border-emerald-900",
        Withdraw: "bg-amber-950 text-amber-300 border-amber-900",
        FeesDeposited: "bg-sky-950 text-sky-300 border-sky-900",
        HedgeOpened: "bg-emerald-950 text-emerald-300 border-emerald-900",
        HedgeResized: "bg-zinc-900 text-zinc-300 border-zinc-800",
        HedgeClosed: "bg-rose-950 text-rose-300 border-rose-900",
        RebalanceCallback: "bg-violet-950 text-violet-300 border-violet-900",
    };
    return (
        <span className={`px-2 py-1 text-[10px] uppercase tracking-wider font-mono rounded border shrink-0 ${styles[kind]}`}>
            {kind}
        </span>
    );
}

function Empty({text}: {text: string}) {
    return (
        <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
            {text}
        </div>
    );
}

function Footer() {
    return (
        <footer className="border-t border-zinc-900 px-6 py-8 text-xs text-zinc-500">
            <div className="max-w-5xl mx-auto">
                Vault {ATLAS.vault} · Hook {ATLAS.hook}
            </div>
        </footer>
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
