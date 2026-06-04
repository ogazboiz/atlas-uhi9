# Atlas Contracts

Solidity contracts for **Atlas**, the delta-hedged LP vault hook for Uniswap v4.

See the full product spec in [../PRD.md](../PRD.md) and architecture in [../architecture.md](../architecture.md).

## Repository Layout

```
src/
├── AtlasHook.sol               # v4 hook intercepting pool lifecycle events
├── AtlasVault.sol              # ERC-4626 smoothing vault (IS the aLP token)
├── adapters/
│   ├── IPerpAdapter.sol        # Perp venue interface
│   └── MockPerpAdapter.sol     # Demo perp venue with funding simulation
├── oracles/
│   └── ChainlinkOracleAdapter.sol  # Chainlink price feed wrapper with staleness checks
└── reactive/
    └── AtlasReactive.sol       # Reactive Smart Contract for cross-chain rebalance triggering

test/
├── AtlasHook.t.sol
├── AtlasVault.t.sol
└── integration/
    └── EndToEnd.t.sol

script/
└── Deploy.s.sol                # Hook address mining + ordered deployment
```

## Build

```bash
# After cloning, install Foundry dependencies (excluded from git)
forge install foundry-rs/forge-std --no-commit
forge install Uniswap/v4-core --no-commit
forge install Uniswap/v4-periphery --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install OpenZeppelin/uniswap-hooks --no-commit

# Set env vars
cp .env.example .env  # fill in your keys

# Build and test
forge build
forge test -vvv
```

## Deploy

```bash
source .env
forge script script/Deploy.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC --broadcast
```

## Status

All contract files are scaffolded as stubs. Logic implementation is the next phase.

See [../feature-breakdown.md](../feature-breakdown.md) for the implementation order and acceptance criteria for each feature.
