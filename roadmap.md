# Atlas — Roadmap

| | |
|---|---|
| **Document version** | 1.0 |
| **Companion to** | [PRD.md](./PRD.md), [feature-breakdown.md](./feature-breakdown.md) |
| **Audience** | Team, mentors, judges who care about execution credibility |

---

## Roadmap Structure

1. **Pre-hackathon** — May 22 to May 25 (idea submission)
2. **Hackathon weeks 1-3** — May 26 to June 11 (build + ship)
3. **Post-hackathon month 1** — June 12 to July 11 (audit prep, real perp)
4. **Months 2-3** — Mainnet launch + first LPs
5. **Months 4-6** — Scale + institutional partnerships
6. **Year 1 vision** — Multi-pool, multi-chain, token launch consideration

---

## Pre-Hackathon (May 22 – 25)

### Goal: Submit the idea by May 25, 11:59 PT

| Day | Owner | Deliverable |
|---|---|---|
| May 22 (Fri) | PM | Finalize Atlas vs Pulse decision (Atlas) |
| May 23 (Sat) | PM | Draft Typeform submission text (200 words) |
| May 24 (Sun) | All | Team kickoff call — roles assigned, RPCs configured, repos created |
| May 25 (Mon) | PM | Submit Typeform before 11:59 PT |

---

## Week 1: Foundation (May 26 – June 1)

### Goal: All core contracts compiled, deployed to local Anvil, basic tests passing

### Day-by-day

| Day | Engineer focus | Frontend focus |
|---|---|---|
| Mon May 26 | Scaffold Foundry project, set up `IPerpAdapter` interface, start `AtlasHook` skeleton with v4 imports | Scaffold Next.js + Tailwind + RainbowKit boilerplate |
| Tue May 27 | Implement `afterAddLiquidity` callback logic, hook permission encoding | Build landing page + wallet connect |
| Wed May 28 | Implement `MockPerpAdapter` with funding simulation | Stub out deposit form (no real contract calls yet) |
| Thu May 29 | Implement `AtlasVault` ERC-4626 base + smoothing math | Connect deposit form to Anvil-deployed mock contracts |
| Fri May 30 | Implement `aLP` ERC-20 + vault mint/burn integration | Start work on `<ComparisonChart />` with mock data |
| Sat May 31 | Buffer day — fix bugs, write Foundry tests for F1-F4 | Polish landing page copy |
| Sun Jun 1 | **Progress update #1 due** (post in #hookathon channel) | |

### End-of-week-1 milestone
- AtlasHook + MockPerpAdapter + AtlasVault + aLP deployed to local Anvil
- Foundry tests passing for deposit + hedge open flow
- Frontend can connect wallet and render the (empty) dashboard

### Risk flags to watch
- If hook address mining is harder than expected: dedicate Saturday entirely to it
- If v4 Periphery is unstable: pin to a known-good commit

---

## Week 2: Integration (June 2 – June 8)

### Goal: Reactive Network integrated, end-to-end flow working on testnet, frontend functional

### Day-by-day

| Day | Engineer focus | Frontend focus |
|---|---|---|
| Mon Jun 2 | Deploy contracts to Unichain Sepolia, verify on block explorer | Set up Ponder indexer pointed at testnet |
| Tue Jun 3 | Start `AtlasReactive` RSC implementation; deploy to Reactive testnet | Wire frontend deposit flow to live contracts |
| Wed Jun 4 | Implement cross-chain rebalance callback (RSC → hook) | Build `<PositionCard />` and position detail page |
| Thu Jun 5 | End-to-end test: simulate price divergence, observe hedge resize | Implement `<ReactiveEventFeed />` (websocket to Ponder) |
| Fri Jun 6 | Implement `beforeRemoveLiquidity` + withdraw flow | Polish comparison chart with real data |
| Sat Jun 7 | Buffer day — squash bugs from cross-chain testing | Implement buffer health gauge + warning banner |
| Sun Jun 8 | **Progress update #2 due** | |

### End-of-week-2 milestone
- Full deposit → auto-hedge → rebalance → withdraw loop works on testnet
- RSC fires real callbacks visible in the frontend event feed
- Comparison chart shows real (small) historical data

### Risk flags to watch
- Reactive Network testnet flakiness: have Chainlink Automation fallback ready
- Cross-chain latency surprises: document actual observed times in case they're high

---

## Week 3: Polish + Submit (June 9 – June 11)

### Goal: Demo-ready, polished, submission complete

### Day-by-day

| Day | All hands |
|---|---|
| Mon Jun 9 | Pre-seed 3 demo positions. Build "Trigger Volatility Event" button. Run dress rehearsals of the full demo flow. |
| Tue Jun 10 | Record demo video (multiple takes). Write submission writeup. Final UI polish. Stress test the demo. Lock all contract addresses. |
| Wed Jun 11 | Final QA pass at 9 AM. Submit by 5 PM Pacific (give buffer before 11:59 PT deadline). Tweet thread + Discord post. |

### Submission checklist (Wed morning)
- [ ] GitHub repo public, README clean
- [ ] All contracts verified on block explorer
- [ ] Demo URL live and accessible
- [ ] Demo video uploaded (unlisted YouTube)
- [ ] Twitter thread drafted, scheduled for submission time
- [ ] Discord posts drafted for #showcase and #reactive
- [ ] Project ID (HK-UHI9-XXXX) confirmed
- [ ] Submission form completed and submitted
- [ ] Confirmation email received from team@atrium.academy

---

## Post-Hackathon Month 1 (June 12 – July 11)

### Goal: Audit-ready code, real perp integration, security review

### Workstreams

**Security**
- Engage Spearbit or Trail of Bits for a 2-week audit
- Set up Immunefi bug bounty (tier: $10K-50K)
- Add fuzz tests with Foundry/Echidna for vault invariants
- Add formal NatSpec documentation for all public functions

**Production perp integration**
- Build `HyperliquidAdapter`
- Build cross-chain bridge logic for collateral (if Hyperliquid is on a different chain)
- Integration tests against Hyperliquid testnet

**Operations**
- Set up production monitoring (Grafana dashboards for vault metrics)
- Set up alerting (PagerDuty for critical events)
- Document runbooks for incidents (buffer drain, perp venue outage, RSC failure)

**Community**
- Twitter presence (post weekly updates)
- Apply to Atrium follow-on grants
- Apply to Uniswap Foundation grants
- Apply to Reactive Network ecosystem grants

---

## Months 2-3 (July – September): Beta Launch

### Goal: Mainnet on Unichain, $1M+ TVL, first institutional pilot

### Milestones
- **July 15**: Audit report delivered
- **August 1**: Mainnet deployment on Unichain
- **August 15**: First 5 LPs onboarded (hand-picked Twitter whales)
- **September 1**: First institutional pilot (DAO treasury — target: Llama, Karpatkey, Mantle, or a stablecoin issuer treasury)
- **September 30**: $1M+ TVL across mainnet positions

### Feature additions
- Real Hyperliquid integration replaces MockPerpAdapter
- Multi-position aggregation view
- Discord/Telegram alerting for LPs
- Improved coupon-rate algorithm (volatility-weighted EMA)

---

## Months 4-6 (October – December): Scale

### Goal: $5M TVL, multi-pool, second institutional pilot

### Milestones
- **October**: Add second pool (WBTC/ETH or ARB/ETH)
- **November**: Add GMXAdapter for venue diversification
- **December**: Second institutional pilot
- **December 31**: $5M TVL, 100+ unique LPs

### Feature additions
- Multi-pool support
- Insurance backstop pool (underwriters earn premium yield)
- Composable `aLP` — push for Morpho or Euler integration
- Mobile-responsive frontend

---

## Year 1 Vision (by May 2027)

### Stretch goals
- **$25M+ TVL** across 5+ pools on 2+ chains
- **Token launch consideration** with retroactive airdrop to early LPs (if/when product-market fit is undeniable)
- **Integration with Pendle** to split `aLP` into PT/YT for fixed-rate yield trading
- **Treasury partnerships** with 3+ recognizable DAOs
- **Cross-chain LP routing** (deposit on chain A, hedge on chain B, coordinated by Reactive)
- **DAO governance** for risk parameters

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-22 | Atlas over Pulse as primary | Atlas hits 3/5 UHI9 sub-themes vs. Pulse's 2; perp hedge is a stronger thesis than treasury-managed lending |
| 2026-05-22 | MockPerpAdapter for MVP, Hyperliquid for production | Real perp integration is week-of-research uncertainty; mock unblocks the whole demo |
| 2026-05-22 | Ponder over The Graph for indexer | Faster local dev, TypeScript-native, easier to host on Railway |
| 2026-05-22 | Unichain Sepolia as primary deploy target | Native v4 chain, judges from Unichain track, Reactive Network compatible |
| 2026-05-22 | Hardcode risk parameters at deploy for MVP | No time for governance contract; risk params can be re-deployed if needed |

---

## Cadence

- **Daily standup**: 9 AM call, 15 minutes max. What I did, what I'll do, what's blocking me.
- **Mid-week sync**: Wednesday 6 PM, 30 minutes. Demo what's working, replan if needed.
- **End-of-week review**: Sunday 6 PM, 60 minutes. Look at the week's progress vs. plan. Adjust next week.

---

## Buffer Strategy

The roadmap above includes **two explicit buffer days per week** (Saturdays) and a **1.5x effort buffer** in the feature breakdown. This is intentional. Hackathon plans always slip; planning for slip is professional, not pessimistic.

If everything goes smoothly and we finish week 2 ahead of schedule, the bonus time goes to:
1. Polish — UI animations, micro-interactions, narrative copy
2. P1 features — F13, F14, F15, F16, F17 in priority order
3. Twitter content — start building public anticipation before the submission lands

If we fall behind, the de-scope order is documented in [feature-breakdown.md](./feature-breakdown.md#mvp-definition-final).
