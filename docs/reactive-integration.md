# Reactive Network Integration

Atlas's hedge rebalancing is driven by an autonomous Reactive Smart Contract (RSC) on Reactive Lasna that subscribes to oracle events on Unichain Sepolia and fires cross-chain callbacks back into the hook.

This document is for judges, auditors, and contributors who want to verify the integration without running the code.

## Deployed addresses

| Component | Chain | Address | Explorer |
|---|---|---|---|
| AtlasReactive (RSC) | Lasna (5318007) | `0xA9797768554213476B0D1E853cf9b91E7A187BF1` | [reactscan](https://lasna.reactscan.net/address/0xA9797768554213476B0D1E853cf9b91E7A187BF1) |
| AtlasCallback (sink) | Unichain Sepolia (1301) | `0x725Fdf9116cd7083D7287B49f7dBB8FF7c11266D` | [uniscan](https://sepolia.uniscan.xyz/address/0x725Fdf9116cd7083D7287B49f7dBB8FF7c11266D#code) |
| AtlasHook (target) | Unichain Sepolia (1301) | `0xb0a98b7301772DC8328e3b8B08436C5E993d4640` | [uniscan](https://sepolia.uniscan.xyz/address/0xb0a98b7301772DC8328e3b8B08436C5E993d4640#code) |
| MockPriceOracle (origin) | Unichain Sepolia (1301) | `0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff` | [uniscan](https://sepolia.uniscan.xyz/address/0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff#code) |
| Reactive callback proxy | Unichain Sepolia (1301) | `0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4` | (Reactive Network official) |

All contracts on Unichain Sepolia are source-verified on Uniscan via Etherscan V2 multichain API.

## Subscriptions

The RSC subscribes to a single filter, verifiable via `rnk_getFilters`:

| Field | Value |
|---|---|
| Filter Uid | (rotates after redeploy; query via RPC) |
| Origin chainId | `1301` (Unichain Sepolia) |
| Origin contract | `0x686502d452F3F47fD804fbdec778Dcd4cA7971Ff` (MockPriceOracle) |
| Topic 0 | `0x945c1c4e99aa89f648fbfe3df471b916f719e16d960fcec0737d4d56bd696838` |
| Event signature | `PriceUpdated(uint256 oldPrice, uint256 newPrice)` |
| Topics 1-3 | `REACTIVE_IGNORE` |

Verify yourself:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"rnk_getFilters","params":[],"id":1}' \
  https://lasna-rpc.rnk.dev/ | jq '.result[] | select(.Contract=="0x686502d452f3f47fd804fbdec778dcd4ca7971ff")'
```

## End-to-end flow

```
User on Unichain Sepolia
   ↓ cast send oracle.setPrice(newPrice)
PriceUpdated(oldPrice, newPrice) event emitted on Unichain Sepolia
   ↓ (Lasna indexer picks it up)
AtlasReactive.react(LogRecord) executes inside RVM on Lasna
   ↓ computes |newPrice - oldPrice| / oldPrice in bps
   ↓ if divergence > threshold:
   ↓     callbackNonce += 1
   ↓     emit Callback(1301, callbackAddr, 500_000 gas, payload)
Reactive Network relayer picks up the Callback event
   ↓ submits tx on Unichain Sepolia from a privileged relayer
Reactive callback proxy (0x9299...) calls AtlasCallback
   ↓ AtlasCallback.rebalanceHedge(rvm_id, poolId, deltaSize, nonce, deadline)
   ↓ rvmIdOnly modifier validates rvm_id == deployer
   ↓ try { HOOK.rebalanceFromReactive(poolId, delta, nonce, deadline) }
AtlasHook applies validation:
   ↓ msg.sender == reactiveCallback?    yes (set via setReactiveCallback)
   ↓ nonce > lastNonce?                 yes (monotonic)
   ↓ block.timestamp <= deadline?       yes (10-min RSC default)
   ↓ apply 20% per-call delta cap
   ↓ PERP_ADAPTER.resizeShort(...)
   ↓ hook.lastNonce = nonce
RebalanceCallbackReceived event emitted on Unichain Sepolia
   ↓ frontend ReactiveEventFeed.tsx picks it up via wagmi watchContractEvent
```

## Observed latency

The reactive loop has been verified end-to-end on testnet:

| Setpoint | Observed |
|---|---|
| `setPrice` mined on Unichain Sepolia | `t = 0` |
| `react()` triggered on Lasna RVM | `t + ~5-8s` |
| Callback relayed to Unichain Sepolia | `t + ~12-18s` |
| `hook.lastNonce` incremented | `t + ~15-20s` |

Two consecutive triggers landed cleanly:

```
[19:08:46] setPrice tx 0x402f828b...   →  Hook=1 by 19:09:01
[19:10:16] setPrice tx 0x0c3d96bb...   →  Hook=2 by 19:10:36
```

## Pattern adoption from prior winners

This integration was built after surveying three Hookathon-winning Reactive integrations: PerpHinge, SwapPilot, and vfa-hooks. Patterns adopted:

| Pattern | Source | Where in Atlas |
|---|---|---|
| `if (!vm)` guard around `service.subscribe` in constructor | All three | We went further: full `initSubscriptions()` as a separate call so the contract is funded before paying the subscribe fee (vfa-hooks pattern, more robust) |
| `AbstractCallback` + `rvmIdOnly` modifier | PerpHinge `PerpHingeCallback.sol:19` | `AtlasCallback.rebalanceHedge` |
| Primitive-arg callback payload (no encoded struct) | PerpHinge | `rebalanceHedge(address, bytes32, int256, uint256, uint256)` |
| try/catch around hook forward to keep RVM pipeline healthy | PerpHinge variant | `AtlasCallback.rebalanceHedge` swallows hook reverts so a single bad nonce doesn't brick subscription processing |
| Two-phase deploy script (callback first, RSC second) | PerpHinge `01_DeployReactive.s.sol` | `script/DeployReactive.s.sol` with `DEPLOY_PHASE=callback\|reactive` |
| Live Reactive status panel in the frontend | PerpHinge `ReactiveStatus.tsx` | `frontend/components/ReactiveStatus.tsx` + live event feed |

## Debugging field guide

If `react()` does not fire on a verified subscription:

| Symptom | Most likely cause | Fix |
|---|---|---|
| `rnk_getFilters` shows `Active: true` but no react() | RSC has zero balance or unpaid debt | Fund the RSC with REACT and call `coverDebt()` |
| Callback tx lands but hook reverts with empty data | Hook's deployed bytecode predates the function selector being called | Redeploy hook with current source; verify with `cast code` vs `forge inspect deployedBytecode` |
| Callback tx never lands despite react() firing | Callback contract on destination chain has zero balance or unpaid debt | Fund AtlasCallback with native gas token + call `coverDebt()` |
| Empty revert in trace inspector | Source not verified | Verify via `forge verify-contract --etherscan-api-key ... --verifier-url https://api.etherscan.io/v2/api?chainid=1301` |

## How to redeploy

```bash
cd contracts
source .env

# 1. Redeploy pool-chain contracts (uses Deploy.s.sol)
forge script script/Deploy.s.sol --rpc-url https://unichain-sepolia-rpc.publicnode.com --broadcast

# 2. Initialize the pool with the new hook
forge script script/InitializePool.s.sol --rpc-url https://unichain-sepolia-rpc.publicnode.com --broadcast

# 3. Deploy callback (phase 1)
DEPLOY_PHASE=callback forge script script/DeployReactive.s.sol --rpc-url https://unichain-sepolia-rpc.publicnode.com --broadcast

# 4. Compute the new poolId
cast keccak $(cast abi-encode "f(address,address,uint24,int24,address)" $USDC $WETH 3000 60 $HOOK)

# 5. Deploy RSC on Lasna (via forge create — script simulation reverts on the subscribe precompile)
forge create src/reactive/AtlasReactive.sol:AtlasReactive \
  --rpc-url https://lasna-rpc.rnk.dev/ \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --gas-limit 1500000 \
  --broadcast \
  --constructor-args <ORACLE> <CALLBACK> <POOL_ID> 0

# 6. Subscribe + fund both sides
cast send <RSC> "initSubscriptions()" --rpc-url https://lasna-rpc.rnk.dev/ --private-key $DEPLOYER_PRIVATE_KEY
cast send <RSC> --value 0.5ether --rpc-url https://lasna-rpc.rnk.dev/ --private-key $DEPLOYER_PRIVATE_KEY
cast send <CALLBACK> --value 0.02ether --rpc-url https://unichain-sepolia-rpc.publicnode.com --private-key $DEPLOYER_PRIVATE_KEY
```

`request(address)` on the Sepolia faucet (`0x9b9BB25f1A81078C544C829c5EB7822d747Cf434`) gives 100 lREACT per 1 Sepolia ETH if you need to top up.
