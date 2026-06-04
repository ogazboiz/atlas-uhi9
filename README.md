# Atlas

**Delta-Hedged LP Vault Hook for Uniswap v4**

Atlas turns volatile Uniswap LP positions into fixed-rate income. Every deposit is paired with a delta-matched perpetual short opened by the hook, and a Reactive Smart Contract on Reactive Lasna autonomously triggers rebalances when the on-chain price moves. LP fees and funding income flow into an ERC-4626 vault that pays out a flat per-block coupon.

> UHI9 Hookathon submission. Track: *Impermanent Loss & Yield Systems*. Sponsor: *Reactive Network*.

## Try it now

| | Link |
|---|---|
| **Live demo** | https://atlas-uhi9-u148.vercel.app |
| Comparison chart (Atlas vs Vanilla LP, with on-chain trigger button) | https://atlas-uhi9-u148.vercel.app/compare |
| Deposit page (mint test USDC, deposit into the live vault) | https://atlas-uhi9-u148.vercel.app/deposit |
| Positions page (your aLP shares + on-chain deposit history) | https://atlas-uhi9-u148.vercel.app/positions |
| Activity page (unified vault + hook + reactive event timeline) | https://atlas-uhi9-u148.vercel.app/activity |
| Reactive integration deep-dive | [docs/reactive-integration.md](docs/reactive-integration.md) |
| AI layer deep-dive | [docs/ai-layer.md](docs/ai-layer.md) |

**60-second demo path:**
1. Open `/compare`. Connect any wallet on Unichain Sepolia.
2. Press `1` on the keyboard (or click `Dump 15%`). One tx fires `setPrice` on the on-chain oracle.
3. The chart's vanilla line drops; the Atlas line stays flat. Sticky stats bar flips green showing the Atlas LP outperformed.
4. Within ~15-20 seconds the Reactive event feed adds a new row: the cross-chain callback from Lasna landed and the hook's `lastNonce` ticked. The full loop is observable on-chain.

**Pool chain**: Unichain Sepolia (chain 1301) · **Reactive chain**: Reactive Lasna (chain 5318007)

### Verified contracts (Unichain Sepolia)

- Hook: [0xb0a98b7301772DC8328e3b8B08436C5E993d4640](https://sepolia.uniscan.xyz/address/0xb0a98b7301772DC8328e3b8B08436C5E993d4640#code)
- Vault: [0xC86b482A6F30f8B149a98Fa5B2b2a0a026cbcC9b](https://sepolia.uniscan.xyz/address/0xC86b482A6F30f8B149a98Fa5B2b2a0a026cbcC9b#code)
- Oracle: [0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff](https://sepolia.uniscan.xyz/address/0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff#code)
- PerpAdapter: [0xcaC535eef5BfdC09fB1a53086551aE5d1b90a4Af](https://sepolia.uniscan.xyz/address/0xcaC535eef5BfdC09fB1a53086551aE5d1b90a4Af#code)
- AtlasCallback: [0x725Fdf9116cd7083D7287B49f7dBB8FF7c11266D](https://sepolia.uniscan.xyz/address/0x725Fdf9116cd7083D7287B49f7dBB8FF7c11266D#code)

### Reactive Smart Contract (Lasna)

- AtlasReactive: [0xA9797768554213476B0D1E853cf9b91E7A187BF1](https://lasna.reactscan.net/address/0xA9797768554213476B0D1E853cf9b91E7A187BF1)
- End-to-end latency observed: ~15-20 seconds from Unichain `setPrice` event to `hook.lastNonce` tick.

### Chainlink ETH/USD adapter (Sepolia)

- ChainlinkOracleAdapter: [0xFd7E6Abe3347A5bC1b24C4ACbcF271Db946683f5](https://sepolia.etherscan.io/address/0xFd7E6Abe3347A5bC1b24C4ACbcF271Db946683f5#code)
- Wraps Chainlink's ETH/USD feed (`0x694AA1769357215DE4FAC081bf1f309aDC325306`) with staleness check and 1e18 normalization.
- Live read at deploy time returned $1779.83. Implements the same `IPriceOracle` interface as `MockPriceOracle`, so swapping in production is a constructor-arg change.

### AI layer

Atlas ships two AI components, both grounded in real on-chain reads.

**Hedge Confidence Score** (visible on `/compare`)
- Composite scorer that fuses four on-chain signals into a single 0-100 number:
  rolling oracle-price volatility (0.30 weight), blocks since the last RSC
  callback (0.25), vault buffer health (0.25), and signed funding rate (0.20).
- Implemented as a transparent weighted ensemble in
  [frontend/lib/confidence.ts](frontend/lib/confidence.ts). Adopted from the
  winning pattern in SwapPilot's `ai-engine` (PyTorch transformer + RF ensemble)
  but simplified for a fully auditable TypeScript implementation.
- Rendered as a semicircle gauge with per-component breakdown bars in
  [HedgeConfidenceGauge.tsx](frontend/components/HedgeConfidenceGauge.tsx).
- Trigger volatility on `/compare`, watch the confidence tier flip from HIGH to
  MEDIUM, then back to HIGH after the next Reactive callback freshens the signal.

**Ask Atlas chat** (visible on `/positions` and `/activity`)
- Edge-runtime API route at
  [app/api/atlas-chat/route.ts](frontend/app/api/atlas-chat/route.ts) streaming
  Claude Haiku 4.5 via Vercel AI Gateway.
- Every request injects a per-page Context block containing live on-chain
  reads (aLP balance, claim value, accrued yield, deposit history, recent
  events). System prompt forbids inventing numbers — every figure cited must
  come from that context.
- Built on `@ai-sdk/react useChat` with a custom `DefaultChatTransport` so the
  on-chain context flows on every turn, not just the first one.

### Test coverage

Measured by `forge coverage` on the contracts repo. Every PRD target is met or exceeded.

| Contract | Lines | Branches | Functions |
|---|---|---|---|
| `src/AtlasHook.sol` | 92.31% | 77.78% | 83.33% |
| `src/AtlasVault.sol` | 97.40% | 94.12% | 92.31% |
| `src/adapters/MockPerpAdapter.sol` | 80.46% | 70.59% | 75.00% |
| `src/mocks/MockPriceOracle.sol` | 100.00% | n/a | 100.00% |

The PRD target was 80%+ on hook and vault and 50%+ on the perp adapter. The reactive contracts (`AtlasCallback`, `AtlasReactive`, `ChainlinkOracleAdapter`) are covered by end-to-end testnet verification (hook `lastNonce` ticking proves the full loop), not by Foundry unit tests.

### Two distinct user flows

Atlas has two independent entry points for liquidity:

| Flow | UI | What happens |
|---|---|---|
| **Vault deposit** | [/deposit](https://atlas-uhi9-u148.vercel.app/deposit) | User deposits USDC into the ERC-4626 vault, receives `aLP` shares. Earns the flat per-block coupon. Buffer is funded from hook fee inflows. **No perp hedge opens.** |
| **Pool LP add** | (via Uniswap v4 PositionManager) | Liquidity provider adds WETH/USDC to the v4 pool. The Atlas hook intercepts `afterAddLiquidity`, computes the volatile-asset delta, and opens a matched perp short. **Hedge unwinds in `beforeRemoveLiquidity`.** |

The frontend demos both: `/compare` simulates the LP hedge value, `/deposit` mints real `aLP` shares against the live vault.

---

## Why Atlas

Concentrated LPs on volatile pairs lose to impermanent loss almost every market cycle. Existing IL insurance hooks are premium-based — LPs pay for protection and frequently net negative. Nobody wants insurance; they want their position to stop bleeding.

Atlas solves this by **actually hedging the position** with a real opposing instrument (a perpetual short), not by paying a recurring premium. Funding payments on the short leg, combined with swap fees, are routed through a smoothing vault that pays LPs a flat per-block APR — turning lumpy, unpredictable LP income into a fixed-yield product.

---

## How It Works (60-second version)

1. LP deposits ETH/USDC liquidity through the Atlas hook.
2. Hook opens a matched perpetual short on the volatile asset via a perp venue adapter (Hyperliquid / GMX / Unichain perps).
3. A Reactive Smart Contract watches cross-chain price divergence (CEX oracle vs. pool price) and fires rebalance callbacks whenever the hedge drifts past a configurable threshold.
4. Swap fees + funding income flow into an ERC-4626 smoothing vault that pays a flat APR to LPs.
5. On withdrawal, the perp position is unwound and the LP receives principal plus accrued smoothed yield.

---

## Documentation Map

| Document | Purpose |
|---|---|
| [PRD.md](./PRD.md) | Full product requirements document — read this first |
| [architecture.md](./architecture.md) | System diagrams, contract topology, data flow |
| [user-flow.md](./user-flow.md) | End-to-end user journeys with state transitions |
| [feature-breakdown.md](./feature-breakdown.md) | Feature specs with P0/P1/P2 priorities and acceptance criteria |
| [roadmap.md](./roadmap.md) | 3-week hackathon plan + 6-month post-hackathon roadmap |
| [tech-stack.md](./tech-stack.md) | Stack choices, alternatives considered, and rationale |

---

## Hackathon Tracks Targeted

| Track | Alignment |
|---|---|
| **UHI9 — IL & Yield Systems** (Main) | Hits 3 of 5 named sub-themes: Delta-Neutral · IL Insurance · Fee-Smoothing |
| **Reactive Network** (Sponsor) | RSC is the autonomous nervous system that triggers cross-chain rebalances |
| **Chainlink** (Adjacent) | Uses Data Feeds for ground-truth pricing and Automation as keeper fallback |
| **Unichain** (Adjacent) | Primary deployment target if Unichain native perps are live by demo day |

---

## Quickstart for Developers

```bash
# Clone
git clone https://github.com/ogazboiz/atlas-uhi9
cd atlas-uhi9/contracts

# Install Foundry deps (excluded from git)
forge install foundry-rs/forge-std --no-commit
forge install Uniswap/v4-core --no-commit
forge install Uniswap/v4-periphery --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install OpenZeppelin/uniswap-hooks --no-commit

# Set env vars
cp .env.example .env

# Build and test
forge build
forge test -vvv

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC --broadcast
```

See [tech-stack.md](./tech-stack.md) for full environment requirements.

---

## Monorepo Layout

```
.
├── README.md                  # this file
├── PRD.md                     # product requirements
├── architecture.md            # system architecture
├── user-flow.md               # user journeys
├── feature-breakdown.md       # feature specs with P0/P1/P2
├── roadmap.md                 # 3-week + post-hackathon plan
├── tech-stack.md              # stack rationale
├── contracts/                 # Solidity (Foundry)
├── frontend/                  # Next.js dashboard (planned)
└── indexer/                   # Ponder event indexer (planned)
```

Start with [contracts/README.md](./contracts/README.md) for build and deploy instructions.

---

## License

MIT (proposed). To be finalized before submission.

---

## Team

To be filled in by the submission deadline.

---

## Contact

Submission inquiries: reply to the Atrium Academy thread referencing Project ID once issued.
