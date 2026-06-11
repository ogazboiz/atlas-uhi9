"use client";

import {useReadContract} from "wagmi";
import {ATLAS, REACTIVE} from "@/lib/contracts";

const HOOK_LAST_NONCE_ABI = [
    {type: "function", name: "lastNonce", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
] as const;

const UNICHAIN_EXPLORER = "https://sepolia.uniscan.xyz/address";

export function ReactiveStatus() {
    const {data: lastNonce} = useReadContract({
        address: ATLAS.hook,
        abi: HOOK_LAST_NONCE_ABI,
        functionName: "lastNonce",
        query: {refetchInterval: 5000},
    });

    const nonce = lastNonce === undefined ? "—" : (lastNonce as bigint).toString();

    return (
        <section className="atlas-card-strong relative overflow-hidden p-6">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
            <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                            Cross-chain
                        </div>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                            Reactive Network status
                        </h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Subscribed
                    </span>
                </div>

                <p className="mb-5 text-xs text-zinc-400">
                    AtlasReactive on Lasna watches{" "}
                    <code className="rounded bg-white/[0.04] px-1 py-0.5 text-zinc-300">PriceUpdated</code> on
                    Unichain Sepolia and forwards a hedge-rebalance callback through AtlasCallback. The hook&apos;s
                    nonce increments on each landed callback.
                </p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <NonceCard nonce={nonce} />
                    <AddressCard
                        label="AtlasReactive · Lasna"
                        address={REACTIVE.reactive}
                        href={`${REACTIVE.reactiveExplorer}/address/${REACTIVE.reactive}`}
                    />
                    <AddressCard
                        label="AtlasCallback · Unichain"
                        address={REACTIVE.callback}
                        href={`${UNICHAIN_EXPLORER}/${REACTIVE.callback}`}
                    />
                </div>

                <div className="mt-4 text-[11px] text-zinc-500">
                    Topic{" "}
                    <code className="rounded bg-white/[0.04] px-1 py-0.5 text-zinc-400">
                        PriceUpdated(uint256,uint256)
                    </code>{" "}
                    at{" "}
                    <a
                        href={`${UNICHAIN_EXPLORER}/${ATLAS.oracle}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-zinc-400 underline underline-offset-2 hover:text-white"
                    >
                        {short(ATLAS.oracle)}
                    </a>
                </div>
            </div>
        </section>
    );
}

function NonceCard({nonce}: {nonce: string}) {
    return (
        <div className="atlas-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Hook lastNonce</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-emerald-300">{nonce}</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">Each landed callback +1</div>
        </div>
    );
}

function AddressCard({label, address, href}: {label: string; address: string; href: string}) {
    return (
        <div className="atlas-card group p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</div>
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-sm text-zinc-200 transition-colors hover:text-white"
            >
                {short(address)} <span className="text-zinc-500 group-hover:text-violet-400">→</span>
            </a>
            <div className="mt-0.5 text-[10px] text-zinc-500">Open in explorer</div>
        </div>
    );
}

function short(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
