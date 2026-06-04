# Atlas — Product Requirements Document

| | |
|---|---|
| **Document version** | 1.0 |
| **Status** | Draft — Hackathon Submission |
| **Owner** | Atlas Team |
| **Last updated** | 2026-05-22 |
| **Target submission** | UHI9 Hookathon — June 11, 2026 |

---

## 1. Product Overview

**Atlas** is a Uniswap v4 hook that gives liquidity providers structural impermanent-loss protection by automatically pairing every LP position with a delta-matched perpetual short, then routing all yield (swap fees + funding payments) through an ERC-4626 smoothing vault that pays out at a flat per-block APR.

Atlas turns the LP product surface from *"variable yield with hidden tail risk"* into *"fixed yield with bounded downside"* — the on-chain equivalent of a structured note. The autonomous rebalancing loop is powered by Reactive Smart Contracts (RSCs), which monitor cross-chain price events and trigger hedge resizing without requiring a centralized keeper.

---

## 2. Problem Statement

### 2.1 The structural problem

Concentrated AMM liquidity is the highest-throughput price-discovery mechanism in DeFi, yet the LPs that supply it are systematically losing money to two compounding drains:

1. **Impermanent loss.** Studies of Uniswap v3 LPs consistently show that the median active LP underperforms a simple HODL strategy on the same asset basket. IL is not an accounting illusion — it is a real cash transfer from LPs to arbitrageurs and rebalancing flow.
2. **Lumpy income.** Even profitable LPs experience wildly variable fee revenue. A vault may earn 22% APR in a high-volume week and 2% the next. Institutional capital and treasury allocators cannot underwrite this variance with a straight face.

### 2.2 Why existing solutions fall short

| Existing approach | Why it fails |
|---|---|
| **Manual rebalancing** | Requires constant attention; gas-inefficient; no IL protection between rebalances |
| **IL insurance pools (premium-based)** | LPs pay premium up front; in low-vol regimes the premium exceeds realized IL; LP nets negative |
| **Auto-rebalancing managers (Gamma, Arrakis)** | Move liquidity around but do not hedge; still exposed to directional moves |
| **Yield aggregators** | Stack returns but inherit underlying IL risk |
| **Pendle-style fixed-rate wrappers** | Work for yield-bearing assets, not for raw LP positions |

The gap: **no product actively hedges LP delta with an opposing instrument and smooths the income.** Atlas fills it.

---

## 3. Vision

> **A world where supplying liquidity to volatile AMM pairs is as predictable as buying a CD — and where the underlying delta-neutral machinery runs autonomously across chains, requiring zero LP intervention.**

Three-year vision: Atlas becomes the default LP wrapper for any volatile Uniswap v4 pool. LPs deposit through Atlas instead of natively, the same way DeFi users deposit into Aave instead of running their own lending positions.

---

## 4. Target Users

### 4.1 Primary persona — *"The Yield-Seeking Treasury"*
- DAOs, hedge funds, family offices holding $1M+ of stable or volatile assets
- Want on-chain yield but cannot underwrite IL variance
- Need a predictable rate to report to stakeholders
- Today: parked in Aave/Compound earning 3-5%
- With Atlas: earn 8-12% smoothed APR with IL-protected exposure

### 4.2 Secondary persona — *"The Sophisticated Retail LP"*
- DeFi-native users with $10K-$500K who already provide v3/v4 liquidity
- Understand IL but lack the time/skill to hedge manually
- Today: tolerate IL, hope fees outweigh it, often disappointed
- With Atlas: deposit once, earn smoothed yield, withdraw whenever

### 4.3 Tertiary persona — *"The Protocol Integrator"*
- Other DeFi protocols (lending markets, structured product platforms) that want to expose users to LP yield without IL risk
- Today: cannot integrate raw LP positions safely
- With Atlas: integrate `aLP` tokens as collateral/yield source with predictable behavior

---

## 5. User Pain Points

| Pain | Today's experience | Atlas eliminates by |
|---|---|---|
| "My LP position bled out during the last dump" | Manually exit before crashes (hard), or wear IL | Auto-hedge with matched perp short |
| "I never know what APR I'm going to earn" | Variable daily based on volume | Smoothing vault pays flat per-block coupon |
| "Hedging manually requires watching 24/7" | Either ignore or pay a keeper service | RSCs autonomously trigger rebalances |
| "Cross-chain monitoring is a nightmare" | Run own scripts, manage RPCs | Reactive Network handles cross-chain events natively |
| "Gas costs eat any rebalancing strategy" | Skip rebalancing | Hook batches events, RSC fires only on threshold breach |
| "I don't know if my IL protection actually worked" | Trust the protocol | Atlas dashboard shows live hedge PnL vs. unhedged baseline |

---

## 6. Solution Explanation

Atlas is composed of four cooperating layers:

### 6.1 The Hook Layer
A Uniswap v4 hook contract that intercepts `afterAddLiquidity`, `beforeSwap`, `afterSwap`, and `beforeRemoveLiquidity`. On deposit, the hook computes the LP's volatile-asset delta and instructs the **Perp Adapter** to open a matched short. On every swap that materially shifts pool reserves, the hook checks if the hedge requires intra-block adjustment.

### 6.2 The Perp Adapter Layer
A pluggable adapter interface that abstracts the perp venue. Three concrete implementations:
- `HyperliquidAdapter` — primary production target
- `GMXAdapter` — Arbitrum-native fallback
- `MockPerpAdapter` — for testnet demos and local dev

The adapter exposes `openShort(uint256 size)`, `resizeShort(int256 delta)`, and `closeShort()`.

### 6.3 The Reactive Layer
A Reactive Smart Contract (RSC) deployed on Reactive Network subscribes to two event streams:
- Chainlink ETH/USD price feed updates (chain A)
- Uniswap v4 `Swap` events on the Atlas-managed pool (chain B)

When cross-chain price divergence exceeds a configurable basis-point threshold, the RSC fires a callback to the Atlas hook on the pool chain, which in turn instructs the Perp Adapter to resize the hedge. This is the autonomy backbone — no centralized keeper, no per-block polling cost.

### 6.4 The Smoothing Vault Layer
An ERC-4626 vault that receives:
- All swap fees collected by the hook
- All funding payments earned (or paid) by the perp position
- Periodic rebalancing PnL

The vault pays out a flat per-block coupon to depositors (`aLP-WETH-USDC` token holders). A buffer absorbs variance: when inflows exceed coupon obligations, the surplus accumulates; when inflows fall short, the buffer covers the gap. A transparent on-chain "buffer health" metric is exposed so LPs can see if the fixed-rate promise is structurally sound.

---

## 7. Core Features

| # | Feature | Description |
|---|---|---|
| F1 | **Auto-hedge on deposit** | Hook opens matched perp short when LP adds liquidity |
| F2 | **Cross-chain reactive rebalancing** | RSC monitors price divergence; fires rebalance callbacks |
| F3 | **Smoothing vault with flat APR** | ERC-4626 vault pays per-block coupon at configurable rate |
| F4 | **`aLP` receipt token** | Tradable ERC-20 representing LP position + yield claim |
| F5 | **Hedge unwind on withdrawal** | Position closure cleanly unwinds perp and returns principal |
| F6 | **Dashboard with hedged vs. unhedged comparison** | Live PnL visualizer showing IL avoided |
| F7 | **Buffer health transparency** | Public on-chain metric of vault coverage ratio |
| F8 | **Configurable risk parameters** | Rebalance threshold, coupon rate, max leverage exposed via governance |

---

## 8. MVP Scope

The 3-week hackathon MVP must demonstrate the end-to-end loop with a live demo. Anything else is post-MVP.

### 8.1 In scope for MVP
- [x] AtlasHook contract on Unichain Sepolia (or Sepolia)
- [x] MockPerpAdapter — deployed perp simulator with realistic funding behavior
- [x] AtlasReactive RSC deployed on Reactive Network testnet
- [x] AtlasVault ERC-4626 with simple smoothing logic (10-day trailing average inflow as coupon rate)
- [x] `aLP` ERC-20 receipt token
- [x] Single supported pool: WETH/USDC
- [x] Frontend dashboard showing:
  - Deposit/withdraw flow
  - Live hedge PnL chart vs. unhedged baseline
  - Vault buffer health gauge
  - Reactive Network event log streaming rebalances
- [x] Subgraph indexing all hook events for the dashboard

### 8.2 Out of scope for MVP (post-hackathon)
- Real perp venue integration (Hyperliquid/GMX) — deferred to week 4
- Multi-pool support — only WETH/USDC at submission
- Governance contract — risk parameters hardcoded for demo
- Insurance backstop pool — vault buffer only
- Mobile-responsive UI — desktop demo only
- Audit — out of scope for hackathon timeline

---

## 9. User Flows

See [user-flow.md](./user-flow.md) for full state diagrams. Summary:

1. **Deposit flow** — LP approves WETH + USDC → calls `AtlasVault.deposit()` → hook opens matched perp short → LP receives `aLP` tokens
2. **Auto-rebalance flow** — Price divergence detected by RSC → callback fired to hook → perp position resized → event emitted to subgraph
3. **Coupon accrual** — Per-block, vault increments `aLP` exchange rate by `couponRate / blocksPerYear`
4. **Withdrawal flow** — LP burns `aLP` → hook closes perp position → underlying WETH + USDC + accrued yield returned
5. **Buffer rescue flow** — Buffer falls below 0.5x target → vault auto-pauses new deposits → governance notified

---

## 10. Functional Requirements

### FR-1: Hedge Sizing
- On `afterAddLiquidity`, the hook MUST compute the LP's effective volatile-asset delta based on current tick and liquidity provided.
- The hook MUST instruct the Perp Adapter to open a short equal to that delta within 1 block.
- If the perp open fails (venue down, insufficient margin), the deposit MUST revert. No half-hedged positions.

### FR-2: Rebalance Triggering
- The Reactive Smart Contract MUST monitor the configured price oracle and the pool's swap events.
- When `|oracle_price - pool_price| / oracle_price > rebalanceThresholdBps`, the RSC MUST fire a callback within 1 destination-chain block.
- Rebalance callbacks MUST be idempotent — duplicate triggers in the same block result in a single rebalance.

### FR-3: Vault Coupon Distribution
- The smoothing vault MUST accrue value to `aLP` holders at a flat per-block rate.
- The coupon rate MUST be derived from the trailing 10-day moving average of vault inflows (fees + funding) divided by total assets.
- The coupon rate MUST be capped at `maxCouponBps` (initially 1500bps = 15%) to prevent buffer drain.

### FR-4: Buffer Health
- The vault MUST expose a public `bufferHealth()` view returning the ratio of current buffer to 30-day coupon obligation.
- When `bufferHealth() < 0.5`, the vault MUST pause new deposits and emit a `BufferLow` event.
- When `bufferHealth() < 0.25`, the vault MUST temporarily reduce the coupon rate by 50% and emit a `CouponReduced` event.

### FR-5: Withdrawal Atomicity
- `withdraw()` MUST close the proportional share of the perp position before returning underlying assets.
- If perp closure fails, withdrawal MUST revert with a clear error.
- Slippage on perp closure MUST be bounded by `maxWithdrawSlippageBps`.

### FR-6: Event Emission
- Every state change MUST emit an indexable event for subgraph consumption.
- Events MUST include: `Deposit`, `Withdraw`, `HedgeOpened`, `HedgeResized`, `HedgeClosed`, `CouponAccrued`, `BufferLow`, `CouponReduced`.

---

## 11. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Latency** | Rebalance trigger → on-chain execution: < 30 seconds end-to-end across Reactive Network and destination chain |
| **Gas efficiency** | Average deposit gas: < 500k. Average rebalance gas: < 200k. Withdrawal gas: < 350k |
| **Availability** | Frontend uptime > 99% during demo week (hosted on Vercel) |
| **Observability** | All contract events indexed by subgraph within 30 seconds. Dashboard auto-refreshes every block |
| **Security** | No admin keys with upgrade rights during hackathon demo. All parameters set at deploy time |
| **Testability** | Foundry test coverage > 80% on hook and vault logic. Fork tests against live Unichain Sepolia |
| **Reproducibility** | One-command deploy script. README quickstart works from clean clone |

---

## 12. Technical Architecture (Summary)

Full diagrams in [architecture.md](./architecture.md). High-level component map:

```
┌─────────────────┐         ┌────────────────────┐
│  Reactive       │ event   │  Chainlink Oracle  │
│  Smart Contract │◀────────│  (ETH/USD feed)    │
│  (Reactive Net) │         └────────────────────┘
└────────┬────────┘
         │ callback (rebalance signal)
         ▼
┌─────────────────────────────────────────────────┐
│  Unichain Sepolia                               │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ AtlasHook    │───▶│ PerpAdapter          │   │
│  │ (v4 hook)    │    │ (Mock/Hyperliquid)   │   │
│  └──────┬───────┘    └──────────────────────┘   │
│         │                                       │
│         ▼                                       │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ AtlasVault   │───▶│ aLP token            │   │
│  │ (ERC-4626)   │    │ (ERC-20 receipt)     │   │
│  └──────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────┘
         │
         ▼ events
┌─────────────────┐         ┌────────────────────┐
│  Subgraph       │────────▶│  Next.js Frontend  │
│  (Ponder)       │         │  (Atlas Dashboard) │
└─────────────────┘         └────────────────────┘
```

---

## 13. Recommended Stack

Full stack rationale in [tech-stack.md](./tech-stack.md). At a glance:

| Layer | Choice |
|---|---|
| Smart contracts | Solidity 0.8.26, Uniswap v4 Core + Periphery |
| Build tool | Foundry (forge + cast + anvil) |
| Cross-chain automation | Reactive Network SDK |
| Price oracle | Chainlink Data Feeds (ETH/USD on Sepolia) |
| Perp adapter (demo) | Custom MockPerpAdapter on Unichain Sepolia |
| Perp adapter (production roadmap) | Hyperliquid + GMX |
| Indexing | Ponder (TypeScript) |
| Frontend | Next.js 14 App Router, RainbowKit, wagmi v2, viem |
| Charts | TradingView Lightweight Charts |
| Hosting | Vercel (frontend), self-hosted Ponder on Railway |
| Testing | Foundry fork tests, Playwright for frontend |

---

## 14. Smart Contract Considerations

### 14.1 Hook permissions
The Atlas hook requires the following v4 hook flags:
- `BEFORE_ADD_LIQUIDITY`
- `AFTER_ADD_LIQUIDITY`
- `BEFORE_REMOVE_LIQUIDITY`
- `AFTER_REMOVE_LIQUIDITY`
- `AFTER_SWAP`

The hook address must be mined to encode these permissions in its lower bits, per v4 hook conventions.

### 14.2 Reentrancy
- All hook callbacks MUST use OpenZeppelin's `ReentrancyGuard`.
- Perp adapter calls MUST happen *after* all internal state updates (checks-effects-interactions).

### 14.3 Access control
- Hook callbacks restricted to PoolManager.
- Vault deposit/withdraw open to anyone.
- Rebalance callback restricted to authenticated RSC address.
- Risk parameters hardcoded for hackathon; governance contract roadmapped for production.

### 14.4 Upgradability
- Hackathon contracts: immutable, no proxy.
- Production roadmap: UUPS proxy on vault only; hook remains immutable (hook address encodes permissions).

### 14.5 Failure modes
| Failure | Handling |
|---|---|
| Perp venue offline at deposit time | Revert deposit; no half-hedged state |
| Perp venue offline at rebalance time | Skip rebalance; emit `RebalanceFailed`; retry next trigger |
| Perp venue offline at withdrawal time | Withdrawal blocked; LP can call emergency `forceClose` after timeout |
| RSC fails to fire | Chainlink Automation acts as fallback keeper (lower frequency) |
| Buffer depletion | Auto-pause new deposits; reduce coupon rate |

---

## 15. AI Integrations

Atlas does not require AI in the core protocol. **Optional post-MVP enhancement:**

- **Hedge-sizing model** — an ML model trained on historical pool data could optimize the hedge-size multiplier dynamically (currently a flat 1:1 delta match). Off-chain inference, on-chain consumption via signed message.
- **Coupon-rate optimizer** — a reinforcement-learning model that adjusts the smoothing-vault coupon rate based on volatility regime forecasts, maximizing buffer stability.

Both are roadmap items, not MVP.

---

## 16. API Considerations

### 16.1 On-chain APIs (Solidity ABI)
- `AtlasVault.deposit(uint256 amount0, uint256 amount1, address recipient) returns (uint256 shares)`
- `AtlasVault.withdraw(uint256 shares, address recipient) returns (uint256 amount0, uint256 amount1)`
- `AtlasVault.bufferHealth() view returns (uint256 ratioBps)`
- `AtlasVault.currentCouponBps() view returns (uint256)`
- `AtlasHook.getHedgeStatus(PoolId id) view returns (HedgeStatus memory)`

### 16.2 Off-chain APIs (Subgraph/Ponder GraphQL)
- `vaultMetrics(timeRange)` — historical APR, buffer health, TVL
- `hedgeEvents(positionId)` — every rebalance event for a given position
- `comparisonChart(poolId, timeRange)` — hedged vs. unhedged simulated returns

### 16.3 Webhook integrations (post-MVP)
- Discord/Telegram notifications on `BufferLow` events for LPs
- Email alerts for institutional LPs on hedge resize > 10%

---

## 17. Monetization Ideas

| Stream | Mechanism | Indicative take-rate |
|---|---|---|
| **Performance fee** | % of yield generated above benchmark (e.g., 10% of returns above raw LP) | 10% |
| **Management fee** | Annual % of TVL streamed per-block | 0.5% |
| **Withdrawal fee** | Small fee on exits to discourage churn and fund buffer | 0.1% |
| **Protocol-owned liquidity** | Atlas accumulates a portion of fees as POL, earning yield in perpetuity | Compounding |
| **Whitelabel licensing** | License the hook to other AMMs and structured product platforms | Negotiated |

For the hackathon MVP: **zero fees** to maximize judge clarity. Fee structure activated only in production roadmap.

---

## 18. Security Considerations

| Risk | Mitigation |
|---|---|
| **Hook reentrancy** | OpenZeppelin ReentrancyGuard on all state-changing entrypoints |
| **Oracle manipulation** | Chainlink with staleness checks (reject prices > 5 min old); cross-validate against pool TWAP |
| **Perp venue counterparty risk** | Adapter pattern lets users see which venue holds their hedge; venue diversification on roadmap |
| **RSC callback spoofing** | Hook restricts rebalance to authenticated RSC address; signature verification on cross-chain message |
| **Buffer-drain attack** | Coupon rate capped; auto-reduce when buffer health < 0.25 |
| **Front-running on deposit** | Slippage parameters on deposit; private mempool option (Flashbots Protect) on roadmap |
| **Liquidation cascades on perp** | Conservative leverage (max 2x); auto-deleverage when collateralization < 150% |
| **Emergency pause** | Vault has `pause()` callable only by deployer (hackathon); multisig for production |

A formal audit is **out of scope** for the 3-week timeline but is the highest-priority post-hackathon item. The codebase will be designed audit-ready (clear invariants, NatSpec, fuzz tests) so a Spearbit or Trail of Bits engagement can be commissioned immediately.

---

## 19. Risks and Challenges

### 19.1 Technical risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Perp venue integration takes longer than 1 week | High | High | Build MockPerpAdapter first, swap in real venue last |
| Reactive Network testnet flakiness | Medium | High | Chainlink Automation fallback path; document both |
| Uniswap v4 hook permission encoding (CREATE2 mining) | Medium | Medium | Use Foundry's `HookMiner` utility, budget 1 day for it |
| Subgraph indexing lag during demo | Low | Medium | Test demo flow with Ponder pre-recorded; have backup data |
| Frontend breaks on judge's browser | Low | High | Test on Chrome, Firefox, Safari before submission |

### 19.2 Product risks

| Risk | Mitigation |
|---|---|
| Judges don't understand the hedge mechanism in 3 minutes | Lead the demo with the dual-pane chart, not the architecture |
| Fixed-rate coupon over-promises | Surface buffer health prominently; show transparent math |
| Atlas competes with the very LPs we serve (PMF risk) | Position as a tool for LPs, not a replacement |

### 19.3 Submission risks

| Risk | Mitigation |
|---|---|
| Missing the May 25 idea deadline | Submit Typeform by May 24 EOD; confirm Project ID by May 26 |
| Missing the June 11 final submission | Roadmap has 2 buffer days |
| Demo video fails to record | Pre-record 2 versions; have backup screen-recording software |

---

## 20. Competitor Analysis

| Competitor | What they do | Where Atlas wins |
|---|---|---|
| **Gamma Strategies** | Active LP management on v3/v4 | No hedge; still IL-exposed |
| **Arrakis Finance** | LP vault wrappers | No hedge; no fixed-rate smoothing |
| **Charm Finance Alpha Vaults** | Algorithmic v3 LP management | No hedge component |
| **Bunni** | Liquidity shaping for v4 | No hedge; focus is on liquidity distribution |
| **Pendle** | Fixed-rate yield wrappers | Operates on yield-bearing tokens, not raw LP positions |
| **Squeeth / Opyn structured products** | Options-based LP hedging | Requires user to manage two positions manually |
| **Smilee Finance** | IL protection vaults | Uses option-like primitives; less capital-efficient than direct perp hedge |

**Atlas's defensible wedge:** the *combination* of (a) automated perp hedging, (b) cross-chain reactive triggering, and (c) fixed-rate smoothing into a single LP wrapper. No competitor does all three. The closest analog is doing it manually across Hyperliquid + a v4 LP position + a custom smoothing script — exactly the pain Atlas eliminates.

---

## 21. Success Metrics

### 21.1 Hackathon success
- **Primary**: Win UHI9 main prize OR Reactive Network sponsor prize
- **Secondary**: Top-3 finish in any sponsor track (Chainlink, Unichain)
- **Tertiary**: Inclusion in UHI Hook Directory; Twitter mention from Uniswap or Reactive official accounts

### 21.2 Demo-day metrics
- Live deposit + auto-hedge demonstrated in under 90 seconds
- IL avoidance metric clearly shown (target: > 75% IL avoided in simulated dump)
- Reactive Network callback fires visibly during demo
- All judges able to articulate the value prop after the pitch

### 21.3 Post-hackathon north star (6 months)
- $5M TVL across testnet + mainnet
- 100+ unique LPs
- Integration with one institutional treasury (DAO or fund)
- Audit completed by reputable firm
- Mainnet launch on Unichain or Base

---

## 22. Future Scaling Ideas

### 22.1 Product depth
- **Multi-pool support** — One Atlas instance per popular volatile pair (ETH/USDC, WBTC/ETH, ARB/ETH, etc.)
- **Multi-asset baskets** — Atlas-managed three-asset LP vaults with portfolio-level delta hedging
- **Stable-pair specialization** — Atlas variants for stable-volatile pairs that hedge only the volatile leg
- **Tiered coupon products** — Conservative (6%), Standard (10%), Aggressive (15%) variants targeting different risk appetites

### 22.2 Cross-chain expansion
- Deploy Atlas hooks on every chain Uniswap v4 reaches (Unichain, Base, Arbitrum, Optimism, Polygon)
- Cross-chain LP routing: deposit on chain A, hedge on chain B, all coordinated by Reactive Network

### 22.3 Protocol integrations
- **Lending markets** — `aLP` accepted as collateral on Aave, Morpho, Euler
- **Structured products** — Pendle integration to wrap `aLP` into PT/YT split for further yield strategies
- **DAO treasuries** — Direct integration with Llama, Karpatkey, and other treasury managers

### 22.4 Governance
- Eventually transition risk parameters (rebalance threshold, coupon cap, max leverage) to a token-governed DAO
- Token launch with retroactive airdrop to early LPs

---

## 23. Roadmap

Full breakdown in [roadmap.md](./roadmap.md). High-level:

| Phase | Window | Deliverable |
|---|---|---|
| **Week 1** | May 26 – June 1 | Hook + MockPerpAdapter + unit tests + initial vault |
| **Week 2** | June 2 – June 8 | RSC + cross-chain integration + frontend MVP + subgraph |
| **Week 3** | June 9 – June 11 | Polish, demo video, submission, fallback testing |
| **Month 1 post** | June 12 – July 11 | Audit prep, Hyperliquid adapter, security review |
| **Month 3 post** | July – September | Mainnet launch on Unichain; first 5 LPs |
| **Month 6 post** | Sep – Dec | Multi-pool, institutional partnerships, $5M TVL target |

---

## 24. Go-to-Market Ideas

### 24.1 Hackathon-immediate
- Twitter thread on demo day with the hedged-vs-unhedged chart
- Cross-post in Uniswap Discord #hook-ideas
- DM the Reactive Network team for amplification (they amplify sponsor-winning projects)
- Submit to bankless / Defiant newsletter for week-after coverage

### 24.2 Beta launch (Month 2-3)
- Private beta with 5 hand-picked LP whales (cold DMs to Twitter accounts who LP'd > $100K)
- Karpatkey or Llama DAO outreach for treasury pilot
- Sponsor a small DeFi research grant ($2-5K) to get an analyst to write a public report

### 24.3 Public launch (Month 4+)
- Coordinated launch with Unichain ecosystem announcement
- Bug bounty via Immunefi to signal security maturity
- Yield campaigns: time-limited bonus APR funded by protocol treasury

### 24.4 Long-term moat
- Become the default integration partner for new Uniswap v4 pools launched by reputable teams
- Acquire or partner with one of the existing LP management protocols (Gamma, Arrakis) to consolidate the IL-protection narrative

---

## 25. Open Questions

1. Should the `aLP` token be transferrable mid-position, or locked until withdrawal? *(Recommendation: transferrable — increases composability.)*
2. What's the right initial coupon rate for the demo? *(Recommendation: hardcode 8% for clean storytelling.)*
3. Do we mine the hook address on Unichain Sepolia or use a vanity deployer? *(Recommendation: use Foundry HookMiner; budget 1 day.)*
4. Hyperliquid vs GMX vs both for production? *(Recommendation: Hyperliquid first — better liquidity, mature API.)*
5. Subgraph (The Graph) or Ponder? *(Recommendation: Ponder — faster, TypeScript-native, easier local dev.)*

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Impermanent loss (IL)** | The opportunity cost an LP incurs vs. simply holding the underlying assets, caused by AMM rebalancing |
| **Delta-neutral** | A position whose net directional exposure to price movement is zero |
| **Funding rate** | Periodic payment between perp long and short holders, typically positive for shorts in contango markets |
| **Hook** | Uniswap v4 mechanism allowing custom logic to execute around pool lifecycle events |
| **RSC** | Reactive Smart Contract — a contract on Reactive Network that subscribes to events and fires callbacks |
| **ERC-4626** | Standard interface for tokenized vaults |
| **Buffer health** | Ratio of vault buffer to forward coupon obligation; > 1.0 means structurally sound |
| **LVR** | Loss-versus-Rebalancing; cost LPs pay due to stale on-chain prices vs. CEX |
