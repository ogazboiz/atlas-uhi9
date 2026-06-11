"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useAccount, usePublicClient, useReadContract} from "wagmi";
import {parseAbiItem} from "viem";
import {ATLAS} from "@/lib/contracts";
import {ATLAS_VAULT_ABI, ERC20_ABI} from "@/lib/abis";
import {AtlasChat} from "@/components/AtlasChat";
import {Chip, PageFrame, PrimaryButton, SecondaryButton, Shell, StatCard} from "@/components/Shell";

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

    useEffect(() => {
        if (!publicClient || !address) return;
        let cancelled = false;
        (async () => {
            try {
                const latest = await publicClient.getBlockNumber();
                const fromBlock = latest > 20000n ? latest - 20000n : 0n;
                const logs = await publicClient.getLogs({
                    address: ATLAS.vault,
                    event: DEPOSIT_EVENT,
                    fromBlock,
                    toBlock: "latest",
                });
                if (cancelled) return;
                const mine = logs.filter(
                    (log) => (log.args.owner ?? "").toLowerCase() === address.toLowerCase(),
                );
                const records = await Promise.all(
                    mine.map(async (log) => {
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
    const haveBasis = deposits.length > 0;
    const yieldAmount = haveBasis && claim > totalDeposited ? claim - totalDeposited : 0n;
    const aprStr = couponBps === undefined ? "—" : `${(Number(couponBps) / 100).toFixed(2)}%`;

    return (
        <Shell>
            <PageFrame>
                <div className="mb-8">
                    <Chip tone="emerald">Your stake on Atlas</Chip>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Your <span className="atlas-text-emerald-gradient">positions</span>
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                        aLP shares accrue value at the live coupon rate. Each row below is a deposit you made into
                        the vault on Unichain Sepolia.
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
                            haveBasis={haveBasis}
                        />
                        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                            <DepositHistory deposits={deposits} />
                            <AtlasChat
                                title="Ask Atlas"
                                context={{
                                    page: "/positions",
                                    walletAddress: address,
                                    aLpShares: (aLpBalance as bigint | undefined)?.toString() ?? "0",
                                    claimValueUsdc1e18: claim.toString(),
                                    totalDepositedUsdc1e18: totalDeposited.toString(),
                                    accruedYieldUsdc1e18: yieldAmount.toString(),
                                    currentCouponBps:
                                        couponBps !== undefined ? (couponBps as bigint).toString() : "unknown",
                                    walletUsdc1e18: ((usdcBalance as bigint | undefined) ?? 0n).toString(),
                                    depositCount: deposits.length,
                                }}
                                opener="Hi. I can answer questions about your Atlas position using live on-chain reads. Try: 'How much yield have I earned?' or 'What is the vault buffer health right now?'"
                            />
                        </div>
                    </>
                )}

                <ActionRow />
            </PageFrame>
        </Shell>
    );
}

function ConnectCallout() {
    return (
        <div className="atlas-card-strong flex flex-col items-center justify-center gap-3 p-12 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
            </span>
            <div className="text-base font-semibold text-white">Wallet not connected</div>
            <div className="max-w-md text-sm text-zinc-400">
                Connect a wallet on Unichain Sepolia to load your aLP shares and deposit history.
            </div>
            <div className="mt-2">
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
    haveBasis,
}: {
    shares: bigint;
    claim: bigint;
    deposited: bigint;
    yieldAmount: bigint;
    apr: string;
    usdcBalance: bigint;
    haveBasis: boolean;
}) {
    const hasPosition = shares > 0n;
    const yieldValue = !hasPosition ? "—" : haveBasis ? `+${fmt(yieldAmount, 4)}` : "—";
    const yieldHint = !hasPosition
        ? ""
        : haveBasis
          ? `at ${apr} · cost basis ${fmt(deposited, 2)} USDC`
          : "Deposit history not yet indexed";

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard label="aLP shares" value={hasPosition ? fmt(shares, 4) : "—"} hint="ERC-4626 token balance" />
            <StatCard
                label="Claim value"
                value={hasPosition ? `${fmt(claim, 2)} USDC` : "—"}
                hint="Live previewRedeem read"
                tone="emerald"
            />
            <StatCard label="Accrued yield" value={yieldValue} hint={yieldHint} tone="emerald" />
            <StatCard label="USDC wallet" value={fmt(usdcBalance, 2)} hint="Mock test USDC" />
        </div>
    );
}

function DepositHistory({deposits}: {deposits: DepositRecord[]}) {
    return (
        <section className="atlas-card-strong p-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        On-chain log
                    </div>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Deposit history</h2>
                </div>
                <span className="font-mono text-[11px] text-zinc-500">{deposits.length} deposits</span>
            </div>

            {deposits.length === 0 ? (
                <div className="atlas-card flex flex-col items-center gap-2 border-dashed p-10 text-center">
                    <div className="text-sm text-zinc-400">No deposits yet</div>
                    <div className="text-[11px] text-zinc-500">
                        Visit{" "}
                        <Link href="/deposit" className="underline underline-offset-2 hover:text-white">
                            /deposit
                        </Link>{" "}
                        to mint test USDC and make your first deposit
                    </div>
                </div>
            ) : (
                <ul className="atlas-card divide-y divide-white/[0.04] overflow-hidden">
                    {deposits.map((d) => (
                        <li
                            key={d.txHash}
                            className="atlas-fade-in flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                        >
                            <div>
                                <div className="font-semibold tabular-nums text-emerald-300">+{fmt(d.assets, 2)} USDC</div>
                                <div className="mt-0.5 text-[11px] text-zinc-500">
                                    {relativeTime(Math.floor(Date.now() / 1000) - d.timestamp)} ·{" "}
                                    <a
                                        href={`https://sepolia.uniscan.xyz/tx/${d.txHash}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono underline underline-offset-2 hover:text-zinc-300"
                                    >
                                        {short(d.txHash)}
                                    </a>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-sm text-zinc-200">{fmt(d.shares, 4)}</div>
                                <div className="text-[10px] text-zinc-500">aLP minted</div>
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
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href="/deposit" size="lg">
                Add to your position
            </PrimaryButton>
            <SecondaryButton href="/compare" size="lg">
                See the hedge in action →
            </SecondaryButton>
        </div>
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
