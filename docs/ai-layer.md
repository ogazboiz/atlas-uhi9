# AI Layer

Atlas ships two AI components. Both are grounded in live on-chain reads and verifiable against deployed contracts. Neither pretends to be ML for marketing purposes.

## 1. Hedge Confidence Score

A composite scorer that fuses four on-chain signals into a single 0-100 number representing how well-calibrated the current hedge is.

### Inspiration

The pattern follows SwapPilot's `ai-engine`, a prior Uniswap Hookathon winner that shipped a real ML component: a PyTorch transformer plus Random Forest ensemble that scored swap-execution timing and surfaced the result as a single gauge in the UI. We adapted this pattern to hedge sizing instead of swap timing, with a transparent JavaScript ensemble in place of a trained net.

### Why a weighted ensemble instead of a trained network

Testnet has no production-grade signal to learn from. Training a neural net against synthetic data would be theater. A transparent weighted ensemble of real on-chain signals gives the same demo-ready gauge UI, but every component is verifiable from contract reads and the math fits in 200 lines of TypeScript that judges can audit.

### The four signals

| Signal | Source | Weight | Map |
|---|---|---|---|
| Volatility regime | Rolling stddev of `MockPriceOracle.getPrice` over 20 samples | 0.30 | 0% stddev → 100; 5% stddev → 0 |
| Rebalance freshness | Blocks since the last `RebalanceCallbackReceived` event on AtlasHook | 0.25 | 0 blocks → 100; 500 blocks → 0 |
| Buffer health | `AtlasVault.bufferHealth()` (basis-points ratio of buffer to 30-day coupon obligation) | 0.25 | 1.5x → 100; 0.5x → 0; paused → 10 |
| Funding regime | `MockPerpAdapter.fundingRateAnnualBps()` | 0.20 | +2000 bps → 100; -2000 bps → 0 |

Final score = weighted sum. Tier mapping: ≥75 HIGH (emerald), ≥50 MEDIUM (amber), else LOW (rose).

### Files

- [frontend/lib/confidence.ts](../frontend/lib/confidence.ts) — engine
- [frontend/components/HedgeConfidenceGauge.tsx](../frontend/components/HedgeConfidenceGauge.tsx) — gauge UI

### Demo loop

1. Land on `/compare` with the gauge sitting at HIGH (typically ~85)
2. Press `1` on the keyboard to trigger a 15% oracle dump
3. Volatility component drops sharply, tier flips to MEDIUM within 3 seconds
4. ~15-20 seconds later the Reactive Network callback lands, the freshness component resets to 100, and the gauge ticks back up

## 2. Ask Atlas (Durable Agent)

A natural-language chat embedded on `/positions` and `/activity`. Backed by a Vercel Workflow DevKit `DurableAgent` that calls four on-chain reader tools per turn, so every answer cites live contract state rather than a stale context blob.

### Implementation

| Layer | File | Detail |
|---|---|---|
| Workflow + agent | [frontend/lib/agents/atlas-agent.ts](../frontend/lib/agents/atlas-agent.ts) | `"use workflow"` function builds a `DurableAgent` with Claude Haiku 4.5 and four tools |
| Tools | [frontend/lib/agents/atlas-tools.ts](../frontend/lib/agents/atlas-tools.ts) | Four `"use step"` functions that read vault state, user position, oracle price, recent Reactive callbacks via viem |
| POST API | [frontend/app/api/atlas-chat/route.ts](../frontend/app/api/atlas-chat/route.ts) | Starts the workflow with `start()` and returns `x-workflow-run-id` in the response header |
| Resume API | [frontend/app/api/atlas-chat/[runId]/stream/route.ts](../frontend/app/api/atlas-chat/[runId]/stream/route.ts) | GET endpoint that resumes an existing run's stream from a chunk index |
| Model | `anthropic/claude-haiku-4.5` via Vercel AI Gateway | Routed via Workflow + Gateway; deployment uses OIDC, no hard-coded key |
| UI | [frontend/components/AtlasChat.tsx](../frontend/components/AtlasChat.tsx) | `WorkflowChatTransport` replaces the default transport; `localStorage` persists the active run ID so a page refresh mid-stream resumes from the last received chunk |

### The four tools

| Tool | Reads | Returns |
|---|---|---|
| `read_vault_state` | `AtlasVault.{totalAssets, couponBps, bufferHealth, depositsPaused}` | Live TVL, current APR, buffer ratio, paused flag |
| `read_user_position` | `AtlasVault.{balanceOf, previewRedeem}`, `USDC.balanceOf` | aLP shares, claim value, wallet USDC |
| `read_oracle_price` | `MockPriceOracle.getPrice()` | ETH/USD scaled to 1e18 |
| `read_recent_callbacks` | `AtlasHook.lastNonce`, `eth_getLogs` for `RebalanceCallbackReceived` | List of recent cross-chain callbacks with nonce, delta, tx hash, time-since |

Each tool is a `"use step"` function: it runs with full Node.js access, results are cached by input, and the WDK retries on transient RPC failures. Tools are exposed to the model with zod schemas so Claude calls them with validated arguments.

### Why durable

| Failure mode | Old (streamText) | New (DurableAgent) |
|---|---|---|
| Serverless function times out at 60s mid-stream | User sees partial text, must resend | `WorkflowChatTransport` reconnects to the run and resumes from the last chunk |
| User refreshes the page during a long answer | Lost | Active run ID is in `localStorage`; chat resumes on remount |
| RPC fails on a tool call | Whole turn errors | Step retries automatically |
| Stale context block | Numbers go out of date between turns | Agent calls fresh tools every turn |

### Grounding rules

The system prompt enforces three rules:
1. Every numeric claim must come from the per-request Context block. If a number is not in the context, say so explicitly.
2. Be brief. Two or three short sentences per answer unless the user asks for detail.
3. Never invent contract addresses, transaction hashes, or APR figures.

### Per-page context

- **`/positions`** sends: wallet address, aLP shares, claim value, deposited principal, accrued yield, current coupon bps, USDC wallet balance, deposit count.
- **`/activity`** sends: last 20 on-chain events with kind, block number, timestamp, headline, and tx hash.

### Example exchanges

```
User: How is my position doing?
Atlas: You hold 5,000 aLP earning at 8.00% APR. Your claim value is 5,012
       USDC, which means about 12 USDC of accrued yield since your single
       deposit.
```

```
User: How many reactive callbacks landed today?
Atlas: I see 4 RebalanceCallback events in the last 20 entries on this
       page. The most recent landed in tx 0xb4e1a900..., resizing the
       hedge by -0.14 ETH.
```

### Setup for self-hosting

If you fork this and deploy on Vercel:
1. Enable Vercel AI Gateway in your project settings.
2. Atlas will route through Gateway via OIDC automatically. No API key needed.

For local development, set `AI_GATEWAY_API_KEY` or any provider-specific key (Anthropic, OpenAI) in `.env.local`.

## Honest scope

These are MVP-grade AI features. The confidence ensemble is a heuristic, not a neural net — fast to ship, transparent to audit, and grounded in real signals. Ask Atlas is constrained to a strict context-only prompt to keep hallucinations out of a financial UI. Both could be replaced with trained models post-hackathon without changing any API contract.
