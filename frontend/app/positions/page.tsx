"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useAccount, usePublicClient, useReadContract} from "wagmi";
import {parseAbiItem} from "viem";
import {ATLAS} from "@/lib/contracts";
import {ATLAS_VAULT_ABI, ERC20_ABI} from "@/lib/abis";
import {AtlasChat} from "@/components/AtlasChat";

const DEPOSIT_EVENT = parseAbiItem(
    "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);

type DepositRecord = {
    blockNumber: bigint;
    timestamp: number;
    assets: bigint;
    shares: bigint;
    txHash: `0x${string}`;
};

export default function PositionsPage() {
    const {address, isConnected} = useAccount();
    const publicClient = usePublicClient();
    const [deposits, setDeposits] = useState<DepositRecord[]>([]);

    const {data: aLpBalance} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: !!address, refetchInterval: 5000},
    });
    const {data: previewRedeem} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "previewRedeem",
        args: aLpBalance !== undefined ? [aLpBalance as bigint] : undefined,
        query: {enabled: aLpBalance !== undefined && (aLpBalance as bigint) > 0n, refetchInterval: 5000},
    });
    const {data: couponBps} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "couponBps",
        query: {refetchInterval: 10000},
    });
    const {data: usdcBalance} = useReadContract({
        address: ATLAS.usdc,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: !!address, refetchInterval: 10000},
    });

    // Pull historical deposit events for this user from the vault.
    useEffect(() => {
        if (!publicClient || !address) return;
        let cancelled = false;
        (async () => {
            try {
                const latest = await publicClient.getBlockNumber();
                const fromBlock = latest > 100000n ? latest - 100000n : 0n;
                const logs = await publicClient.getLogs({
                    address: ATLAS.vault,
                    event: DEPOSIT_EVENT,
                    args: {owner: address},
                    fromBlock,
                    toBlock: "latest",
                });
                if (cancelled) return;
                const records = await Promise.all(
                    logs.map(async (log) => {
                        const block = await publicClient.getBlock({blockHash: log.blockHash!});
                        return {
                            blockNumber: log.blockNumber!,
                            timestamp: Number(block.timestamp),
                            assets: log.args.assets!,
                            shares: log.args.shares!,
                            txHash: log.transactionHash!,
                        } satisfies DepositRecord;
                    }),
                );
                if (cancelled) return;
                setDeposits(records.sort((a, b) => Number(b.blockNumber - a.blockNumber)));
            } catch (err) {
                console.error("failed to fetch deposit history", err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [publicClient, address]);

    const totalDeposited = deposits.reduce((sum, d) => sum + d.assets, 0n);
    const claim = (previewRedeem as bigint) ?? 0n;
    const yieldAmount = claim > totalDeposited ? claim - totalDeposited : 0n;
    const aprStr = couponBps === undefined ? "—" : `${(Number(couponBps) / 100).toFixed(2)}%`;

    return (
        <div className="flex flex-col flex-1">
            <Header />
            <main className="flex flex-1 flex-col px-4 sm:px-6 py-6 sm:py-10 max-w-5xl mx-auto w-full">
                <div className="mb-6 sm:mb-8">
                    <Link href="/" className="text-xs text-zinc-500 hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 mb-2">Your positions</h1>
                    <p className="text-zinc-400 max-w-2xl text-sm sm:text-base">
                        aLP shares accrue value at the current coupon rate. Each row below is a deposit you made
                        into the live vault on Unichain Sepolia.
                    </p>
                </div>

                {!isConnected ? (
                    <ConnectCallout />
                ) : (
                    <>
                        <Summary
                            shares={(aLpBalance as bigint) ?? 0n}
                            claim={claim}
                            deposited={totalDeposited}
                            yieldAmount={yieldAmount}
                            apr={aprStr}
                            usdcBalance={(usdcBalance as bigint) ?? 0n}
                        />
                        <DepositHistory deposits={deposits} />
                        <div className="mt-6">
                            <AtlasChat
                                title="Ask Atlas about your position"
                                context={{
                                    page: "/positions",
                                    walletAddress: address,
                                    aLpShares: (aLpBalance as bigint | undefined)?.toString() ?? "0",
                                    claimValueUsdc1e18: claim.toString(),
                                    totalDepositedUsdc1e18: totalDeposited.toString(),
                                    accruedYieldUsdc1e18: yieldAmount.toString(),
                                    currentCouponBps: couponBps !== undefined ? (couponBps as bigint).toString() : "unknown",
                                    walletUsdc1e18: ((usdcBalance as bigint | undefined) ?? 0n).toString(),
                                    depositCount: deposits.length,
                                }}
                                opener="Hi. I can answer questions about your Atlas position using only the live on-chain reads above. Try: 'Is my position earning?' or 'What is the buffer health right now?'"
                            />
                        </div>
                    </>
                )}

                <ActionRow />
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
                <Link href="/activity" className="text-sm text-zinc-400 hover:text-white hidden sm:inline">
                    Activity
                </Link>
                <ConnectButton showBalance={false} chainStatus="icon" />
            </div>
        </header>
    );
}

function ConnectCallout() {
    return (
        <div className="border border-zinc-900 rounded-xl p-8 bg-zinc-950 text-center">
            <p className="text-zinc-400 mb-4">Connect your wallet to view your aLP positions and deposit history.</p>
            <div className="flex justify-center">
                <ConnectButton />
            </div>
        </div>
    );
}

function Summary({
    shares,
    claim,
    deposited,
    yieldAmount,
    apr,
    usdcBalance,
}: {
    shares: bigint;
    claim: bigint;
    deposited: bigint;
    yieldAmount: bigint;
    apr: string;
    usdcBalance: bigint;
}) {
    const hasPosition = shares > 0n;
    return (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="aLP shares" value={hasPosition ? fmt(shares, 4) : "—"} />
            <Stat label="Claim value" value={hasPosition ? `${fmt(claim, 2)} USDC` : "—"} accent={hasPosition} />
            <Stat
                label="Accrued yield"
                value={hasPosition ? `+${fmt(yieldAmount, 4)}` : "—"}
                sub={hasPosition ? `at ${apr}` : ""}
            />
            <Stat label="USDC wallet" value={`${fmt(usdcBalance, 2)}`} sub="mock test USDC" />
        </section>
    );
}

function Stat({label, value, sub, accent}: {label: string; value: string; sub?: string; accent?: boolean}) {
    return (
        <div className="border border-zinc-900 rounded-lg p-4 bg-zinc-950">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
            <div className={`text-xl font-semibold tabular-nums ${accent ? "text-emerald-400" : "text-white"}`}>
                {value}
            </div>
            {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
        </div>
    );
}

function DepositHistory({deposits}: {deposits: DepositRecord[]}) {
    return (
        <section className="border border-zinc-900 rounded-xl p-6 mt-6 bg-zinc-950">
            <h2 className="text-xl font-semibold mb-1">Deposit history</h2>
            <p className="text-sm text-zinc-500 mb-5">
                Pulled from the vault&apos;s on-chain <code className="text-zinc-300">Deposit(address,address,uint256,uint256)</code>{" "}
                events. Most recent on top.
            </p>
            {deposits.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
                    No deposits yet from this wallet. Visit{" "}
                    <Link href="/deposit" className="underline underline-offset-2 hover:text-white">
                        /deposit
                    </Link>{" "}
                    to mint test USDC and make your first deposit.
                </div>
            ) : (
                <ul className="divide-y divide-zinc-900 border border-zinc-900 rounded-lg overflow-hidden">
                    {deposits.map((d) => (
                        <li
                            key={d.txHash}
                            className="px-4 py-3 flex items-center justify-between gap-4 text-sm"
                        >
                            <div>
                                <div className="font-medium text-zinc-200 tabular-nums">
                                    +{fmt(d.assets, 2)} USDC
                                </div>
                                <div className="text-xs text-zinc-500">
                                    {relativeTime(Math.floor(Date.now() / 1000) - d.timestamp)} ·{" "}
                                    <a
                                        href={`https://sepolia.uniscan.xyz/tx/${d.txHash}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline underline-offset-2 hover:text-zinc-300"
                                    >
                                        {short(d.txHash)}
                                    </a>
                                </div>
                            </div>
                            <div className="text-right text-xs text-zinc-500">
                                <div>{fmt(d.shares, 4)} aLP</div>
                                <div>shares minted</div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function ActionRow() {
    return (
        <section className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
                href="/deposit"
                className="flex-1 rounded-lg py-3 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-black text-center transition-colors"
            >
                Add to position
            </Link>
            <Link
                href="/compare"
                className="flex-1 rounded-lg py-3 text-sm font-medium border border-zinc-800 hover:border-zinc-600 text-zinc-300 text-center transition-colors"
            >
                See the hedge in action
            </Link>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-zinc-900 px-6 py-8 text-xs text-zinc-500">
            <div className="max-w-5xl mx-auto">
                Vault {ATLAS.vault} · USDC {ATLAS.usdc}
            </div>
        </footer>
    );
}

function fmt(value: bigint, decimals: number): string {
    const whole = value / 10n ** 18n;
    if (decimals === 0) return formatThousands(whole.toString());
    const frac = ((value % 10n ** 18n) * 10n ** BigInt(decimals)) / 10n ** 18n;
    const fracStr = frac.toString().padStart(decimals, "0");
    return `${formatThousands(whole.toString())}.${fracStr}`;
}

function formatThousands(s: string): string {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
