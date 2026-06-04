"use client";

import Link from "next/link";
import {useCallback, useState, useEffect} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {formatUnits, parseUnits, maxUint256} from "viem";
import {ATLAS} from "@/lib/contracts";
import {ERC20_ABI, ATLAS_VAULT_ABI} from "@/lib/abis";

const FAUCET_AMOUNT = parseUnits("10000", 18); // 10k mock USDC (18 dec)

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

    // Refetch reads when a tx confirms.
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
        <div className="flex flex-col flex-1">
            <Header />
            <main className="flex flex-1 flex-col px-4 sm:px-6 py-6 sm:py-10 max-w-5xl mx-auto w-full">
                <div className="mb-6 sm:mb-8">
                    <Link href="/" className="text-xs text-zinc-500 hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 mb-2">
                        Deposit into Atlas
                    </h1>
                    <p className="text-zinc-400 max-w-2xl text-sm sm:text-base">
                        Mint mock USDC, deposit into the vault, and receive <code className="text-zinc-300">aLP</code>{" "}
                        tokens that accrue a flat per-block coupon. The pool, hook, vault, and reactive rebalancing
                        are all live on Unichain Sepolia.
                    </p>
                </div>

                <VaultStats totalAssets={totalAssets as bigint | undefined} couponBps={couponBps as bigint | undefined} bufferHealth={bufferHealth as bigint | undefined} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
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

                <Tips />
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
                <Link href="/compare" className="text-sm text-zinc-400 hover:text-white">
                    Compare
                </Link>
                <ConnectButton showBalance={false} chainStatus="icon" />
            </div>
        </header>
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
    const tvl = totalAssets === undefined ? "—" : `${fmt(totalAssets, 0)} USDC`;
    const apr = couponBps === undefined ? "—" : `${(Number(couponBps) / 100).toFixed(2)}%`;
    const bh =
        bufferHealth === undefined
            ? "—"
            : bufferHealth === maxUint256
              ? "∞"
              : `${(Number(bufferHealth) / 10000).toFixed(2)}x`;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Vault total assets" value={tvl} />
            <Stat label="Current coupon" value={apr} accent />
            <Stat label="Buffer health" value={bh} />
        </div>
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
        <section className="border border-zinc-900 rounded-xl p-6 bg-zinc-950">
            <h2 className="text-xl font-semibold mb-1">Deposit</h2>
            <p className="text-sm text-zinc-500 mb-5">USDC in, aLP out. Mint test tokens first if your balance is zero.</p>

            <div className="border border-zinc-900 rounded-lg p-4 mb-3 bg-black">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                    <span>Amount (mock USDC)</span>
                    <span>
                        Balance:{" "}
                        <button
                            disabled={!isConnected || usdcBalance === undefined}
                            onClick={() => setAmount(usdcBalance !== undefined ? formatUnits(usdcBalance, 18) : "")}
                            className="text-zinc-300 hover:text-white underline underline-offset-2 disabled:opacity-40"
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
                    className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-zinc-700 tabular-nums"
                />
            </div>

            <div className="flex flex-col gap-2">
                <button
                    disabled={!isConnected || busy}
                    onClick={claimFaucet}
                    className="rounded-lg py-3 text-sm font-medium border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {pendingAction === "faucet" ? "Minting…" : "Mint 10,000 test USDC"}
                </button>

                {needsApprove ? (
                    <button
                        disabled={!isConnected || busy || amount === "" || !hasBalance}
                        onClick={approve}
                        className="rounded-lg py-3 text-sm font-medium border border-emerald-900 hover:border-emerald-700 hover:bg-emerald-950/50 text-emerald-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {pendingAction === "approve" ? "Approving…" : `Approve vault to spend USDC`}
                    </button>
                ) : (
                    <button
                        disabled={!isConnected || busy || amount === "" || !hasBalance}
                        onClick={deposit}
                        className="rounded-lg py-3 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {pendingAction === "deposit" ? "Depositing…" : "Deposit"}
                    </button>
                )}
                {!isConnected && (
                    <p className="text-xs text-amber-400 mt-1">Connect a wallet on Unichain Sepolia to deposit.</p>
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
        <section className="border border-zinc-900 rounded-xl p-6 bg-zinc-950">
            <h2 className="text-xl font-semibold mb-1">Your position</h2>
            <p className="text-sm text-zinc-500 mb-5">
                aLP shares are ERC-4626 tokens. They grow in value at the current coupon rate.
            </p>

            {!hasPosition ? (
                <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
                    No deposit yet. Mint test USDC and deposit to start earning the coupon.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <Stat label="aLP shares" value={sharesDisplay} />
                        <Stat label="Claim value (USDC)" value={claimDisplay} accent />
                        <Stat
                            label="Accrued yield"
                            value={`+${yieldUsd}`}
                            sub={couponBps ? `at ${(Number(couponBps) / 100).toFixed(2)}% APR` : ""}
                        />
                        <Stat label="Status" value="Earning" accent />
                    </div>
                    <button
                        disabled={busy}
                        onClick={withdrawAll}
                        className="w-full rounded-lg py-3 text-sm font-medium border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {pendingAction === "withdraw" ? "Withdrawing…" : "Withdraw all"}
                    </button>
                </>
            )}
        </section>
    );
}

function Stat({label, value, sub, accent}: {label: string; value: string; sub?: string; accent?: boolean}) {
    return (
        <div className="border border-zinc-900 rounded-lg p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
            <div className={`text-xl font-semibold tabular-nums ${accent ? "text-emerald-400" : "text-white"}`}>
                {value}
            </div>
            {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
        </div>
    );
}

function Tips() {
    return (
        <section className="border border-zinc-900 rounded-xl p-6 mt-6 bg-zinc-950">
            <h2 className="text-base font-semibold mb-2">What you are seeing</h2>
            <ul className="text-sm text-zinc-400 space-y-2 leading-relaxed">
                <li>
                    The mock USDC and mock WETH are local testnet tokens. The vault accepts USDC as the underlying;
                    mint button bypasses needing a Sepolia faucet for ERC-20 testing.
                </li>
                <li>
                    Deposits mint <code className="text-zinc-300">aLP-WETH-USDC</code> shares. The vault grows
                    <code className="text-zinc-300">totalAssets</code> at the coupon rate lazily, so your share
                    value goes up over time without any per-block gas.
                </li>
                <li>
                    Buffer health is the ratio of (vault balance − obligation) to the 30-day forward coupon
                    obligation. Above 1.5x means the vault is over-funded; below 0.5x triggers the auto pause + coupon halve.
                </li>
                <li>
                    LP-side hedging (perp short via AtlasHook) fires when liquidity is added through the v4
                    PositionManager. The <code className="text-zinc-300">/compare</code> page demos that flow
                    end-to-end.
                </li>
            </ul>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-zinc-900 px-6 py-8 text-xs text-zinc-500">
            <div className="max-w-5xl mx-auto">
                Vault {ATLAS.vault} · USDC {ATLAS.usdc} · Hook {ATLAS.hook}
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
