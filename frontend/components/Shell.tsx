"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {type ReactNode} from "react";
import {FloatIcon} from "@/components/motion/Motion";

const NAV = [
    {href: "/compare", label: "Compare"},
    {href: "/deposit", label: "Deposit"},
    {href: "/positions", label: "Positions"},
    {href: "/activity", label: "Activity"},
];

/// Top-level page shell shared across every route.
///
/// Provides: branded header, nav with active-state, sticky page container,
/// minimalist footer with contract attestation links. Children render in a
/// max-width centered column.
export function Shell({children}: {children: ReactNode}) {
    return (
        <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1 w-full">{children}</main>
            <Footer />
        </div>
    );
}

function Header() {
    const path = usePathname();
    return (
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#050608]/70 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                <Link href="/" className="group flex items-center gap-2.5">
                    <FloatIcon amplitude={3} period={4.6}>
                        <AtlasMark />
                    </FloatIcon>
                    <span className="text-[15px] font-semibold tracking-tight text-white">Atlas</span>
                    <span className="hidden sm:inline rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                        Testnet
                    </span>
                </Link>
                <nav className="hidden md:flex items-center gap-1">
                    {NAV.map((item) => {
                        const active = path === item.href || (item.href !== "/" && path.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative rounded-lg px-3 py-1.5 text-sm transition-colors ${
                                    active ? "text-white" : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                {item.label}
                                {active && (
                                    <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
                                )}
                            </Link>
                        );
                    })}
                </nav>
                <div className="flex items-center gap-3">
                    <ConnectButton showBalance={false} chainStatus="icon" />
                </div>
            </div>
        </header>
    );
}

function Footer() {
    return (
        <footer className="mt-24 border-t border-white/[0.06]">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                    <AtlasMark size={14} />
                    <span>Atlas · UHI9 Hookathon submission · IL & Yield Systems track</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    <a
                        href="https://github.com/ogazboiz/atlas-uhi9"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white"
                    >
                        Source
                    </a>
                    <Link href="/compare" className="hover:text-white">
                        Live demo
                    </Link>
                    <a
                        href="https://sepolia.uniscan.xyz/address/0xb0a98b7301772DC8328e3b8B08436C5E993d4640"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white"
                    >
                        Hook contract
                    </a>
                    <a
                        href="https://lasna.reactscan.net/address/0xA9797768554213476B0D1E853cf9b91E7A187BF1"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white"
                    >
                        Reactive contract
                    </a>
                </div>
            </div>
        </footer>
    );
}

export function AtlasMark({size = 18}: {size?: number}) {
    return (
        <span
            className="inline-flex items-center justify-center rounded-md"
            style={{
                width: size + 6,
                height: size + 6,
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 55%, #38bdf8 100%)",
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.30), 0 1px 2px rgba(0,0,0,0.45)",
            }}
        >
            <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 18 L12 4 L20 18" stroke="white" strokeLinejoin="round" />
                <path d="M8 14 L16 14" stroke="white" strokeLinecap="round" />
            </svg>
        </span>
    );
}

/// Generic content frame: max-width, padding, optional grid backdrop.
export function PageFrame({
    children,
    grid = false,
}: {
    children: ReactNode;
    grid?: boolean;
}) {
    return (
        <div className={`mx-auto w-full max-w-7xl px-6 py-10 sm:py-14 ${grid ? "atlas-grid-bg" : ""}`}>{children}</div>
    );
}

/// Section header pattern used across pages.
export function SectionHeader({
    eyebrow,
    title,
    subtitle,
    action,
}: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    action?: ReactNode;
}) {
    return (
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
                {eyebrow && (
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        {eyebrow}
                    </div>
                )}
                <h2 className="atlas-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
                {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">{subtitle}</p>}
            </div>
            {action && <div className="mt-3 sm:mt-0">{action}</div>}
        </div>
    );
}

/// Stat card pattern used throughout.
export function StatCard({
    label,
    value,
    hint,
    tone = "default",
    icon,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone?: "default" | "emerald" | "violet" | "sky" | "rose" | "amber";
    icon?: ReactNode;
}) {
    const toneRing: Record<string, string> = {
        default: "",
        emerald: "ring-1 ring-emerald-500/20",
        violet: "ring-1 ring-violet-400/20",
        sky: "ring-1 ring-sky-400/20",
        rose: "ring-1 ring-rose-400/20",
        amber: "ring-1 ring-amber-400/20",
    };
    const toneText: Record<string, string> = {
        default: "text-white",
        emerald: "text-emerald-300",
        violet: "text-violet-300",
        sky: "text-sky-300",
        rose: "text-rose-300",
        amber: "text-amber-300",
    };
    return (
        <div
            className={`atlas-card relative overflow-hidden p-5 ${toneRing[tone]}`}
        >
            <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    {label}
                </span>
                {icon && <span className="text-zinc-500">{icon}</span>}
            </div>
            <div className={`mt-3 font-semibold tracking-tight ${toneText[tone]} text-2xl sm:text-3xl`}>
                {value}
            </div>
            {hint && <div className="mt-1.5 text-xs text-zinc-500">{hint}</div>}
        </div>
    );
}

/// Primary CTA button.
export function PrimaryButton({
    children,
    onClick,
    href,
    disabled = false,
    size = "md",
    type = "button",
}: {
    children: ReactNode;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    size?: "sm" | "md" | "lg";
    type?: "button" | "submit";
}) {
    const sizes = {
        sm: "px-4 py-2 text-xs",
        md: "px-5 py-2.5 text-sm",
        lg: "px-6 py-3.5 text-[15px]",
    };
    // Primary accent is citrus amber — distinctive, signals "gold standard
    // of yield". Taste Skill: inner highlight + tinted shadow, no outer
    // neon glow. Emil's rule: scale(0.97) on :active handled globally.
    const base = `inline-flex items-center justify-center gap-2 rounded-xl font-medium
        bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950
        ring-1 ring-inset ring-amber-200/55
        shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.55)]
        hover:from-amber-200 hover:to-amber-400
        disabled:from-zinc-700 disabled:to-zinc-800 disabled:text-zinc-500 disabled:ring-zinc-700 disabled:shadow-none disabled:cursor-not-allowed
        transition-colors duration-150
        ${sizes[size]}`;
    if (href) {
        return (
            <Link href={href} className={base}>
                {children}
            </Link>
        );
    }
    return (
        <button type={type} onClick={onClick} disabled={disabled} className={base}>
            {children}
        </button>
    );
}

/// Secondary outline button.
export function SecondaryButton({
    children,
    onClick,
    href,
    disabled = false,
    size = "md",
}: {
    children: ReactNode;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    size?: "sm" | "md" | "lg";
}) {
    const sizes = {
        sm: "px-4 py-2 text-xs",
        md: "px-5 py-2.5 text-sm",
        lg: "px-6 py-3.5 text-[15px]",
    };
    const base = `inline-flex items-center justify-center gap-2 rounded-xl font-medium
        border border-white/10 bg-white/[0.03] text-white
        shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]
        hover:bg-white/[0.06] hover:border-white/20
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors duration-150
        ${sizes[size]}`;
    if (href) {
        return (
            <Link href={href} className={base}>
                {children}
            </Link>
        );
    }
    return (
        <button onClick={onClick} disabled={disabled} className={base}>
            {children}
        </button>
    );
}

/// Tone chip for status / category tags.
export function Chip({
    children,
    tone = "default",
}: {
    children: ReactNode;
    tone?: "default" | "emerald" | "violet" | "sky" | "rose" | "amber";
}) {
    const toneMap = {
        default: "bg-white/[0.04] text-zinc-300 border-white/10",
        emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
        violet: "bg-violet-500/10 text-violet-300 border-violet-500/25",
        sky: "bg-sky-500/10 text-sky-300 border-sky-500/25",
        rose: "bg-rose-500/10 text-rose-300 border-rose-500/25",
        amber: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    };
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneMap[tone]}`}
        >
            {children}
        </span>
    );
}
