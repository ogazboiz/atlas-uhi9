/// Atlas DurableAgent workflow.
///
/// The "use workflow" function below is what makes the chat durable: each
/// LLM turn and each tool call is a checkpointed step. If the serverless
/// function times out or the page is refreshed mid-stream, the
/// WorkflowChatTransport on the client reconnects to the run and continues
/// receiving chunks from the last index it saw.

import {DurableAgent} from "@workflow/ai/agent";
import {createGoogleGenerativeAI} from "@ai-sdk/google";
import {getWritable} from "workflow";
import {z} from "zod";
import type {ModelMessage} from "ai";
import type {UIMessageChunk} from "ai";

import {readOraclePrice, readRecentCallbacks, readUserPosition, readVaultState} from "./atlas-tools";

/// Direct Gemini provider so we don't depend on Vercel AI Gateway credits
/// (Gateway requires a credit card on file before serving requests). Wired
/// against GEMINI_API_KEY in the project env.
const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_PROMPT = `You are "Ask Atlas", an assistant embedded in the Atlas dApp.

Atlas is a Uniswap v4 hook that pairs every LP deposit with a delta-matched perpetual short. A Reactive Smart Contract on Reactive Lasna watches an on-chain oracle on Unichain Sepolia and fires cross-chain callbacks that rebalance the hedge. LP fees and funding income flow into an ERC-4626 vault that pays a flat per-block coupon to aLP token holders.

You have four tools that read live on-chain state from Unichain Sepolia (chain 1301):
- read_vault_state: vault TVL, current coupon APR, buffer health, paused flag
- read_user_position: a wallet's aLP balance, claim value (via previewRedeem), and USDC wallet balance
- read_oracle_price: latest ETH/USD from MockPriceOracle
- read_recent_callbacks: last N cross-chain Reactive callbacks that landed on the hook

RULES:
1. When the user asks anything that requires a number, CALL THE APPROPRIATE TOOL. Do not guess from memory.
2. Every numeric claim in your response must come from a tool's output in this conversation.
3. Be brief. Two or three short sentences per answer unless the user asks for detail.
4. Never invent contract addresses, transaction hashes, or APR figures.
5. If a tool errors, say so honestly and stop.

KEY FACTS YOU CAN USE WITHOUT CALLING A TOOL:
- Vault target coupon is 8.00% APR (use read_vault_state to check the actual live value).
- Buffer health < 0.5x triggers auto-pause + coupon halving. > 1.5x restores the target coupon.
- Reactive Network end-to-end latency from a setPrice on Unichain to a hook lastNonce tick is observed at ~15-20 seconds.
- Live URLs: /compare (live demo), /deposit (mint test USDC + deposit), /positions, /activity.`;

export async function atlasChatWorkflow(messages: ModelMessage[], userAddress: string | null) {
    "use workflow";

    const writable = getWritable<UIMessageChunk>();

    const agent = new DurableAgent({
        model: async () => google("gemini-2.5-flash"),
        system: `${SYSTEM_PROMPT}\n\nUSER CONTEXT:\n- Wallet connected: ${userAddress ?? "(no wallet connected)"}\n- When the user asks about "my position", call read_user_position with their wallet.`,
        temperature: 0.2,
        tools: {
            read_vault_state: {
                description:
                    "Read the live state of the Atlas vault on Unichain Sepolia. Returns TVL in USDC, the current coupon APR, the buffer-health ratio, and whether deposits are paused. Call this whenever the user asks about the vault.",
                inputSchema: z.object({}),
                execute: readVaultState,
            },
            read_user_position: {
                description:
                    "Read a wallet's Atlas position: aLP shares, USDC claim value (via previewRedeem), and USDC wallet balance. Call this when the user asks about 'my position', 'my balance', or anything wallet-specific.",
                inputSchema: z.object({
                    address: z.string().describe("EVM address of the wallet to inspect."),
                }),
                execute: readUserPosition,
            },
            read_oracle_price: {
                description:
                    "Read the latest ETH/USD price from MockPriceOracle on Unichain Sepolia. Call this when the user asks about the current price or what the oracle is reporting.",
                inputSchema: z.object({}),
                execute: readOraclePrice,
            },
            read_recent_callbacks: {
                description:
                    "Read recent Reactive Network callbacks that landed on the AtlasHook. Returns each callback's nonce, applied hedge delta, block, time-since-now, and tx hash. Use this when the user asks about 'reactive activity', 'rebalances', or wants to know if the cross-chain loop is firing.",
                inputSchema: z.object({
                    limit: z
                        .number()
                        .int()
                        .min(1)
                        .max(20)
                        .describe("Maximum number of recent callbacks to return (1-20)."),
                }),
                execute: readRecentCallbacks,
            },
        },
    });

    await agent.stream({messages, writable});
}
