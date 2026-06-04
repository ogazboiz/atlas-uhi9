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
        <section className="border border-zinc-900 rounded-xl p-6 mt-6 bg-zinc-950">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Reactive Network status</h2>
                <span className="inline-flex items-center gap-2 text-xs text-emerald-400">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Subscribed
                </span>
            </div>
            <p className="text-sm text-zinc-500 mb-5">
                The AtlasReactive RSC on Reactive Lasna subscribes to{" "}
                <code className="text-zinc-300">MockPriceOracle.PriceUpdated</code> on Unichain Sepolia and
                forwards a hedge-rebalance callback through AtlasCallback. The hook&apos;s{" "}
                <code className="text-zinc-300">lastNonce</code> below increments each time the cross-chain
                callback lands.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <NonceCard nonce={nonce} />
                <AddressCard
                    label="AtlasReactive (Lasna)"
                    address={REACTIVE.reactive}
                    href={`${REACTIVE.reactiveExplorer}/address/${REACTIVE.reactive}`}
                />
                <AddressCard
                    label="AtlasCallback (Unichain)"
                    address={REACTIVE.callback}
                    href={`${UNICHAIN_EXPLORER}/${REACTIVE.callback}`}
                />
            </div>

            <div className="mt-4 text-xs text-zinc-600">
                Subscribed topic{" "}
                <code className="text-zinc-400">PriceUpdated(uint256,uint256)</code> at{" "}
                <a
                    href={`${UNICHAIN_EXPLORER}/${ATLAS.oracle}`}
                    className="underline underline-offset-2 hover:text-zinc-300"
                >
                    {short(ATLAS.oracle)}
                </a>
                {" · "}
                Pool ID{" "}
                <code className="text-zinc-400">{short(REACTIVE.poolId)}</code>
            </div>
        </section>
    );
}

function NonceCard({nonce}: {nonce: string}) {
    return (
        <div className="border border-zinc-900 rounded-lg p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Hook lastNonce</div>
            <div className="text-3xl font-semibold tabular-nums">{nonce}</div>
            <div className="text-xs text-zinc-500 mt-1">Updates on each RSC callback</div>
        </div>
    );
}

function AddressCard({label, address, href}: {label: string; address: string; href: string}) {
    return (
        <div className="border border-zinc-900 rounded-lg p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm text-zinc-300 hover:text-white underline underline-offset-2"
            >
                {short(address)}
            </a>
            <div className="text-xs text-zinc-500 mt-1">View on explorer →</div>
        </div>
    );
}

function short(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
