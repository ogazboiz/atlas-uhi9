# Atlas — Technology Stack

| | |
|---|---|
| **Document version** | 1.0 |
| **Companion to** | [PRD.md](./PRD.md), [architecture.md](./architecture.md) |
| **Audience** | Engineers picking up the project, infra reviewers, contributors |

---

## Philosophy

Every choice below optimizes for **three weeks of execution time** with a small team. We choose tools that:
1. Have the fastest local-dev feedback loop
2. Have battle-tested production deployments somewhere else (we don't pioneer infrastructure)
3. Are familiar to the broadest pool of contributors (so contractors or new hires can plug in)

When a choice trades long-term sophistication for short-term velocity, that's the right call for this timeline. Production hardening is post-hackathon work.

---

## Layer 1: Smart Contracts

### Language
- **Solidity 0.8.26+**
  - Latest stable with `transient storage` support useful for v4 hook patterns
  - Avoid anything bleeding-edge that breaks Foundry tooling

### Core dependencies
- **Uniswap v4 Core** — `v4-core` from the official repo, pinned to latest stable tag
- **Uniswap v4 Periphery** — `v4-periphery` for `PositionManager` integration patterns
- **OpenZeppelin Contracts 5.x** — for ERC-20, ERC-4626, ReentrancyGuard, AccessControl
- **Solmate** — gas-efficient ERC-20 alternative if OZ overhead becomes a problem (post-MVP)

### Why Solidity over Vyper?
- v4 ecosystem is Solidity-native
- Hook permission encoding tooling (`HookMiner`) is Solidity-centric
- Talent pool is 10x larger

### Why not Arbitrum Stylus / Rust?
- We considered it. Stylus is fascinating for gas-intensive math.
- But: every additional toolchain costs a week. Stylus + v4 hooks together is an unknown unknown.
- If post-hackathon profiling shows gas matters more than ergonomics, port the smoothing math to Stylus then.

---

## Layer 2: Smart Contract Build & Test

### Build & test tool
- **Foundry** (forge + cast + anvil + chisel)
  - Native Solidity tests = fastest feedback loop
  - Fork testing against live Unichain Sepolia
  - `HookMiner` utility specifically for v4 hook address mining

### Why Foundry over Hardhat?
- Foundry tests run in milliseconds vs. Hardhat's seconds-to-minutes
- Native fuzz testing (no extra plugin) which we want for vault invariants
- No JavaScript dependency in the contract repo

### Test strategy
- **Unit tests** — every public function on every contract, edge cases included
- **Integration tests** — end-to-end deposit → rebalance → withdraw flows
- **Fork tests** — against Unichain Sepolia state for realism
- **Fuzz tests** — invariant testing on vault accounting (post-MVP, time permitting)

### Coverage target
- 80%+ on hook and vault logic
- 50%+ on MockPerpAdapter (lower because it's not production code)

---

## Layer 3: Cross-Chain Automation

### Choice
- **Reactive Network**
  - This is the sponsor we want to win. Using their SDK is mandatory.
  - Reactive Smart Contracts (RSCs) handle the cross-chain subscribe-and-callback pattern natively.

### How we use it
- Deploy one RSC that subscribes to:
  - Chainlink ETH/USD feed events on Sepolia
  - Pool `Swap` events on Unichain Sepolia
- RSC computes divergence, fires callback to `AtlasHook.rebalanceCallback()` on Unichain Sepolia

### Fallback
- **Chainlink Automation** as a lower-frequency keeper
- Fires every 1 hour regardless, ensuring the hedge never gets too stale even if RSC has a bad day
- Documented in the README so judges see we thought about failure modes

### Alternatives considered & rejected
- **Gelato Network** — works, but Reactive is the sponsor; using Gelato leaves prize money on the table
- **Chainlink Automation alone** — block-polled rather than event-driven; misses the "reactive" narrative
- **Custom keeper bot** — defeats the autonomy thesis

---

## Layer 4: Price Oracles

### Choice
- **Chainlink Data Feeds** (ETH/USD on Sepolia)
  - Industry standard
  - Sepolia testnet feeds are live and reliable
  - Subscribing to feed updates from Reactive Network is well-documented

### Staleness handling
- Reject prices older than 5 minutes (`block.timestamp - updatedAt > 300`)
- Cross-validate against pool TWAP as sanity check (warn if divergence > 200bps without recent oracle update)

### Why not Pyth or RedStone?
- Pyth uses a pull model which complicates the Reactive subscription pattern
- RedStone is excellent but smaller validator set; Chainlink is the safe judges-know-it choice

---

## Layer 5: Perp Venue (Hedge Leg)

### Hackathon choice
- **Custom MockPerpAdapter**
  - Lives on Unichain Sepolia as a regular contract
  - Simulates: open/close positions, mark price tracking, funding accrual, liquidations
  - Funding rate calibrated to mimic typical Hyperliquid behavior (~10% annualized for shorts in bull regime)

### Production choice
- **Hyperliquid** (primary)
  - Mature, deep liquidity, well-documented API
  - Lives on Hyperliquid L1, accessible via cross-chain message

### Production secondary
- **GMX on Arbitrum**
  - Diversifies counterparty risk
  - Familiar to retail users

### Why not just deploy on Hyperliquid for the demo?
- Hyperliquid API integration is week-of-work uncertainty
- Mock lets the whole rest of the system be built and demoed
- Adapter pattern means swapping Mock → Hyperliquid is a 1-week task, not a refactor

---

## Layer 6: Indexer

### Choice
- **Ponder** (TypeScript-native)
  - GraphQL endpoint out of the box
  - Hot-reload during development
  - Easy self-hosting on Railway
  - Indexing speed: ~30s from event to query

### Schema (simplified)
```typescript
{
  positions: { id, owner, poolId, liquidity, hedgeSize, createdAt },
  hedgeEvents: { id, positionId, eventType, delta, timestamp, txHash },
  vaultMetrics: { id (per block), totalAssets, bufferHealth, couponBps },
  rebalanceCallbacks: { id, nonce, divergenceBps, triggeredAt, txHash }
}
```

### Why not The Graph?
- Slower hosted indexing (sometimes hours of lag for new subgraphs)
- YAML + AssemblyScript adds friction
- The Graph is better for long-term decentralized indexing; we're optimizing for demo-day velocity

### Why not just RPC polling from the frontend?
- Slow, unreliable, eats RPC credits
- Ponder's indexed data lets the frontend stay responsive even on flaky networks

---

## Layer 7: Frontend

### Framework
- **Next.js 14 (App Router)**
  - Server components reduce client-side bundle
  - Vercel deployment is one-click
  - SEO out of the box for the landing page

### Wallet integration
- **RainbowKit + wagmi v2 + viem**
  - Standard combination, well-supported
  - Type-safe with TypeScript end-to-end
  - Multi-wallet support: MetaMask, Rabby, WalletConnect, Coinbase Wallet

### Styling
- **Tailwind CSS** + **shadcn/ui** components
  - Fast to build with
  - Looks professional out of the box
  - Easy to customize for brand identity

### Charts
- **TradingView Lightweight Charts**
  - Industry standard for financial charts
  - Performance optimized for many data points
  - The comparison chart is the demo centerpiece; this is the right tool

### State management
- **React Query (TanStack Query)** for server state
- **Zustand** for client state if needed (probably not — server state is sufficient)
- No Redux; we don't need that complexity for this scope

### Why not RainbowKit alternatives like ConnectKit or Dynamic?
- RainbowKit is the most familiar to crypto-native judges
- Both alternatives are fine; switching costs are minimal post-MVP

---

## Layer 8: Deployment & Hosting

### Frontend
- **Vercel**
  - Free tier sufficient for demo
  - One-command deploy from GitHub
  - Custom domain on Vercel = trivial

### Indexer
- **Railway**
  - Easy Postgres provisioning
  - Background workers supported
  - $5-20/month, fits hackathon budget

### Contract deployment
- **Foundry script-based deployment** to Unichain Sepolia
- **Hosted RPC**: Alchemy or QuickNode for production; default public RPC for dev
- **Verification**: Etherscan/Blockscout via `forge verify-contract`

### Why not self-host everything?
- We have 3 weeks. Every hour spent on infra is an hour not building product.
- Vercel + Railway is the proven hackathon stack

---

## Layer 9: Tooling & Developer Experience

### Package management
- **Bun** for the frontend (faster than npm/yarn/pnpm)
- **Foundry's `forge install`** for contract dependencies

### Linting & formatting
- **Solhint** for Solidity
- **Prettier + ESLint** for TypeScript
- **Forge fmt** for consistent Solidity formatting

### CI/CD
- **GitHub Actions**
  - Run `forge test` on every PR
  - Run `forge fmt --check`
  - Deploy preview frontend to Vercel on PR
  - Block merge if tests fail

### Monorepo or polyrepo?
- **Polyrepo** — three repos:
  1. `atlas-contracts` (Foundry)
  2. `atlas-frontend` (Next.js)
  3. `atlas-indexer` (Ponder)
- Reason: separate CI pipelines, separate deployment cadences, no monorepo tooling learning curve

---

## Layer 10: Observability

### During the hackathon
- **Vercel Analytics** on the frontend (no-config)
- **Ponder logs** streamed to a Discord webhook (so we can monitor the indexer remotely)
- **A "demo health" page** at `/health` showing: latest block indexed, latest RSC callback time, vault TVL, last 10 events

### Post-hackathon (production)
- **Grafana + Prometheus** for vault metrics dashboards
- **PagerDuty** for critical alerts (buffer drain, perp venue outage)
- **Sentry** for frontend error tracking

---

## Environment Variables

### Required for local development

```bash
# RPC endpoints
UNICHAIN_SEPOLIA_RPC=https://...
SEPOLIA_RPC=https://...
REACTIVE_TESTNET_RPC=https://...

# Deployment
DEPLOYER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
UNICHAIN_EXPLORER_API_KEY=...

# Frontend
NEXT_PUBLIC_PONDER_URL=http://localhost:42069
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

# Indexer
DATABASE_URL=postgresql://...
PONDER_RPC_URL_130=$UNICHAIN_SEPOLIA_RPC  # chainId 130
```

### Required for production

Same as above, plus:
- `SENTRY_DSN`
- `DISCORD_WEBHOOK_URL`
- `HYPERLIQUID_API_KEY` (once integrated)

---

## Repository Structure (per repo)

### `atlas-contracts/`
```
atlas-contracts/
├── src/
│   ├── AtlasHook.sol
│   ├── AtlasVault.sol
│   ├── aLP.sol
│   ├── adapters/
│   │   ├── IPerpAdapter.sol
│   │   ├── MockPerpAdapter.sol
│   │   └── HyperliquidAdapter.sol (post-MVP)
│   ├── oracles/
│   │   └── ChainlinkOracleAdapter.sol
│   └── reactive/
│       └── AtlasReactive.sol
├── test/
│   ├── AtlasHook.t.sol
│   ├── AtlasVault.t.sol
│   ├── MockPerpAdapter.t.sol
│   └── integration/
│       └── EndToEnd.t.sol
├── script/
│   ├── Deploy.s.sol
│   └── SeedDemo.s.sol
├── foundry.toml
└── README.md
```

### `atlas-frontend/`
```
atlas-frontend/
├── app/
│   ├── page.tsx
│   ├── deposit/
│   ├── positions/
│   ├── compare/
│   └── activity/
├── components/
│   ├── DepositForm.tsx
│   ├── ComparisonChart.tsx
│   ├── BufferGauge.tsx
│   ├── ReactiveEventFeed.tsx
│   └── ui/ (shadcn components)
├── lib/
│   ├── wagmi.ts
│   ├── contracts.ts
│   └── ponder.ts
├── public/
└── README.md
```

### `atlas-indexer/`
```
atlas-indexer/
├── ponder.config.ts
├── ponder.schema.ts
├── src/
│   └── index.ts (event handlers)
└── README.md
```

---

## Decision Summary Table

| Layer | Choice | Top alternative | Why we chose this |
|---|---|---|---|
| Contract language | Solidity 0.8.26 | Vyper / Stylus | Ecosystem mass, tooling |
| Build tool | Foundry | Hardhat | 10x faster tests |
| Cross-chain automation | Reactive Network | Gelato / Chainlink Auto | Sponsor track + native event subscribing |
| Oracle | Chainlink | Pyth / RedStone | Sponsor, reliability, RN compatibility |
| Perp venue (demo) | MockPerpAdapter | Hyperliquid direct | Time risk; adapter pattern preserves option |
| Perp venue (prod) | Hyperliquid | GMX | Liquidity depth, API maturity |
| Indexer | Ponder | The Graph | TypeScript DX, faster |
| Frontend framework | Next.js 14 | Remix / Vite | Vercel deploy, SSR for SEO |
| Wallet stack | RainbowKit + wagmi + viem | ConnectKit / Dynamic | Most-familiar combo for crypto judges |
| Charts | TradingView LWC | Recharts | Financial chart pedigree |
| Hosting (frontend) | Vercel | Cloudflare Pages / Fly | One-command deploy |
| Hosting (indexer) | Railway | Render / Fly | Simple Postgres provisioning |
| CI | GitHub Actions | CircleCI | Already integrated with GitHub |
| Repo layout | Polyrepo | Turborepo monorepo | Less tooling overhead |
