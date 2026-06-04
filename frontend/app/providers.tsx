"use client";

import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RainbowKitProvider, darkTheme} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import {wagmiConfig} from "@/lib/wagmi";
import {type ReactNode, useState} from "react";

export function Providers({children}: {children: ReactNode}) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
