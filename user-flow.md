# Atlas — User Flows

| | |
|---|---|
| **Document version** | 1.0 |
| **Companion to** | [PRD.md](./PRD.md), [architecture.md](./architecture.md) |
| **Audience** | Product designers, frontend engineers, QA |

---

## Flow Index

1. [First-time LP onboarding](#flow-1-first-time-lp-onboarding)
2. [Deposit liquidity into Atlas vault](#flow-2-deposit-liquidity-into-atlas-vault)
3. [Autonomous rebalance (no user action)](#flow-3-autonomous-rebalance-no-user-action)
4. [User checks position health](#flow-4-user-checks-position-health)
5. [Withdraw position](#flow-5-withdraw-position)
6. [Emergency: buffer health degraded](#flow-6-emergency-buffer-health-degraded)
7. [Demo-day judge walkthrough](#flow-7-demo-day-judge-walkthrough)

---

## Flow 1: First-time LP onboarding

**Persona**: Sophisticated retail LP, first visit to atlas-uhi9.vercel.app

**Goal**: Understand the product and decide whether to deposit

**Trigger**: User lands on the home page via Twitter link

```
[Landing Page]
   │
   │  User reads value prop:
   │  "Earn 8% fixed APR on your ETH/USDC liquidity, hedged automatically"
   │
   │  Two CTAs:
   │   (a) "How it works" → scrolls to mechanism explainer
   │   (b) "Connect Wallet" → opens RainbowKit modal
   │
   ▼
[Wallet Connect Modal]
   │
   │  User picks MetaMask
   │  Auto-prompted to switch to Unichain Sepolia if on wrong network
   │
   ▼
[Dashboard - Empty State]
   │
   │  "You don't have any Atlas positions yet"
   │  Primary CTA: "Deposit Liquidity"
   │  Secondary: "Try the Simulator" (no commitment)
   │
   ▼
   User either commits to flow 2 or explores the simulator
```

**Designer notes:**
- Value prop must land in <5 seconds — fixed APR + IL-protected
- Wallet connect should never block content; let user explore as guest
- Simulator is the key conversion tool for skeptics

---

## Flow 2: Deposit liquidity into Atlas vault

**Persona**: Connected LP with WETH + USDC in wallet

**Goal**: Open a hedged liquidity position

**Trigger**: User clicks "Deposit Liquidity"

```
[Deposit Page]
   │
   │  Input fields:
   │   - WETH amount (with MAX button)
   │   - USDC amount (auto-calculated to match optimal ratio)
   │   - Slippage tolerance (default 0.5%)
   │
   │  Live preview panel:
   │   - Hedge size that will be opened (e.g., "Short 1.5 ETH on Mock Perp")
   │   - Estimated APR (8.0%)
   │   - Expected aLP tokens minted
   │   - Buffer health after deposit
   │
   ▼
[Approve WETH] (if needed)
   │
   │  Transaction 1: `WETH.approve(AtlasVault, amount)`
   │  Status: "Approve WETH"
   │
   ▼
[Approve USDC] (if needed)
   │
   │  Transaction 2: `USDC.approve(AtlasVault, amount)`
   │  Status: "Approve USDC"
   │
   ▼
[Deposit Transaction]
   │
   │  Transaction 3: `AtlasVault.deposit(wethAmt, usdcAmt, msg.sender)`
   │  Internal flow:
   │    1. transferFrom both tokens
   │    2. PoolManager.modifyLiquidity()
   │    3. afterAddLiquidity hook fires
   │    4. Hook computes hedge delta
   │    5. PerpAdapter.openShort()
   │    6. Vault mints aLP to LP
   │
   ▼
[Success Modal]
   │
   │  "Deposit complete"
   │  - Liquidity added: 1 ETH + 3500 USDC
   │  - Hedge opened: Short 1.5 ETH
   │  - aLP received: 7000.00 aLP
   │  - Current APR: 8.00%
   │
   │  CTAs:
   │   - "View Position" → flow 4
   │   - "Deposit More"
   │
   ▼
   Done. User is now an active LP.
```

**Edge cases:**
- Insufficient balance: disable submit button, show clear error
- Pool slippage exceeds tolerance: revert, surface "Slippage too high, try larger tolerance"
- Perp venue down: revert, surface "Hedge venue temporarily unavailable, please retry"
- User rejects any tx: return to previous step with state preserved

**Designer notes:**
- The "hedge preview" panel is the trust-builder — show the math
- All 3 transactions should be batchable via EIP-5792 (post-MVP)
- For MVP, show clear "Transaction X of 3" indicator

---

## Flow 3: Autonomous rebalance (no user action)

**Persona**: LP with an active position, not currently using the app

**Goal**: Position hedge stays accurate as price moves

**Trigger**: ETH price moves enough that the on-chain hedge drifts from target delta

This flow has **no user interaction** — it's the core autonomous value prop.

```
[Background: Chainlink ETH/USD feed updates on Sepolia]
   │
   │  New price: $3,420 → $3,395 (sudden 0.7% move)
   │
   ▼
[AtlasReactive RSC on Reactive Network]
   │
   │  RSC subscribed to price feed event
   │  Reads current pool price via cross-chain query
   │  Computes divergence: 0.7% = 70bps
   │
   │  Threshold check: 70bps > 30bps threshold → trigger rebalance
   │
   ▼
[RSC fires callback to Unichain Sepolia]
   │
   │  Callback payload:
   │   - poolId: 0xabc...
   │   - deltaSize: +0.12 ETH (increase short)
   │   - nonce: 47
   │   - deadline: block + 20
   │
   ▼
[AtlasHook.rebalanceCallback() executes]
   │
   │  - Verifies msg.sender == registered RSC
   │  - Verifies nonce > lastNonce
   │  - Verifies deadline not passed
   │  - Caps delta if > 20% of position (sanity check)
   │
   │  Calls PerpAdapter.resizeShort(+0.12 ETH)
   │
   ▼
[PerpAdapter executes resize]
   │
   │  MockPerpAdapter: updates position in-contract
   │  HyperliquidAdapter (prod): submits order via signed message
   │
   ▼
[Event: HedgeResized emitted]
   │
   │  Indexed by Ponder → live event feed updates in any open Atlas tab
```

**User experience:**
- If the user has Atlas open in a browser tab, the "Activity" feed shows a new event within ~30s
- A subtle toast notification: "Your position was rebalanced (+0.12 ETH short)"
- The hedge PnL chart updates with the new line

**Designer notes:**
- Make the autonomy *visible* — judges should be able to see the RSC firing on the dashboard
- Activity feed is the killer demo feature — it proves Reactive Network is doing real work

---

## Flow 4: User checks position health

**Persona**: LP with an active position, checking in

**Goal**: Confirm position is healthy and earning as expected

**Trigger**: User opens the app

```
[Dashboard]
   │
   │  Top-line metrics:
   │   - Total Deposited: $7,000
   │   - Current Value: $7,094.50 (+1.35%)
   │   - Estimated APR: 8.00% (smoothed)
   │   - aLP Balance: 7,000.00
   │
   │  Position list (one card per position):
   │   ┌─────────────────────────────────────────┐
   │   │  ETH/USDC Position #47                  │
   │   │  Deposited: 1 ETH + 3,500 USDC          │
   │   │  Hedge: Short 1.62 ETH (resized 2x)     │
   │   │  Accrued yield: $94.50                  │
   │   │  [View Details]    [Withdraw]           │
   │   └─────────────────────────────────────────┘
   │
   ▼
[Position Detail Page]
   │
   │  Tabs:
   │   - Overview: live PnL chart, hedged vs unhedged
   │   - Activity: full event history (deposits, resizes, fees)
   │   - Math: transparent calculation of current value
   │
   │  Charts (TradingView Lightweight Charts):
   │   - Dual-line: Atlas position value vs. unhedged baseline
   │   - Hedge size over time
   │   - APR over time (smoothed line)
   │
   │  Health indicators:
   │   - Vault buffer health: 1.23x (Healthy)
   │   - Last rebalance: 2 min ago
   │   - Rebalances in last 24h: 4
```

**Designer notes:**
- The hedged-vs-unhedged chart is the centerpiece — needs to be beautiful
- Use clear color coding: Atlas in brand green, baseline in muted gray
- Annotate rebalance events as markers on the timeline

---

## Flow 5: Withdraw position

**Persona**: LP ready to exit

**Goal**: Get principal + accrued yield back, fully

**Trigger**: User clicks "Withdraw" on a position

```
[Withdraw Modal]
   │
   │  Input: amount to withdraw (slider 0-100% of position)
   │
   │  Preview:
   │   - WETH returned: 0.97
   │   - USDC returned: 3,580
   │   - Total value: $7,094 (vs $7,000 deposited)
   │   - Net yield: $94 (+1.35% in 14 days = ~35% APR equivalent)
   │   - Hedge to close: 1.62 ETH short
   │
   │  ⚠ "Withdrawing will close the hedge. Slippage tolerance: 1%"
   │
   ▼
[Withdraw Transaction]
   │
   │  `AtlasVault.withdraw(shares, msg.sender)`
   │  Internal flow:
   │    1. Update exchange rate (apply accrued coupon)
   │    2. PerpAdapter.closeShort(proportional amount)
   │    3. PoolManager.modifyLiquidity(-liquidity)
   │    4. Transfer WETH + USDC to LP
   │    5. Burn aLP tokens
   │
   ▼
[Success Modal]
   │
   │  "Withdrawal complete"
   │  - Received: 0.97 WETH + 3,580 USDC
   │  - Net yield: +$94 (+1.35%)
   │  - Hedge closed cleanly
   │
   │  CTAs:
   │   - "Deposit Again"
   │   - "View Transaction"
```

**Edge cases:**
- Perp closure slippage > tolerance: revert with clear error, suggest reducing withdrawal amount or accepting wider slippage
- Vault buffer drained: withdrawals still process (LP principal is independent of buffer); only future coupon may be reduced
- Partial withdrawals work the same way, proportional to shares burned

---

## Flow 6: Emergency: buffer health degraded

**Persona**: All LPs in the vault

**Goal**: Make the situation transparent; preserve LP principal

**Trigger**: Vault buffer falls below 0.5x of forward coupon obligation

```
[Automatic on-chain action]
   │
   │  AtlasVault detects bufferHealth() < 0.5
   │  - Emits BufferLow event
   │  - Pauses new deposits (existing positions unaffected)
   │  - Reduces couponBps by 50% (from 800bps to 400bps)
   │
   ▼
[Frontend reacts within 30s of event]
   │
   │  Banner appears on all pages:
   │  ⚠ "Vault buffer is low. New deposits paused.
   │      Coupon rate temporarily reduced to 4% APR.
   │      Existing positions remain healthy."
   │
   │  Buffer health gauge turns yellow
   │  APR chart shows the step-down clearly
   │
   ▼
[Optional: notification to LPs]
   │
   │  Post-MVP: Discord/Telegram webhook fires
   │  LP gets DM: "Atlas vault buffer notification — your principal is safe,
   │  yield rate adjusted. Details: <link>"
   │
   ▼
[Recovery]
   │
   │  As perp funding income flows in, buffer rebuilds
   │  When bufferHealth > 1.0, deposits re-enable
   │  When bufferHealth > 1.5, coupon rate restored
```

**Designer notes:**
- The transparency is the trust play — competitors hide reserves, Atlas shows them
- The banner copy should be calm and informative, not alarming
- This flow will likely never trigger in the demo, but document and visualize so judges see the safety mechanism

---

## Flow 7: Demo-day judge walkthrough

**Persona**: Hackathon judge, 3 minutes of attention

**Goal**: Understand the product, see it working, want to learn more

**Trigger**: Demo URL handed over with the submission

This is the **single most important flow for hackathon outcomes**.

```
[Judge opens atlas-uhi9.vercel.app]
   │
   │  Sees a clean landing page with:
   │   - Headline: "Hedged LP yields. Autonomous. Fixed APR."
   │   - Subhead: "Built for UHI9 + Reactive Network"
   │   - Single button: "Watch the Live Demo"
   │
   ▼
[Live Demo Page]
   │
   │  Pre-seeded demo state:
   │   - 3 active demo positions ($1K, $10K, $50K)
   │   - 24h of historical data visible
   │   - Last rebalance: 1 min ago (live)
   │
   │  Centerpiece chart (top of page):
   │   - Atlas position value (green) vs. unhedged baseline (gray)
   │   - Last 24h shows ~5% gap in Atlas's favor
   │
   │  Right sidebar: Reactive Network event feed (live)
   │   - New events stream in every 1-5 minutes
   │   - Each event shows: divergence detected, rebalance fired, hedge updated
   │
   │  Big red button (top right):
   │   "💥 Trigger Volatility Event"
   │
   ▼
[Judge clicks the button]
   │
   │  Backend script fires a large swap, causing pool price to diverge from oracle
   │
   │  Within ~30 seconds:
   │   1. Oracle reflects new price (Chainlink update)
   │   2. RSC detects divergence (event feed shows: "Divergence 150bps detected")
   │   3. RSC fires callback (event feed shows: "Callback dispatched to Unichain")
   │   4. Hook resizes hedge (event feed shows: "Hedge resized +0.5 ETH")
   │   5. Chart updates: Atlas line stays flat, baseline drops
   │
   ▼
[Judge sees the system work end-to-end]
   │
   │  "Try Yourself" CTA below:
   │   - Pre-funded testnet wallet (faucet link)
   │   - Step-by-step guided deposit
```

**Designer notes:**
- The "Trigger Volatility Event" button is unconventional but essential — judges won't wait for organic volatility
- The event feed must look live and credible (real RSC events, not faked)
- Total time from button-click to visible outcome: target <30s, max 60s
- Have a backup pre-recorded video in case the live demo fails

---

## Cross-flow design principles

1. **Autonomy must be visible.** Every Reactive callback should be surfaced in the activity feed. The whole point of using RSCs is autonomous behavior; if it's invisible, it might as well not exist.
2. **The hedge math should be inspectable.** Always show "you have this much liquidity, this much hedge, this much accrued yield" in raw numbers. Trust scales with transparency.
3. **No surprise reverts.** Every potential revert path should have a pre-flight check in the UI that prevents the submission rather than letting the user pay gas to fail.
4. **Optimistic UI for confirmed actions.** As soon as a transaction is submitted, show the projected outcome with a "pending" badge. Confirm or revert on receipt.
5. **The demo loop is the product.** Every design choice should ask: "Does this make the 60-second demo more compelling?"
