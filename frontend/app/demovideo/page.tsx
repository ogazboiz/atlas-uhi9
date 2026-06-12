import {redirect} from "next/navigation";
import Link from "next/link";

/// One-line switch. When the demo video is uploaded, set this to the YouTube
/// (or Loom / Vimeo) URL and push. The route will start 307-redirecting
/// immediately. The submission form already points at /demovideo, so the
/// judges always land on the right place without a form resubmit.
const DEMO_VIDEO_URL = "https://youtu.be/GTAcm-3ymZs";

export const metadata = {
    title: "Atlas — Demo video",
    description: "60-second walkthrough of the Atlas v4 hook + Reactive Network cross-chain rebalance loop.",
};

export default function DemoVideoPage() {
    if (DEMO_VIDEO_URL) {
        redirect(DEMO_VIDEO_URL);
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
            <div
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
                style={{
                    background:
                        "radial-gradient(800px 360px at 50% 0%, rgba(167,139,250,0.10), transparent 65%)",
                }}
            />

            <Mark />

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-amber-300">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
                </span>
                Demo video uploading
            </div>

            <h1 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                The Atlas demo video is being finalised.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-400 sm:text-base">
                The video is published shortly after submission and this page redirects to it automatically.
                In the meantime you can run the live demo yourself — it takes 60 seconds.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                <Link
                    href="/compare"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-500 px-6 py-3.5 text-[15px] font-medium text-black shadow-[0_4px_24px_-4px_rgba(16,185,129,0.45)] transition-all hover:from-emerald-300 hover:to-emerald-400 active:scale-[0.98]"
                >
                    Open the live demo
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                </Link>
                <a
                    href="https://github.com/ogazboiz/atlas-uhi9"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-[15px] font-medium text-white transition-all hover:border-white/20 hover:bg-white/[0.06]"
                >
                    Read the source
                </a>
            </div>

            <div className="mt-10 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                <Card
                    label="What you will see"
                    body="Two liquid-metal blobs. Drag the Atlas one, it snaps back. Drag the vanilla one, it stays dented."
                />
                <Card
                    label="What runs on-chain"
                    body="Press 1 to fire a setPrice tx on Unichain Sepolia. The Reactive Smart Contract on Lasna sees it, fires a callback. ~15-20 seconds."
                />
                <Card
                    label="What the numbers prove"
                    body="6 verified contracts, 61 passing Foundry tests, 92% / 97% line coverage on the hook and vault, hook.lastNonce > 0 on-chain."
                />
            </div>

            <p className="mt-10 text-[11px] text-zinc-600">
                If you reached this page from the UHI submission form and the video is still pending, hit
                refresh in a few minutes.
            </p>
        </div>
    );
}

function Mark() {
    return (
        <div
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
                background:
                    "linear-gradient(135deg, #10b981 0%, #38bdf8 55%, #a78bfa 100%)",
                boxShadow: "0 0 32px -6px rgba(16,185,129,0.55)",
            }}
        >
            <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="white" strokeWidth="2.5">
                <path d="M4 18 L12 4 L20 18" strokeLinejoin="round" />
                <path d="M8 14 L16 14" strokeLinecap="round" />
            </svg>
        </div>
    );
}

function Card({label, body}: {label: string; body: string}) {
    return (
        <div className="atlas-card p-4 text-left">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</div>
            <div className="mt-2 text-sm text-zinc-300">{body}</div>
        </div>
    );
}
