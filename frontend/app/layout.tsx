import type {Metadata} from "next";
import {Geist, Geist_Mono, Outfit} from "next/font/google";
import "./globals.css";
import {Providers} from "./providers";
import {BufferBanner} from "@/components/BufferBanner";

const geistSans = Geist({variable: "--font-geist-sans", subsets: ["latin"]});
const geistMono = Geist_Mono({variable: "--font-geist-mono", subsets: ["latin"]});
// Outfit on display headings only — Taste Skill calls it out by name for
// premium / distinctive vibes. Body text stays on Geist.
const outfit = Outfit({
    variable: "--font-display",
    subsets: ["latin"],
    weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
    title: "Atlas",
    description: "Delta-hedged LP vault hook for Uniswap v4. Earn 8% fixed APR on USDC/WETH liquidity.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col bg-[#050608] text-white">
                <Providers>
                    <BufferBanner />
                    {children}
                </Providers>
            </body>
        </html>
    );
}
