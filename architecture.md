# Atlas — Technical Architecture

| | |
|---|---|
| **Document version** | 1.0 |
| **Companion to** | [PRD.md](./PRD.md) |
| **Audience** | Solidity engineers, frontend engineers, infrastructure engineers |

---

## 1. System Overview

Atlas is a multi-chain protocol composed of three logical environments:

1. **Pool chain** (Unichain Sepolia for hackathon) — where the Uniswap v4 pool, hook, vault, and perp adapter live
2. **Reactive Network** — where the autonomous rebalance-trigger logic lives
3. **Off-chain plane** — indexer, frontend, and (optionally) keeper fallback

The protocol is designed so the off-chain plane is purely a UX/observability layer; the protocol is *fully autonomous* without any centralized service.

---

## 2. Architecture Diagram (Detailed)

```
                          ┌─────────────────────────────────┐
                          │       Reactive Network          │
                          │                                 │
                          │   ┌──────────────────────────┐  │
                          │   │  AtlasReactive (RSC)     │  │
                          │   │                          │  │
                          │   │  - subscribes to:        │  │
                          │   │    * Chainlink ETH/USD   │  │
                          │   │    * Pool Swap events    │  │
                          │   │                          │  │
                          │   │  - computes:             │  │
                          │   │    divergence_bps =      │  │
                          │   │    |oracle - pool|/oracle│  │
                          │   │                          │  │
                          │   │  - emits callback when:  │  │
                          │   │    divergence > threshold│  │
                          │   └────────────┬─────────────┘  │
                          └────────────────┼────────────────┘
                                           │
                              callback message (cross-chain)
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Unichain Sepolia (Pool Chain)                  │
│                                                                      │
│  ┌────────────────┐         ┌─────────────────────────────────┐      │
│  │ PoolManager    │◀────────│  AtlasHook                      │      │
│  │ (Uniswap v4)   │  hook   │                                 │      │
│  │                │  calls  │  - afterAddLiquidity            │      │
│  └────────┬───────┘         │  - beforeRemoveLiquidity        │      │
│           │                 │  - afterSwap                    │      │
│           │ swap events     │  - rebalanceCallback (from RSC) │      │
│           │                 └──────┬──────────────────────────┘      │
│           ▼                        │                                 │
│  ┌────────────────┐                ▼                                 │
│  │ ETH/USDC Pool  │      ┌──────────────────────────┐                │
│  │ (v4 pool)      │      │  PerpAdapter             │                │
│  └────────────────┘      │  (interface)             │                │
│                          │                          │                │
│                          │  ┌────────────────────┐  │                │
│                          │  │ MockPerpAdapter    │  │                │
│                          │  │ (hackathon demo)   │  │                │
│                          │  └────────────────────┘  │                │
│                          │                          │                │
│                          │  ┌────────────────────┐  │                │
│                          │  │ HyperliquidAdapter │  │                │
│                          │  │ (production)       │  │                │
│                          │  └────────────────────┘  │                │
│                          └──────────────────────────┘                │
│                                    │                                 │
│                                    │ fees + funding income           │
│                                    ▼                                 │
│                          ┌──────────────────────────┐                │
│                          │  AtlasVault              │                │
│                          │  (ERC-4626)              │                │
│                          │                          │                │
│                          │  - deposit / withdraw    │                │
│                          │  - accrueCoupon()        │                │
│                          │  - bufferHealth()        │                │
│                          └──────────┬───────────────┘                │
│                                     │ mints/burns                    │
│                                     ▼                                │
│                          ┌──────────────────────────┐                │
│                          │  aLP-WETH-USDC           │                │
│                          │  (ERC-20 receipt)        │                │
│                          └──────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ all events
                                     ▼
                          ┌──────────────────────────┐
                          │  Ponder Indexer          │
                          │  (TypeScript)            │
                          │                          │
                          │  - GraphQL API           │
                          │  - Historical analytics  │
                          └──────────┬───────────────┘
                                     │ queries
                                     ▼
                          ┌──────────────────────────┐
                          │  Next.js Frontend        │
                          │  (Atlas Dashboard)       │
                          │                          │
                          │  - Deposit/Withdraw UI   │
                          │  - Hedge PnL chart       │
                          │  - Vault health gauge    │
                          │  - Live RSC event feed   │
                          └──────────────────────────┘
```

---

## 3. Contract Topology

### 3.1 Contract list

| Contract | Chain | Purpose | Upgradable |
|---|---|---|---|
| `AtlasHook` | Unichain Sepolia | v4 hook intercepting pool events | No (hook address encodes permissions) |
| `AtlasVault` | Unichain Sepolia | ERC-4626 vault, coupon accrual | No for hackathon; UUPS in prod |
| `aLP` | Unichain Sepolia | ERC-20 receipt token | No |
| `PerpAdapter` (interface) | Unichain Sepolia | Abstract perp venue | N/A |
| `MockPerpAdapter` | Unichain Sepolia | Demo perp implementation | No |
| `HyperliquidAdapter` | Unichain mainnet (prod) | Production perp venue | Roadmap |
| `AtlasReactive` | Reactive Network | RSC for cross-chain rebalance | Per RN conventions |
| `ChainlinkOracleAdapter` | Unichain Sepolia | Wraps Chainlink feed with staleness checks | No |

### 3.2 Contract sizes (estimated)

| Contract | Estimated LOC | Estimated bytecode |
|---|---|---|
| AtlasHook | ~400 | ~8 KB |
| AtlasVault | ~300 | ~6 KB |
| MockPerpAdapter | ~250 | ~5 KB |
| AtlasReactive | ~150 | ~3 KB |
| Total core | ~1100 | ~22 KB |

All contracts stay well under the 24KB deployment limit.

---

## 4. Data Flow — User Actions

### 4.1 Deposit flow

```
LP                  AtlasVault             AtlasHook            PerpAdapter           PoolManager
 │                       │                      │                    │                     │
 │  deposit(amt0,amt1)   │                      │                    │                     │
 ├──────────────────────▶│                      │                    │                     │
 │                       │ transferFrom(LP)     │                    │                     │
 │                       │                      │                    │                     │
 │                       │  modifyLiquidity()                                              │
 │                       ├─────────────────────────────────────────────────────────────────▶│
 │                       │                      │                    │                     │
 │                       │                      │  afterAddLiquidity()                     │
 │                       │                      │◀────────────────────────────────────────│
 │                       │                      │                    │                     │
 │                       │                      │ computeDelta()     │                     │
 │                       │                      │                    │                     │
 │                       │                      │  openShort(delta)  │                     │
 │                       │                      ├───────────────────▶│                     │
 │                       │                      │                    │                     │
 │                       │                      │  hedgeOpened       │                     │
 │                       │                      │◀───────────────────│                     │
 │                       │                      │                    │                     │
 │                       │  mintShares(LP)      │                    │                     │
 │                       │                      │                    │                     │
 │   aLP tokens          │                      │                    │                     │
 │◀──────────────────────│                      │                    │                     │
 │                       │                      │                    │                     │
```

### 4.2 Reactive rebalance flow

```
Chainlink           AtlasReactive (RSC)        AtlasHook              PerpAdapter
   │                       │                       │                       │
   │ price update          │                       │                       │
   ├──────────────────────▶│                       │                       │
   │                       │ getPoolPrice()        │                       │
   │                       ├──────────────────────▶│                       │
   │                       │                       │                       │
   │                       │  pool price           │                       │
   │                       │◀──────────────────────│                       │
   │                       │                       │                       │
   │                       │ compute divergence    │                       │
   │                       │                       │                       │
   │                       │ if (div > threshold): │                       │
   │                       │                       │                       │
   │                       │ rebalanceCallback()                           │
   │                       ├──────────────────────▶│                       │
   │                       │                       │                       │
   │                       │                       │ resizeShort(delta)    │
   │                       │                       ├──────────────────────▶│
   │                       │                       │                       │
   │                       │                       │ hedgeResized          │
   │                       │                       │◀──────────────────────│
   │                       │                       │                       │
   │                       │                       │ emit HedgeResized     │
   │                       │                       │  (indexed by Ponder)  │
```

### 4.3 Coupon accrual (lazy)

Coupon accrual is **pull-based, not push-based** — meaning the vault doesn't accrue every block proactively. Instead, the `aLP` token's exchange rate is computed lazily on each `deposit`/`withdraw`/`previewRedeem` call using:

```
exchangeRate(t) = lastExchangeRate * (1 + couponBps/10000 * blocksSinceLastUpdate / blocksPerYear)
```

This keeps gas cost zero for idle periods. The actual asset rebalancing within the vault happens only on inflow/outflow events.

### 4.4 Withdrawal flow

```
LP                  AtlasVault             AtlasHook            PerpAdapter
 │                       │                      │                    │
 │  withdraw(shares)     │                      │                    │
 ├──────────────────────▶│                      │                    │
 │                       │ updateExchangeRate() │                    │
 │                       │                      │                    │
 │                       │ closeShortShare()    │                    │
 │                       │                      │                    │
 │                       │                      │ closeShort(amt)    │
 │                       │                      ├───────────────────▶│
 │                       │                      │                    │
 │                       │                      │ hedgeClosedShare   │
 │                       │                      │◀───────────────────│
 │                       │                      │                    │
 │                       │ removeLiquidity()    │                    │
 │                       │ burnShares()         │                    │
 │                       │ transfer(LP)         │                    │
 │                       │                      │                    │
 │  WETH + USDC          │                      │                    │
 │◀──────────────────────│                      │                    │
```

---

## 5. Cross-Chain Message Flow

### 5.1 Reactive Network → Pool Chain

Atlas's only cross-chain dependency is the RSC's callback into `AtlasHook.rebalanceCallback()`. The message contains:

```solidity
struct RebalanceCallback {
    bytes32 poolId;
    int256 deltaSize;      // signed: positive = increase short, negative = decrease
    uint256 nonce;         // anti-replay
    uint256 deadline;      // expires after N blocks
}
```

The `AtlasHook` verifies:
- The `msg.sender` matches the registered RSC address
- The `nonce` is monotonically increasing
- The `deadline` has not passed
- The `deltaSize` is within the bounded rebalance limit (no more than 20% of position per call)

### 5.2 Failure modes for cross-chain messages

| Failure | Detection | Response |
|---|---|---|
| RSC down | No callback received within 5 min after divergence threshold | Chainlink Automation fallback fires (lower-frequency keeper) |
| Reactive Network congestion | Callback received but stale (`deadline` expired) | Hook rejects the callback; RSC retries with fresh nonce |
| Malicious RSC compromise | Unrealistic `deltaSize` (> 20%) | Hook caps at limit; emits `RebalanceCapped` event |
| Replay attack | Reused nonce | Hook rejects with `NonceUsed` error |

---

## 6. State Management

### 6.1 Per-position state (stored in `AtlasHook`)

```solidity
struct Position {
    address owner;
    uint256 liquidity;          // v4 liquidity units
    int24 tickLower;
    int24 tickUpper;
    uint256 hedgeSize;          // current perp short size in volatile asset units
    uint256 lastRebalanceBlock;
    uint256 nonce;              // for RSC callback ordering
}

mapping(bytes32 positionId => Position) public positions;
```

### 6.2 Per-vault state (stored in `AtlasVault`)

```solidity
struct VaultState {
    uint256 totalAssets;        // total managed assets (in USDC-equivalent)
    uint256 totalShares;        // total aLP supply
    uint256 lastExchangeRate;   // last computed rate (1e18 = 1.0)
    uint256 lastUpdateBlock;
    uint256 bufferAmount;       // excess yield held as reserve
    uint256 couponBps;          // current coupon rate
    uint256 trailingInflowAvg;  // 10-day moving average
}
```

### 6.3 Per-RSC state (stored on Reactive Network)

```solidity
struct ReactiveState {
    uint256 rebalanceThresholdBps;
    uint256 cooldownBlocks;
    uint256 lastTriggerBlock;
    address poolChainHook;
    address oracleAddress;
}
```

---

## 7. Event Schema (for Subgraph)

```solidity
event Deposit(address indexed lp, uint256 amount0, uint256 amount1, uint256 shares);
event Withdraw(address indexed lp, uint256 shares, uint256 amount0, uint256 amount1);
event HedgeOpened(bytes32 indexed positionId, uint256 size, uint256 collateral);
event HedgeResized(bytes32 indexed positionId, int256 delta, uint256 newSize);
event HedgeClosed(bytes32 indexed positionId, uint256 finalPnl);
event CouponAccrued(uint256 amount, uint256 newExchangeRate);
event BufferLow(uint256 currentHealth, uint256 targetHealth);
event CouponReduced(uint256 oldBps, uint256 newBps, string reason);
event RebalanceCallback(bytes32 indexed poolId, int256 delta, uint256 nonce);
event RebalanceCapped(bytes32 indexed poolId, int256 requested, int256 applied);
```

Ponder indexes all events into Postgres tables and exposes a GraphQL endpoint.

---

## 8. Frontend Architecture

### 8.1 Page structure (Next.js App Router)

```
app/
├── page.tsx                    # Landing — value prop + "Get Started"
├── deposit/page.tsx            # Deposit UI with pre-flight hedge preview
├── positions/page.tsx          # User's active positions
├── positions/[id]/page.tsx     # Single-position detail + history
├── compare/page.tsx            # Hedged-vs-unhedged simulation (demo centerpiece)
├── activity/page.tsx           # Live event feed (Reactive callbacks visible here)
└── api/
    ├── simulate/route.ts       # POST: run hedge simulation
    └── metrics/route.ts        # GET: vault metrics for charts
```

### 8.2 Key components

- `<DepositForm />` — amount inputs, slippage controls, hedge preview
- `<PositionCard />` — single-position display: liquidity, hedge size, accrued yield
- `<ComparisonChart />` — dual-line chart, hedged vs. unhedged (TradingView Lightweight Charts)
- `<BufferGauge />` — radial progress showing vault buffer health
- `<ReactiveEventFeed />` — live stream of RSC callbacks (websocket to Ponder)

### 8.3 Wallet integration

- RainbowKit + wagmi v2
- Supported wallets: MetaMask, Rabby, WalletConnect, Coinbase Wallet
- Default network: Unichain Sepolia; auto-prompt to switch

---

## 9. Indexer Architecture (Ponder)

### 9.1 Why Ponder over The Graph

| Criterion | Ponder | The Graph |
|---|---|---|
| Local dev experience | TypeScript, hot reload | YAML + AssemblyScript |
| Indexing speed | Fast (native Postgres) | Slow (hosted service queue) |
| Cost | Self-host on Railway ($5-20/mo) | Hosted free tier, paid prod |
| Cross-chain support | Native | Possible but cumbersome |

Ponder selected for hackathon velocity.

### 9.2 Schema (simplified)

```typescript
{
  positions: { id, owner, poolId, liquidity, hedgeSize, createdAt, ... },
  hedgeEvents: { id, positionId, eventType, delta, timestamp, ... },
  vaultMetrics: { id (per block), totalAssets, bufferHealth, couponBps, ... },
  rebalanceCallbacks: { id, nonce, divergenceBps, triggeredAt, ... }
}
```

---

## 10. Deployment Architecture

### 10.1 Environments

| Env | Pool chain | Reactive | Frontend |
|---|---|---|---|
| **Local** | Anvil fork of Unichain Sepolia | Local mock RSC | localhost:3000 |
| **Demo** | Unichain Sepolia | Reactive Network testnet | atlas-uhi9.vercel.app |
| **Production** | Unichain mainnet | Reactive Network mainnet | atlas.xyz (TBD) |

### 10.2 Deployment script ordering (Foundry)

1. Mine `AtlasHook` address with required permission bits
2. Deploy `MockPerpAdapter`
3. Deploy `ChainlinkOracleAdapter`
4. Deploy `aLP` token
5. Deploy `AtlasVault` (configured with `aLP` address)
6. Deploy `AtlasHook` (configured with vault, adapter, oracle addresses)
7. Initialize pool with `AtlasHook` registered
8. Deploy `AtlasReactive` on Reactive Network, configured with hook address

A single `forge script Deploy.s.sol --broadcast` handles steps 1-7. RSC deployment is a separate command per Reactive Network conventions.

---

## 11. Operational Considerations

### 11.1 Monitoring (for demo week)

- Vercel Analytics on frontend
- Ponder logs streamed to a public Discord channel via webhook
- A "demo health" page showing: latest block, latest RSC callback timestamp, vault TVL, last 10 events

### 11.2 Demo data seeding

To ensure the demo has visible activity:
- Pre-seed 3 demo LP positions of different sizes
- Run a scripted "volatility generator" that performs swaps every 30 seconds to keep the pool active
- Include a "Trigger Volatility Event" button on the demo dashboard that fires a large swap, causing the divergence to spike and the RSC to fire visibly

---

## 12. Open Architecture Questions

1. Should the perp adapter live on the same chain as the hook, or on a dedicated perp chain (Arbitrum for GMX, dedicated chain for Hyperliquid)? *(Recommendation: same chain for MVP via Mock; cross-chain perp via additional Reactive callback in production.)*
2. Should `aLP` tokens be tied to a specific position (NFT-like) or fungible across all positions in a pool? *(Recommendation: fungible — simpler, more composable, easier to integrate as collateral.)*
3. How is the rebalance threshold tuned? *(Recommendation: start at 30bps; expose as a governance parameter post-MVP.)*
