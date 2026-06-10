# Atlas Contracts

Solidity contracts for **Atlas**, the delta-hedged LP vault hook for Uniswap v4.

See the full product spec in [../PRD.md](../PRD.md) and architecture in [../architecture.md](../architecture.md).

## Status

Shipped. All six contracts are deployed to Unichain Sepolia (plus one on Reactive Lasna and one on Ethereum Sepolia), source-verified on the corresponding explorers, and exercised by 61 passing Foundry tests. The cross-chain reactive loop has been observed end-to-end on testnet (`setPrice` on Unichain → `hook.lastNonce` ticks via Lasna callback in ~15-20 seconds).

See the root [README.md](../README.md#verified-contracts-unichain-sepolia) for the verified contract addresses and explorer links.

## Repository Layout

```
src/
├── AtlasHook.sol               # v4 hook intercepting pool lifecycle events
├── AtlasVault.sol              # ERC-4626 smoothing vault (IS the aLP token)
├── adapters/
│   ├── IPerpAdapter.sol        # Perp venue interface
│   └── MockPerpAdapter.sol     # Demo perp venue with funding simulation
├── oracles/
│   ├── IPriceOracle.sol        # Price oracle interface (1e18 normalized)
│   └── ChainlinkOracleAdapter.sol  # Chainlink price feed wrapper with staleness checks
├── mocks/
│   └── MockPriceOracle.sol     # Demo-controllable oracle for the live comparison page
└── reactive/
    ├── AtlasCallback.sol       # Reactive Network callback receiver on Unichain Sepolia
    └── AtlasReactive.sol       # Reactive Smart Contract deployed on Reactive Lasna

test/
├── AtlasHook.t.sol             # 92.31% line coverage on AtlasHook
├── AtlasVault.t.sol            # 97.40% line coverage on AtlasVault
└── MockPerpAdapter.t.sol       # 80.46% line coverage on MockPerpAdapter

script/
├── Deploy.s.sol                # Hook address mining + ordered deployment on Unichain Sepolia
├── InitializePool.s.sol        # Initializes the WETH/USDC v4 pool against the deployed hook
└── DeployReactive.s.sol        # Deploys AtlasCallback on Unichain + AtlasReactive on Lasna
```

The reactive contracts and `ChainlinkOracleAdapter` are validated by end-to-end testnet runs rather than Foundry unit tests. See the [coverage table](../README.md#test-coverage) in the root README for the per-contract numbers.

## Build

```bash
# After cloning, install Foundry dependencies (excluded from git)
forge install foundry-rs/forge-std --no-commit
forge install Uniswap/v4-core --no-commit
forge install Uniswap/v4-periphery --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install OpenZeppelin/uniswap-hooks --no-commit
forge install Reactive-Network/reactive-lib --no-commit

# Set env vars
cp .env.example .env  # fill in your keys

# Build and test
forge build
forge test -vvv
```

`reactive-lib` is required because `AtlasReactive.sol` and `AtlasCallback.sol` import the Reactive Network base contracts; the `reactive-lib/=lib/reactive-lib/src/` remapping in `foundry.toml` points at it.

## Deploy

```bash
source .env

# Core stack on Unichain Sepolia (hook + vault + oracle + perp adapter)
forge script script/Deploy.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC --broadcast

# Initialize the WETH/USDC v4 pool against the deployed hook
forge script script/InitializePool.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC --broadcast

# Reactive cross-chain loop: callback on Unichain + RSC on Lasna
forge script script/DeployReactive.s.sol --rpc-url $LASNA_RPC --broadcast
```

## Test coverage targets

The PRD target was 80%+ on the hook and vault and 50%+ on the perp adapter. The shipped numbers (see the root README) exceed all three.
