"use client";

import Link from "next/link";
import {useReadContract} from "wagmi";
import {formatUnits} from "viem";
import {ATLAS, REACTIVE} from "@/lib/contracts";
import {ATLAS_HOOK_ABI, ATLAS_VAULT_ABI, MOCK_ORACLE_ABI} from "@/lib/abis";
import {Chip, PageFrame, PrimaryButton, SecondaryButton, Shell, StatCard} from "@/components/Shell";
import {FadeIn, HoverLift, NumberTicker, SectionReveal, Stagger, StaggerItem} from "@/components/motion/Motion";

const EXPLORER = "https://sepolia.uniscan.xyz/address";

export default function HomePage() {
    return (
        <Shell>
            <Hero />
            <LiveMetricsRow />
            <FeatureHighlights />
            <HowItWorks />
            <DemoCallout />
            <ContractAttestations />
            <FinalCTA />
        </Shell>
    );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
    return (
        <section className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 -z-10 h-[600px] atlas-grid-bg opacity-40" />
            <div className="absolute left-1/2 top-0 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[120px]" />

            <PageFrame>
                <Stagger className="mx-auto max-w-4xl pt-8 text-center sm:pt-16" staggerChildren={0.08}>
                    <StaggerItem>
                        <Chip tone="emerald">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            </span>
                            UHI9 Hookathon · Reactive Network Sponsor Track · Live testnet
                        </Chip>
                    </StaggerItem>

                    <StaggerItem>
                        <h1 className="mt-7 text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl">
                            <span className="atlas-text-gradient">Hedged LP yield.</span>
                            <br />
                            <span className="atlas-text-emerald-gradient">Autonomous. Fixed APR.</span>
                        </h1>
                    </StaggerItem>

                    <StaggerItem>
                        <p className="mx-auto mt-7 max-w-2xl text-base text-zinc-400 sm:text-lg">
                            Atlas is a Uniswap v4 hook that pairs every LP deposit with a delta-matched perpetual
                            short. A Reactive Smart Contract handles rebalancing across chains. You earn a flat
                            8% APR while the system stays delta-neutral.
                        </p>
                    </StaggerItem>

                    <StaggerItem>
                        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <PrimaryButton href="/compare" size="lg">
                                Open the live demo
                                <Arrow />
                            </PrimaryButton>
                            <SecondaryButton href="/deposit" size="lg">
                                Try a deposit
                            </SecondaryButton>
                        </div>
                    </StaggerItem>

                    <StaggerItem>
                        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
                            <span className="flex items-center gap-1.5">
                                <Dot color="#10b981" /> 6 verified contracts
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Dot color="#38bdf8" /> 15-20s cross-chain loop
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Dot color="#a78bfa" /> 61/61 tests passing
                            </span>
                        </div>
                    </StaggerItem>
                </Stagger>
            </PageFrame>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Live metrics row (reads on-chain)
// ---------------------------------------------------------------------------

function LiveMetricsRow() {
    const {data: totalAssets} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "totalAssets",
        query: {refetchInterval: 6000},
    });
    const {data: couponBps} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "couponBps",
        query: {refetchInterval: 6000},
    });
    const {data: oraclePrice} = useReadContract({
        address: ATLAS.oracle,
        abi: MOCK_ORACLE_ABI,
        functionName: "getPrice",
        query: {refetchInterval: 6000},
    });
    const {data: reactiveCb} = useReadContract({
        address: ATLAS.hook,
        abi: ATLAS_HOOK_ABI,
        functionName: "reactiveCallback",
        query: {refetchInterval: 60000},
    });

    const tvlNum = totalAssets !== undefined ? Number(formatUnits(totalAssets as bigint, 18)) : null;
    const aprNum = couponBps !== undefined ? Number(couponBps) / 100 : null;
    const ethNum = oraclePrice !== undefined ? Number(formatUnits(oraclePrice as bigint, 18)) : null;
    const wired = reactiveCb !== undefined && (reactiveCb as string).toLowerCase() === REACTIVE.callback.toLowerCase();

    return (
        <PageFrame>
            <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" whenInView staggerChildren={0.08}>
                <StaggerItem variant="scaleIn">
                    <HoverLift>
                        <StatCard
                            label="Vault TVL"
                            value={
                                <span>
                                    {tvlNum === null ? (
                                        "—"
                                    ) : (
                                        <NumberTicker value={tvlNum} maximumFractionDigits={0} />
                                    )}
                                    <span className="ml-1.5 text-base text-zinc-500">USDC</span>
                                </span>
                            }
                            hint="Live on-chain reserves"
                            tone="emerald"
                            icon={<IconVault />}
                        />
                    </HoverLift>
                </StaggerItem>
                <StaggerItem variant="scaleIn">
                    <HoverLift>
                        <StatCard
                            label="Current APR"
                            value={
                                aprNum === null ? (
                                    "—"
                                ) : (
                                    <NumberTicker
                                        value={aprNum}
                                        minimumFractionDigits={2}
                                        maximumFractionDigits={2}
                                        suffix="%"
                                    />
                                )
                            }
                            hint="Flat per-block coupon"
                            tone="emerald"
                            icon={<IconChart />}
                        />
                    </HoverLift>
                </StaggerItem>
                <StaggerItem variant="scaleIn">
                    <HoverLift>
                        <StatCard
                            label="Reactive callback"
                            value={wired ? "Wired" : "—"}
                            hint="Cross-chain target on hook"
                            tone="violet"
                            icon={<IconBolt />}
                        />
                    </HoverLift>
                </StaggerItem>
                <StaggerItem variant="scaleIn">
                    <HoverLift>
                        <StatCard
                            label="ETH oracle"
                            value={
                                ethNum === null ? (
                                    "—"
                                ) : (
                                    <NumberTicker
                                        value={ethNum}
                                        prefix="$"
                                        minimumFractionDigits={2}
                                        maximumFractionDigits={2}
                                    />
                                )
                            }
                            hint="Updates trigger the loop"
                            tone="sky"
                            icon={<IconOracle />}
                        />
                    </HoverLift>
                </StaggerItem>
            </Stagger>
        </PageFrame>
    );
}

// ---------------------------------------------------------------------------
// Feature highlights
// ---------------------------------------------------------------------------

const FEATURES = [
    {
        title: "Delta-neutral by default",
        body: "Every LP add fires the v4 hook, which opens a matched perpetual short. Net price exposure: zero.",
        accent: "emerald",
        icon: <IconShield />,
    },
    {
        title: "Cross-chain autonomy",
        body: "A Reactive Smart Contract on Lasna watches the price oracle and resizes the hedge through a callback. No keeper.",
        accent: "violet",
        icon: <IconBolt />,
    },
    {
        title: "Smoothed payout",
        body: "Swap fees and funding income flow into an ERC-4626 vault that pays out a flat 8% APR per-block coupon.",
        accent: "sky",
        icon: <IconVault />,
    },
] as const;

function FeatureHighlights() {
    return (
        <PageFrame>
            <Stagger className="grid gap-3 sm:grid-cols-3 sm:gap-4" whenInView staggerChildren={0.1}>
                {FEATURES.map((f) => {
                    const ring =
                        f.accent === "emerald"
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                            : f.accent === "violet"
                              ? "bg-violet-500/10 text-violet-300 ring-violet-500/20"
                              : "bg-sky-500/10 text-sky-300 ring-sky-500/20";
                    return (
                        <StaggerItem key={f.title}>
                            <HoverLift>
                                <div className="atlas-card group h-full p-6 transition-colors hover:bg-white/[0.03]">
                                    <div
                                        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${ring}`}
                                    >
                                        {f.icon}
                                    </div>
                                    <h3 className="mb-1.5 text-base font-semibold tracking-tight text-white">
                                        {f.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
                                </div>
                            </HoverLift>
                        </StaggerItem>
                    );
                })}
            </Stagger>
        </PageFrame>
    );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
    {
        n: "01",
        title: "Add liquidity through Atlas",
        body: "An LP adds WETH + USDC to the v4 pool. The Atlas hook intercepts the add and registers the position with its volatile-asset delta.",
    },
    {
        n: "02",
        title: "Hedge opens automatically",
        body: "The hook calls the perp adapter and opens a matched perpetual short on the LP's behalf in the same transaction.",
    },
    {
        n: "03",
        title: "Reactive rebalancing",
        body: "An RSC on Reactive Lasna subscribes to oracle price updates. When the price drifts past threshold, it fires a cross-chain callback that resizes the hedge.",
    },
    {
        n: "04",
        title: "Vault deposits earn 8% APR",
        body: "Separately, anyone can deposit USDC into the ERC-4626 vault on /deposit and earn the flat per-block coupon. No LP exposure required.",
    },
];

function HowItWorks() {
    return (
        <PageFrame>
            <FadeIn whenInView className="mb-7 text-center">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Four moving parts
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">How Atlas works</h2>
            </FadeIn>
            <Stagger className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4" whenInView staggerChildren={0.08}>
                {STEPS.map((s) => (
                    <StaggerItem key={s.n}>
                        <HoverLift>
                            <div className="atlas-card h-full p-6">
                                <div className="text-xs font-mono text-emerald-400">{s.n}</div>
                                <h3 className="mt-4 text-base font-semibold tracking-tight text-white">{s.title}</h3>
                                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                            </div>
                        </HoverLift>
                    </StaggerItem>
                ))}
            </Stagger>
        </PageFrame>
    );
}

// ---------------------------------------------------------------------------
// Demo callout
// ---------------------------------------------------------------------------

function DemoCallout() {
    return (
        <PageFrame>
            <FadeIn whenInView y={20} className="atlas-card-strong relative overflow-hidden p-8 sm:p-10">
                <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
                <div className="relative grid items-center gap-6 lg:grid-cols-[1.4fr_1fr]">
                    <div>
                        <Chip tone="emerald">Live on testnet right now</Chip>
                        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                            See an Atlas LP stay flat while a vanilla LP bleeds.
                        </h3>
                        <p className="mt-3 max-w-xl text-sm text-zinc-400 sm:text-base">
                            One keystroke fires a 15% oracle dump on Unichain Sepolia. Watch the chart split in
                            real time, then watch the Reactive Network callback land in ~15-20 seconds.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <PrimaryButton href="/compare" size="lg">
                                Open /compare
                                <Arrow />
                            </PrimaryButton>
                            <Link
                                href="https://github.com/ogazboiz/atlas-uhi9"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-5 py-3.5 text-sm text-zinc-400 hover:text-white"
                            >
                                Read the code →
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <DemoMiniStat label="Atlas LP" value="$7,000" tone="emerald" sub="flat" />
                        <DemoMiniStat label="Vanilla LP" value="$5,950" tone="rose" sub="-15%" />
                        <DemoMiniStat label="Cross-chain latency" value="~18s" tone="violet" sub="observed" />
                        <DemoMiniStat label="Atlas advantage" value="+17.6%" tone="emerald" sub="after dump" />
                    </div>
                </div>
            </FadeIn>
        </PageFrame>
    );
}

function DemoMiniStat({
    label,
    value,
    sub,
    tone,
}: {
    label: string;
    value: string;
    sub: string;
    tone: "emerald" | "rose" | "violet";
}) {
    const text = {emerald: "text-emerald-300", rose: "text-rose-300", violet: "text-violet-300"}[tone];
    return (
        <div className="atlas-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
            <div className={`mt-1.5 text-xl font-semibold tracking-tight ${text}`}>{value}</div>
            <div className="text-[10px] text-zinc-500">{sub}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Verified contracts grid
// ---------------------------------------------------------------------------

const CONTRACTS = [
    {label: "Hook", address: ATLAS.hook},
    {label: "Vault", address: ATLAS.vault},
    {label: "PerpAdapter", address: ATLAS.perpAdapter},
    {label: "Oracle (demo)", address: ATLAS.oracle},
    {label: "Callback receiver", address: REACTIVE.callback},
];

function ContractAttestations() {
    return (
        <PageFrame>
            <FadeIn whenInView className="mb-6">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Onchain proof
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Six verified contracts
                </h2>
                <p className="mt-1.5 max-w-xl text-sm text-zinc-400">
                    Every Atlas contract is source-verified on Uniscan. The Reactive contract is verified on
                    reactscan.net. Click through to inspect the bytecode.
                </p>
            </FadeIn>
            <Stagger className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" whenInView staggerChildren={0.05}>
                {CONTRACTS.map((c) => (
                    <StaggerItem key={c.address}>
                        <HoverLift>
                            <a
                                href={`${EXPLORER}/${c.address}#code`}
                                target="_blank"
                                rel="noreferrer"
                                className="atlas-card group flex items-center justify-between p-4 transition-colors hover:bg-white/[0.04]"
                            >
                                <div>
                                    <div className="text-sm font-medium text-white">{c.label}</div>
                                    <div className="font-mono text-[11px] text-zinc-500">
                                        {c.address.slice(0, 6)}…{c.address.slice(-4)}
                                    </div>
                                </div>
                                <span className="text-xs text-zinc-500 transition-colors group-hover:text-emerald-400">
                                    →
                                </span>
                            </a>
                        </HoverLift>
                    </StaggerItem>
                ))}
                <StaggerItem>
                    <HoverLift>
                        <a
                            href={`${REACTIVE.reactiveExplorer}/address/${REACTIVE.reactive}`}
                            target="_blank"
                            rel="noreferrer"
                            className="atlas-card group flex items-center justify-between p-4 transition-colors hover:bg-white/[0.04]"
                        >
                            <div>
                                <div className="text-sm font-medium text-white">Reactive (Lasna)</div>
                                <div className="font-mono text-[11px] text-zinc-500">
                                    {REACTIVE.reactive.slice(0, 6)}…{REACTIVE.reactive.slice(-4)}
                                </div>
                            </div>
                            <span className="text-xs text-zinc-500 transition-colors group-hover:text-violet-400">
                                →
                            </span>
                        </a>
                    </HoverLift>
                </StaggerItem>
            </Stagger>
        </PageFrame>
    );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCTA() {
    return (
        <PageFrame>
            <FadeIn whenInView y={20} className="atlas-card-strong relative overflow-hidden p-10 text-center sm:p-14">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
                <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Ready to see it run?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 sm:text-base">
                    Connect on Unichain Sepolia, mint test USDC, and try a deposit. Or skip to /compare and trigger
                    the cross-chain rebalance with one keystroke.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <PrimaryButton href="/compare" size="lg">
                        Run the demo
                        <Arrow />
                    </PrimaryButton>
                    <SecondaryButton href="/deposit" size="lg">
                        Open vault
                    </SecondaryButton>
                </div>
            </FadeIn>
        </PageFrame>
    );
}

// ---------------------------------------------------------------------------
// Tiny icons
// ---------------------------------------------------------------------------

function Arrow() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
    );
}

function Dot({color}: {color: string}) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{background: color}} />;
}

function IconVault() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 9v6M9 12h6" />
        </svg>
    );
}

function IconChart() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
        </svg>
    );
}

function IconBolt() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
    );
}

function IconOracle() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18" />
        </svg>
    );
}

function IconShield() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L4 5v7c0 5 3.5 9 8 10 4.5-1 8-5 8-10V5l-8-3z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
}
