import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {defineChain} from "viem";

export const unichainSepolia = defineChain({
    id: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: {decimals: 18, name: "Ether", symbol: "ETH"},
    rpcUrls: {
        default: {http: ["https://unichain-sepolia-rpc.publicnode.com"]},
    },
    blockExplorers: {
        default: {name: "Uniscan", url: "https://sepolia.uniscan.xyz"},
    },
    testnet: true,
});

export const wagmiConfig = getDefaultConfig({
    appName: "Atlas",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "atlas-uhi9-demo",
    chains: [unichainSepolia],
    ssr: true,
});
