"use client";

import Link from "next/link";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {ATLAS} from "@/lib/contracts";
import {LiveStats} from "@/components/LiveStats";

const EXPLORER = "https://sepolia.uniscan.xyz/address";

export default function Home() {
    return (
        <div className="flex flex-col flex-1">
            <Header />
            <main className="flex flex-1 flex-col items-center px-6 py-20 max-w-5xl mx-auto w-full">
                <Hero />
                <LiveStats />
                <HowItWorks />
                <CTASection />
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
            <ConnectButton showBalance={false} chainStatus="icon" />
        </header>
    );
}

function Hero() {
    return (
        <section className="text-center max-w-3xl">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">
                UHI9 Hookathon · Reactive Network Sponsor Track
            </p>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-tight mb-6">
                Hedged LP yields. <br />
                <span className="text-zinc-500">Autonomous. Fixed APR.</span>
            </h1>
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                Atlas is a Uniswap v4 hook that pairs every LP deposit with a delta-matched perpetual short,
                paying out a flat 8% APR while a Reactive Smart Contract handles rebalancing across chains.
            </p>
        </section>
    );
}

function HowItWorks() {
    const steps = [
        {
            n: "1",
            title: "Deposit liquidity",
            body: "Add WETH + USDC through the Atlas hook. The pool registers your position as usual.",
        },
        {
            n: "2",
            title: "Hedge opens automatically",
            body: "The hook computes your volatile-asset delta and opens a matched perpetual short.",
        },
        {
            n: "3",
            title: "Reactive rebalancing",
            body: "An RSC on Reactive Network watches price divergence and resizes the hedge cross-chain.",
        },
        {
            n: "4",
            title: "Smoothed payout",
            body: "Funding income + swap fees flow into a vault that pays a flat 8% APR to aLP holders.",
        },
    ];
    return (
        <section className="w-full max-w-3xl mt-20">
            <h2 className="text-3xl font-semibold mb-8 tracking-tight">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {steps.map((s) => (
                    <div key={s.n} className="border border-zinc-900 rounded-lg p-6">
                        <div className="text-xs text-zinc-500 mb-2">Step {s.n}</div>
                        <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function CTASection() {
    return (
        <section className="w-full max-w-3xl mt-20 mb-12">
            <div className="border border-zinc-800 rounded-xl p-8 text-center bg-zinc-950">
                <h2 className="text-2xl font-semibold mb-2">See the live demo</h2>
                <p className="text-zinc-400 mb-6">
                    Watch an Atlas position stay flat while a vanilla LP bleeds during a simulated price dump.
                </p>
                <Link
                    href="/compare"
                    className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black font-medium px-6 py-3 rounded-lg transition-colors"
                >
                    Open the live comparison →
                </Link>
                <div className="flex justify-center mt-6">
                    <ConnectButton />
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-zinc-900 px-6 py-8 text-xs text-zinc-500">
            <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    Atlas · UHI9 Hookathon submission ·{" "}
                    <a
                        href="https://github.com/ogazboiz/atlas-uhi9"
                        className="hover:text-white underline underline-offset-4"
                    >
                        Source on GitHub
                    </a>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <a href={`${EXPLORER}/${ATLAS.hook}`} className="hover:text-white">
                        Hook
                    </a>
                    <a href={`${EXPLORER}/${ATLAS.vault}`} className="hover:text-white">
                        Vault
                    </a>
                    <a href={`${EXPLORER}/${ATLAS.perpAdapter}`} className="hover:text-white">
                        PerpAdapter
                    </a>
                    <a href={`${EXPLORER}/${ATLAS.oracle}`} className="hover:text-white">
                        Oracle
                    </a>
                </div>
            </div>
        </footer>
    );
}
