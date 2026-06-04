# UHI9 Hookathon Submissions

This repository contains submissions for the **UHI9 Uniswap Hookathon**.

## Projects

| Project | Status | Description |
|---|---|---|
| [atlas/](./atlas/) | Active | Delta-hedged LP vault hook with autonomous cross-chain rebalancing via Reactive Network |

Each project folder is a self-contained monorepo with its own contracts, frontend, indexer, and documentation.

## Layout

```
.
├── README.md           # this file
└── atlas/              # Atlas project (primary submission)
    ├── README.md
    ├── PRD.md
    ├── architecture.md
    ├── user-flow.md
    ├── feature-breakdown.md
    ├── roadmap.md
    ├── tech-stack.md
    ├── contracts/      # Solidity (Foundry)
    ├── frontend/       # Next.js dashboard (planned)
    └── indexer/        # Ponder event indexer (planned)
```

Start with [atlas/README.md](./atlas/README.md) for the project overview.
