# Atlas — Feature Breakdown

| | |
|---|---|
| **Document version** | 1.0 |
| **Companion to** | [PRD.md](./PRD.md), [roadmap.md](./roadmap.md) |
| **Audience** | Engineers, PM, QA — for scoping and sprint planning |

---

## Priority Legend

- **P0** — Critical for MVP. Without this, the demo doesn't work.
- **P1** — Important but defer-able. Adds polish or breadth, not core value.
- **P2** — Post-hackathon. Roadmap items, not in scope for June 11.

---

## Feature Catalog

### F1 — Auto-hedge on deposit

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 4 days
**Dependencies**: F4 (Perp Adapter interface), Uniswap v4 hook scaffolding

**Description**: When an LP adds liquidity through the Atlas hook, the hook computes the LP's effective volatile-asset delta and immediately opens a matched short position via the configured PerpAdapter.

**Why this feature**: This is the core thesis. Without auto-hedging on deposit, Atlas is just another LP wrapper. The autonomy on entry is what eliminates the "I forgot to hedge" failure mode.

**Acceptance criteria:**
- [ ] `afterAddLiquidity` callback fires within the deposit transaction
- [ ] Hedge size equals the LP's volatile-asset delta within 0.1% tolerance
- [ ] If `openShort()` reverts, the entire deposit transaction reverts (no half-hedged state)
- [ ] An `HedgeOpened` event is emitted with positionId, size, and collateral
- [ ] Foundry unit tests cover: full-range LP, concentrated LP, single-sided deposit

**Out of scope for this feature**: rebalancing (F2), unwinding on withdraw (F5)

---

### F2 — Cross-chain reactive rebalancing

**Priority**: P0
**Owner**: Contracts + Reactive Network engineer
**Estimated effort**: 5 days
**Dependencies**: F1 (hedge exists to rebalance), Reactive Network SDK familiarity

**Description**: A Reactive Smart Contract deployed on Reactive Network monitors two event streams (Chainlink oracle updates + pool swap events). When the divergence between oracle and pool price exceeds a configurable threshold, the RSC fires a callback to the Atlas hook on the pool chain, which resizes the perp short.

**Why this feature**: This is the "why use Reactive Network" answer. Without it, Atlas is a vanilla single-chain hook. With it, Atlas demonstrates a genuine use case for cross-chain reactive automation that judges have been asking for.

**Acceptance criteria:**
- [ ] RSC deployed on Reactive Network testnet with documented address
- [ ] RSC subscribes to Chainlink ETH/USD feed events on Sepolia
- [ ] RSC subscribes to pool Swap events on Unichain Sepolia
- [ ] Divergence threshold configurable (default 30bps)
- [ ] Callback includes anti-replay nonce + deadline
- [ ] Hook verifies caller is the registered RSC
- [ ] End-to-end test: simulate price divergence → observe hedge resize within 30s
- [ ] Failsafe: rebalance delta capped at 20% of position to prevent malicious oversizing

**Out of scope**: optimal threshold tuning (P1 follow-up), governance over RSC parameters (P2)

---

### F3 — Smoothing vault with flat APR

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 3 days
**Dependencies**: ERC-4626 reference implementation

**Description**: An ERC-4626 vault receives all swap fees and funding income from the hook and the perp adapter. It pays out a flat per-block coupon to `aLP` token holders. The coupon rate is derived from the 10-day trailing average of inflows, capped at `maxCouponBps`. A buffer absorbs variance.

**Why this feature**: The smoothing is what makes the product institutionally credible. Variable LP yield is unbankable; flat 8% APR is bankable. Without smoothing, Atlas is "hedged but still lumpy" — only half of the value prop.

**Acceptance criteria:**
- [ ] Vault implements full ERC-4626 interface
- [ ] `couponBps` updates daily based on 10-day trailing inflow average
- [ ] `couponBps` capped at 1500bps (15%)
- [ ] `previewRedeem()` accurately reflects accrued coupon at any block
- [ ] `bufferHealth()` view returns ratio of buffer to 30-day coupon obligation
- [ ] Auto-pause deposits when `bufferHealth() < 0.5`
- [ ] Auto-halve coupon when `bufferHealth() < 0.25`
- [ ] Foundry tests cover: high-vol regime, low-vol regime, buffer drain, buffer recovery

**Out of scope**: Multiple coupon tiers (P2), governance over rate (P2)

---

### F4 — Perp Adapter interface + Mock implementation

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 3 days
**Dependencies**: None

**Description**: An abstract `IPerpAdapter` interface defines the four core operations needed by Atlas (`openShort`, `resizeShort`, `closeShort`, `getPositionValue`). A `MockPerpAdapter` implements this interface with realistic funding behavior for the testnet demo.

**Why this feature**: Real perp venue integration (Hyperliquid/GMX) carries too much risk for a 3-week timeline. The Mock lets the rest of the system be built and demoed end-to-end. The interface contract is what makes future real-venue integration a 1-week swap rather than a refactor.

**Acceptance criteria:**
- [ ] `IPerpAdapter` interface defined with NatSpec
- [ ] `MockPerpAdapter` opens/resizes/closes positions atomically
- [ ] Mock simulates funding payments: accrues to vault every N blocks based on (oracle price - mark price) drift
- [ ] Mock supports configurable liquidation logic for stress tests
- [ ] Unit tests cover: open, resize, close, funding accrual, liquidation

**Out of scope**: `HyperliquidAdapter` (P2), `GMXAdapter` (P2)

---

### F5 — Hedge unwind on withdrawal

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 2 days
**Dependencies**: F1 (hedge to unwind), F3 (vault accounting)

**Description**: When an LP burns `aLP` to withdraw, the hook closes a proportional share of the perp position and returns the underlying WETH + USDC + accrued coupon yield.

**Why this feature**: Without clean unwind, LPs can deposit but never exit safely. This is the close-the-loop feature.

**Acceptance criteria:**
- [ ] `withdraw()` closes proportional perp share before removing pool liquidity
- [ ] If perp closure fails, withdrawal reverts (no orphan positions)
- [ ] Slippage on perp closure bounded by `maxWithdrawSlippageBps` (default 100bps)
- [ ] Partial withdrawals work correctly (50%, 25%, 10%)
- [ ] `HedgeClosed` event emitted with final PnL
- [ ] Tests: full withdrawal, partial withdrawal, withdrawal during low buffer, withdrawal after multiple rebalances

---

### F6 — Frontend dashboard with hedged-vs-unhedged comparison

**Priority**: P0
**Owner**: Frontend engineer
**Estimated effort**: 5 days
**Dependencies**: F7 (subgraph), F1-F5 (contracts deployed)

**Description**: A Next.js frontend with a dashboard that lets LPs deposit, withdraw, and view their positions. The centerpiece is a dual-line chart showing Atlas position value vs. the unhedged baseline over time. A live event feed shows Reactive Network callbacks streaming in real-time.

**Why this feature**: Judges score what they can see. The chart is the proof; the event feed is the proof of the proof. Without strong frontend, the technical work is invisible.

**Acceptance criteria:**
- [ ] Landing page communicates value prop in <5 seconds of reading
- [ ] Deposit flow works on Chrome, Firefox, Safari
- [ ] Position list shows all user positions with live values
- [ ] Comparison chart renders smoothly with up to 30 days of data
- [ ] Live event feed updates within 30s of on-chain event
- [ ] Buffer health gauge visualizes current state with color coding
- [ ] All transactions show clear pending/success/error states
- [ ] Responsive enough for demo on a projector (1080p minimum)

**Out of scope**: Mobile UI (P2), dark mode toggle (P1)

---

### F7 — Subgraph / Ponder indexer

**Priority**: P0
**Owner**: Frontend engineer (or contracts engineer)
**Estimated effort**: 2 days
**Dependencies**: F1-F5 (events to index)

**Description**: A Ponder indexer subscribes to all Atlas contract events on Unichain Sepolia and exposes a GraphQL endpoint with positions, hedge events, vault metrics, and rebalance history.

**Why this feature**: Without indexing, the frontend would need to scan every block, which is slow and unreliable. Ponder gives <30s latency from event to GraphQL query.

**Acceptance criteria:**
- [ ] Ponder project scaffolded and indexing live testnet
- [ ] Schema covers: `Position`, `HedgeEvent`, `VaultMetric`, `RebalanceCallback`
- [ ] GraphQL API exposed at a stable URL (Railway-hosted)
- [ ] Indexer survives RPC blips (auto-retry, no manual restart needed)
- [ ] Sample queries tested against frontend needs

---

### F8 — `aLP` ERC-20 receipt token

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 1 day
**Dependencies**: ERC-20 reference

**Description**: A standard ERC-20 token representing the LP's claim on the vault. Transferrable. Total supply tracked by vault.

**Why this feature**: ERC-20 standard is what makes Atlas composable. Other protocols can integrate `aLP` as collateral. Users can trade `aLP` on secondary markets without exiting their position.

**Acceptance criteria:**
- [ ] Standard ERC-20 interface (OpenZeppelin base)
- [ ] Mint/burn restricted to AtlasVault
- [ ] `name()` returns "Atlas LP - WETH/USDC"
- [ ] `symbol()` returns "aLP-WETH-USDC"
- [ ] Permit (EIP-2612) supported for gasless approvals

---

### F9 — One-command deploy script

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 1 day
**Dependencies**: All contracts compiled

**Description**: A Foundry deployment script that handles hook address mining, deploys all contracts in correct order, configures cross-contract references, and writes addresses to a JSON file consumed by the frontend.

**Why this feature**: Reproducibility matters for judges. "Clone, install, run one command, see it deployed" is the experience. Anything more friction-y will be tried and abandoned.

**Acceptance criteria:**
- [ ] `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast` deploys everything
- [ ] Hook address mining handled automatically via Foundry's `HookMiner`
- [ ] Contract addresses written to `deployments/<chainId>.json`
- [ ] Frontend automatically picks up addresses from JSON
- [ ] README documents the full deploy flow with example output

---

### F10 — "Trigger Volatility Event" demo button

**Priority**: P0
**Owner**: Frontend + contracts engineer
**Estimated effort**: 1 day
**Dependencies**: F6 (frontend), live deployment

**Description**: A button on the demo page that fires a scripted large swap on the pool, causing pool price to diverge from oracle. This triggers the RSC to fire a rebalance callback within ~30s, visible in the activity feed.

**Why this feature**: Judges have 3 minutes of attention. Waiting for organic volatility is unacceptable. This button manufactures the demo moment on demand.

**Acceptance criteria:**
- [ ] Button visible only on the `/compare` demo page
- [ ] Click executes a 1-2% price-impact swap on the demo pool
- [ ] Within 30-60s, RSC callback fires and is visible in event feed
- [ ] Chart updates to show hedge resize
- [ ] Button is rate-limited to one click per minute to prevent abuse

---

### F11 — Pre-seeded demo positions

**Priority**: P0
**Owner**: Contracts engineer
**Estimated effort**: 0.5 day
**Dependencies**: F9 (deploy script)

**Description**: As part of deployment, three demo LP positions are pre-created with synthetic activity history, so the dashboard isn't empty when judges arrive.

**Why this feature**: An empty dashboard signals "nobody uses this." Pre-seeded positions create the illusion of an active protocol, which sets context for the demo.

**Acceptance criteria:**
- [ ] Three positions of $1K, $10K, $50K USD-equivalent
- [ ] Each position has 7+ days of simulated history (rebalances, fee accruals)
- [ ] Positions display realistic IL-avoided metrics

---

### F12 — Demo video (pre-recorded backup)

**Priority**: P0
**Owner**: Anyone, but ideally the PM/storyteller
**Estimated effort**: 1 day
**Dependencies**: All else working

**Description**: A 2-minute pre-recorded video walking through the full demo flow, hosted on YouTube. Used as backup if the live demo fails during judging.

**Why this feature**: Defensive. Live demos fail; videos don't. Every winning hackathon project has a clean video.

**Acceptance criteria:**
- [ ] 90-120 seconds long
- [ ] Voice-over explains each step
- [ ] Captions for accessibility
- [ ] Shows: landing page, deposit flow, hedge preview, volatility trigger, RSC callback, hedge resize, comparison chart
- [ ] Uploaded to YouTube (unlisted), link in README

---

## P1 — Important but defer-able

### F13 — Dark mode

Low effort, high polish. Add if time permits in week 3.

### F14 — Discord webhook for rebalance alerts

Demo-friendly. Shows that the indexer feeds external systems. Add if subgraph work finishes early.

### F15 — `aLP` permit (gasless approval)

Improves UX. Add to F8 if there's slack.

### F16 — Improved coupon-rate algorithm

Current: 10-day moving average. Better: volatility-weighted EMA. Defer to post-hackathon.

### F17 — Multi-position aggregation view

Useful for users with many positions. Defer.

---

## P2 — Post-hackathon

### F18 — HyperliquidAdapter (production perp integration)

Targeted for month 1 post-hackathon. The Mock unblocks the demo; Hyperliquid unblocks production.

### F19 — GMXAdapter (Arbitrum alternative perp)

Diversification. Month 2.

### F20 — Multi-pool support

Atlas instance per popular pair. Month 2-3.

### F21 — Insurance backstop pool

Underwriters provide capital, earn premium yield, backstop the vault buffer. Month 3-4.

### F22 — Token launch + governance

Eventually transition risk parameters to a DAO. Month 6+.

### F23 — Cross-chain LP routing

Deposit on chain A, hedge on chain B, all coordinated by Reactive. Month 6+.

### F24 — Composable `aLP` integrations

Lending markets accept `aLP` as collateral. Pendle splits `aLP` into PT/YT. Long-term partnership work.

---

## MVP Definition (final)

**The MVP for June 11 submission consists of F1 through F12.** Total estimated effort: 28 person-days. With a team of 2 working 10 hours/day for 21 days = 42 person-days available. **42 / 28 = 1.5x buffer**, which is healthy for hackathon timelines.

**If the team falls behind**, the de-scope priority order is:
1. F11 (pre-seeded positions) — can be created manually right before demo
2. F10 (volatility trigger button) — can be simulated by running a manual swap script
3. F13-F17 (P1 items) — already deferred
4. F6 polish — can ship a less polished UI
5. **Do not de-scope**: F1, F2, F3, F4, F5, F12

**If the team gets ahead**, add P1 items in priority order: F15 (gasless), F13 (dark mode), F14 (Discord webhook), F16 (better coupon algo), F17 (multi-position view).
