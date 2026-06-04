# Atlas

**Delta-Hedged LP Vault Hook for Uniswap v4**

Atlas is a Uniswap v4 hook that pairs every LP deposit with an automatic, autonomously-rebalanced perpetual short position, transforming impermanent loss into hedged, smoothed yield. Cross-chain rebalancing is driven by Reactive Smart Contracts (RSCs) on the Reactive Network.

> Submission for the **UHI9 Hookathon** — Track: *Impermanent Loss & Yield Systems* — Sponsor: *Reactive Network*

## Live

- **Demo**: https://atlas-uhi9-u148.vercel.app
- **Comparison chart**: https://atlas-uhi9-u148.vercel.app/compare
- **Network**: Unichain Sepolia (chain 1301)
- **Hook**: [0x6eA1Ad75D4904069523d29BA7d77C398262b4640](https://sepolia.uniscan.xyz/address/0x6eA1Ad75D4904069523d29BA7d77C398262b4640)
- **Vault**: [0x2d04a51EE6a19772691675205274B8516F2C5941](https://sepolia.uniscan.xyz/address/0x2d04a51EE6a19772691675205274B8516F2C5941)

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
