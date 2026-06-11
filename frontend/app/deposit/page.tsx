"use client";

import {useCallback, useEffect, useState} from "react";
import {useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {formatUnits, maxUint256, parseUnits} from "viem";
import {ATLAS} from "@/lib/contracts";
import {ATLAS_VAULT_ABI, ERC20_ABI} from "@/lib/abis";
import {Chip, PageFrame, PrimaryButton, SecondaryButton, Shell, StatCard} from "@/components/Shell";
import {FadeIn, HoverLift, NumberTicker, Stagger, StaggerItem} from "@/components/motion/Motion";

const FAUCET_AMOUNT = parseUnits("10000", 18);

export default function DepositPage() {
    const {address, isConnected} = useAccount();
    const [amount, setAmount] = useState("");
    const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
    const [pendingAction, setPendingAction] = useState<"faucet" | "approve" | "deposit" | "withdraw" | null>(null);

    const {data: usdcBalance, refetch: refetchUsdc} = useReadContract({
        address: ATLAS.usdc,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: !!address, refetchInterval: 5000},
    });

    const {data: aLpBalance, refetch: refetchALp} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: !!address, refetchInterval: 5000},
    });

    const {data: allowance, refetch: refetchAllowance} = useReadContract({
        address: ATLAS.usdc,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, ATLAS.vault] : undefined,
        query: {enabled: !!address, refetchInterval: 5000},
    });

    const {data: previewRedeem} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "previewRedeem",
        args: aLpBalance !== undefined ? [aLpBalance as bigint] : undefined,
        query: {enabled: aLpBalance !== undefined && (aLpBalance as bigint) > 0n, refetchInterval: 5000},
    });

    const {data: totalAssets} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "totalAssets",
        query: {refetchInterval: 10000},
    });

    const {data: couponBps} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "couponBps",
        query: {refetchInterval: 10000},
    });

    const {data: bufferHealth} = useReadContract({
        address: ATLAS.vault,
        abi: ATLAS_VAULT_ABI,
        functionName: "bufferHealth",
        query: {refetchInterval: 10000},
    });

    const {writeContractAsync} = useWriteContract();
    const {isLoading: txMining} = useWaitForTransactionReceipt({hash: pendingTx});

    useEffect(() => {
        if (!txMining && pendingTx) {
            refetchUsdc();
            refetchALp();
            refetchAllowance();
            setPendingTx(undefined);
            setPendingAction(null);
        }
    }, [txMining, pendingTx, refetchUsdc, refetchALp, refetchAllowance]);

    const amountWei = amount && !isNaN(Number(amount)) ? parseUnits(amount, 18) : 0n;
    const needsApprove = amountWei > 0n && (allowance === undefined || (allowance as bigint) < amountWei);
    const hasBalance = usdcBalance !== undefined && (usdcBalance as bigint) >= amountWei;

    const claimFaucet = useCallback(async () => {
        if (!address) return;
        setPendingAction("faucet");
        try {
            const hash = await writeContractAsync({
                address: ATLAS.usdc,
                abi: ERC20_ABI,
                functionName: "mint",
                args: [address, FAUCET_AMOUNT],
            });
            setPendingTx(hash);
        } catch (err) {
            console.error(err);
            setPendingAction(null);
        }
    }, [address, writeContractAsync]);

    const approve = useCallback(async () => {
        setPendingAction("approve");
        try {
            const hash = await writeContractAsync({
                address: ATLAS.usdc,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [ATLAS.vault, maxUint256],
            });
            setPendingTx(hash);
        } catch (err) {
            console.error(err);
            setPendingAction(null);
        }
    }, [writeContractAsync]);

    const deposit = useCallback(async () => {
        if (!address || amountWei === 0n) return;
        setPendingAction("deposit");
        try {
            const hash = await writeContractAsync({
                address: ATLAS.vault,
                abi: ATLAS_VAULT_ABI,
                functionName: "deposit",
                args: [amountWei, address],
            });
            setPendingTx(hash);
            setAmount("");
        } catch (err) {
            console.error(err);
            setPendingAction(null);
        }
    }, [address, amountWei, writeContractAsync]);

    const withdrawAll = useCallback(async () => {
        if (!address || aLpBalance === undefined || (aLpBalance as bigint) === 0n) return;
        if (previewRedeem === undefined) return;
        setPendingAction("withdraw");
        try {
            const hash = await writeContractAsync({
                address: ATLAS.vault,
                abi: ATLAS_VAULT_ABI,
                functionName: "withdraw",
                args: [previewRedeem as bigint, address, address],
            });
            setPendingTx(hash);
        } catch (err) {
            console.error(err);
            setPendingAction(null);
        }
    }, [address, aLpBalance, previewRedeem, writeContractAsync]);

    const busy = !!pendingAction || txMining;

    return (
        <Shell>
            <PageFrame>
                <Header />
                <VaultStats
                    totalAssets={totalAssets as bigint | undefined}
                    couponBps={couponBps as bigint | undefined}
                    bufferHealth={bufferHealth as bigint | undefined}
                />
                <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                    <DepositCard
                        isConnected={isConnected}
                        usdcBalance={usdcBalance as bigint | undefined}
                        amount={amount}
                        setAmount={setAmount}
                        needsApprove={needsApprove}
                        hasBalance={hasBalance}
                        busy={busy}
                        pendingAction={pendingAction}
                        claimFaucet={claimFaucet}
                        approve={approve}
                        deposit={deposit}
                    />
                    <PositionCard
                        aLpBalance={aLpBalance as bigint | undefined}
                        previewRedeem={previewRedeem as bigint | undefined}
                        couponBps={couponBps as bigint | undefined}
                        busy={busy}
                        pendingAction={pendingAction}
                        withdrawAll={withdrawAll}
                    />
                </div>
                <Explainer />
            </PageFrame>
        </Shell>
    );
}

function Header() {
    return (
        <div className="mb-8">
            <Chip tone="emerald">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                ERC-4626 vault · Unichain Sepolia
            </Chip>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Deposit into <span className="atlas-text-emerald-gradient">Atlas</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                Mint test USDC, deposit it into the vault, receive aLP shares. Shares appreciate at the flat
                per-block coupon rate. Mocks let you test without a Sepolia faucet.
            </p>
        </div>
    );
}

function VaultStats({
    totalAssets,
    couponBps,
    bufferHealth,
}: {
    totalAssets?: bigint;
    couponBps?: bigint;
    bufferHealth?: bigint;
}) {
    const tvlNum =
        totalAssets === undefined ? null : Number(totalAssets) / 1e18;
    const aprNum = couponBps === undefined ? null : Number(couponBps) / 100;
    const bhDisplay =
        bufferHealth === undefined
            ? "—"
            : bufferHealth === maxUint256
              ? "∞"
              : `${(Number(bufferHealth) / 10000).toFixed(2)}x`;
    return (
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" staggerChildren={0.08}>
            <StaggerItem variant="scaleIn">
                <HoverLift>
                    <StatCard
                        label="Vault TVL"
                        value={
                            <span>
                                {tvlNum === null ? "—" : <NumberTicker value={tvlNum} maximumFractionDigits={0} />}
                                <span className="ml-1.5 text-base text-zinc-500">USDC</span>
                            </span>
                        }
                        hint="Total assets under management"
                        tone="emerald"
                    />
                </HoverLift>
            </StaggerItem>
            <StaggerItem variant="scaleIn">
                <HoverLift>
                    <StatCard
                        label="Current coupon"
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
                        hint="Flat per-block APR"
                        tone="emerald"
                    />
                </HoverLift>
            </StaggerItem>
            <StaggerItem variant="scaleIn">
                <HoverLift>
                    <StatCard
                        label="Buffer health"
                        value={bhDisplay}
                        hint="Vault surplus vs 30-day obligation"
                        tone="sky"
                    />
                </HoverLift>
            </StaggerItem>
        </Stagger>
    );
}

function DepositCard({
    isConnected,
    usdcBalance,
    amount,
    setAmount,
    needsApprove,
    hasBalance,
    busy,
    pendingAction,
    claimFaucet,
    approve,
    deposit,
}: {
    isConnected: boolean;
    usdcBalance?: bigint;
    amount: string;
    setAmount: (v: string) => void;
    needsApprove: boolean;
    hasBalance: boolean;
    busy: boolean;
    pendingAction: string | null;
    claimFaucet: () => void;
    approve: () => void;
    deposit: () => void;
}) {
    const usdcDisplay = usdcBalance === undefined ? "0.00" : fmt(usdcBalance, 2);
    return (
        <section className="atlas-card-strong p-6">
            <div className="mb-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Action</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Deposit USDC</h2>
                <p className="mt-1 text-sm text-zinc-400">
                    USDC in, aLP out. Mint test tokens first if your balance is zero.
                </p>
            </div>

            <div className="atlas-card mb-4 p-5">
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
                    <span>Amount (USDC)</span>
                    <span>
                        Wallet:{" "}
                        <button
                            disabled={!isConnected || usdcBalance === undefined}
                            onClick={() =>
                                setAmount(usdcBalance !== undefined ? formatUnits(usdcBalance, 18) : "")
                            }
                            className="text-zinc-300 underline underline-offset-2 hover:text-white disabled:opacity-40"
                        >
                            {usdcDisplay}
                        </button>
                    </span>
                </div>
                <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                    className="w-full bg-transparent text-3xl font-semibold tabular-nums text-white outline-none placeholder:text-zinc-700"
                />
                <div className="mt-2 flex gap-2">
                    {["100", "1000", "5000"].map((q) => (
                        <button
                            key={q}
                            onClick={() => setAmount(q)}
                            className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
                        >
                            {q}
                        </button>
                    ))}
                    {usdcBalance !== undefined && (
                        <button
                            onClick={() => setAmount(formatUnits(usdcBalance, 18))}
                            className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[11px] text-emerald-300 transition-colors hover:border-emerald-500/40"
                        >
                            MAX
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <SecondaryButton
                    onClick={claimFaucet}
                    disabled={!isConnected || busy}
                    size="lg"
                >
                    {pendingAction === "faucet" ? "Minting…" : "Mint 10,000 test USDC"}
                </SecondaryButton>

                {needsApprove ? (
                    <PrimaryButton
                        onClick={approve}
                        disabled={!isConnected || busy || amount === "" || !hasBalance}
                        size="lg"
                    >
                        {pendingAction === "approve" ? "Approving…" : "Approve vault to spend USDC"}
                    </PrimaryButton>
                ) : (
                    <PrimaryButton
                        onClick={deposit}
                        disabled={!isConnected || busy || amount === "" || !hasBalance}
                        size="lg"
                    >
                        {pendingAction === "deposit" ? "Depositing…" : "Deposit"}
                    </PrimaryButton>
                )}

                {!isConnected && (
                    <p className="mt-1 text-xs text-amber-300">
                        Connect a wallet on Unichain Sepolia to use this page.
                    </p>
                )}
            </div>
        </section>
    );
}

function PositionCard({
    aLpBalance,
    previewRedeem,
    couponBps,
    busy,
    pendingAction,
    withdrawAll,
}: {
    aLpBalance?: bigint;
    previewRedeem?: bigint;
    couponBps?: bigint;
    busy: boolean;
    pendingAction: string | null;
    withdrawAll: () => void;
}) {
    const hasPosition = aLpBalance !== undefined && aLpBalance > 0n;
    const sharesDisplay = aLpBalance === undefined ? "0.00" : fmt(aLpBalance, 4);
    const claimDisplay = previewRedeem === undefined ? "0.00" : fmt(previewRedeem, 4);
    const yieldUsd =
        previewRedeem !== undefined && aLpBalance !== undefined && previewRedeem > aLpBalance
            ? fmt(previewRedeem - aLpBalance, 4)
            : "0.00";

    return (
        <section className="atlas-card-strong p-6">
            <div className="mb-5 flex items-start justify-between">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Your stake
                    </div>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">aLP position</h2>
                </div>
                {hasPosition && (
                    <Chip tone="emerald">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Earning
                    </Chip>
                )}
            </div>

            {!hasPosition ? (
                <div className="atlas-card flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="14" rx="2" />
                            <path d="M12 9v6M9 12h6" />
                        </svg>
                    </span>
                    <div className="text-sm text-zinc-400">No deposit yet</div>
                    <div className="text-[11px] text-zinc-500">Mint test USDC, then deposit to mint aLP shares</div>
                </div>
            ) : (
                <>
                    <div className="mb-4 grid grid-cols-2 gap-3">
                        <StatCard label="aLP shares" value={sharesDisplay} />
                        <StatCard label="Claim value" value={`${claimDisplay} USDC`} tone="emerald" />
                        <StatCard
                            label="Accrued yield"
                            value={`+${yieldUsd}`}
                            hint={couponBps ? `at ${(Number(couponBps) / 100).toFixed(2)}% APR` : ""}
                            tone="emerald"
                        />
                        <StatCard label="Asset" value="USDC" hint="ERC-4626 underlying" />
                    </div>
                    <SecondaryButton onClick={withdrawAll} disabled={busy} size="lg">
                        {pendingAction === "withdraw" ? "Withdrawing…" : "Withdraw everything"}
                    </SecondaryButton>
                </>
            )}
        </section>
    );
}

function Explainer() {
    return (
        <FadeIn whenInView y={16} as="section" className="atlas-card-strong mt-6 p-6">
            <div className="mb-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                    What you are seeing
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">The vault flow</h2>
            </div>
            <Stagger className="grid gap-4 sm:grid-cols-2" whenInView staggerChildren={0.07}>
                <StaggerItem>
                    <HoverLift>
                        <ExplainItem
                            n="01"
                            title="Mock tokens, real flow"
                            body="The mock USDC and WETH are local testnet tokens. The mint button gives you 10k test USDC, bypassing the Sepolia faucet."
                        />
                    </HoverLift>
                </StaggerItem>
                <StaggerItem>
                    <HoverLift>
                        <ExplainItem
                            n="02"
                            title="Deposits mint aLP shares"
                            body="One transaction transfers USDC to the vault and mints ERC-4626 aLP shares to your wallet. previewRedeem tells you the current claim value."
                        />
                    </HoverLift>
                </StaggerItem>
                <StaggerItem>
                    <HoverLift>
                        <ExplainItem
                            n="03"
                            title="Shares accrue lazily"
                            body="totalAssets grows in storage at the coupon rate. No per-block gas. Your previewRedeem goes up over time without any action."
                        />
                    </HoverLift>
                </StaggerItem>
                <StaggerItem>
                    <HoverLift>
                        <ExplainItem
                            n="04"
                            title="Buffer health protects payouts"
                            body="Above 1.5x means the vault is over-funded. Below 0.5x triggers auto-pause and a coupon halve until the buffer recovers."
                        />
                    </HoverLift>
                </StaggerItem>
            </Stagger>
        </FadeIn>
    );
}

function ExplainItem({n, title, body}: {n: string; title: string; body: string}) {
    return (
        <div className="atlas-card p-5">
            <div className="font-mono text-xs text-emerald-400">{n}</div>
            <div className="mt-3 text-sm font-semibold text-white">{title}</div>
            <div className="mt-1 text-xs leading-relaxed text-zinc-400">{body}</div>
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
