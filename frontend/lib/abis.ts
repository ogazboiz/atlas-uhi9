/// Minimal ABIs for the Atlas frontend.
/// Only the methods the UI calls are included. Extend as needed.

export const ERC20_ABI = [
    {type: "function", name: "name", inputs: [], outputs: [{type: "string"}], stateMutability: "view"},
    {type: "function", name: "symbol", inputs: [], outputs: [{type: "string"}], stateMutability: "view"},
    {type: "function", name: "decimals", inputs: [], outputs: [{type: "uint8"}], stateMutability: "view"},
    {
        type: "function",
        name: "balanceOf",
        inputs: [{name: "account", type: "address"}],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "allowance",
        inputs: [
            {name: "owner", type: "address"},
            {name: "spender", type: "address"},
        ],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "approve",
        inputs: [
            {name: "spender", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [{type: "bool"}],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "mint",
        inputs: [
            {name: "account", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
] as const;

export const ATLAS_VAULT_ABI = [
    {type: "function", name: "totalAssets", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "totalSupply", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "couponBps", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "lastAssets", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "bufferHealth", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "depositsPaused", inputs: [], outputs: [{type: "bool"}], stateMutability: "view"},
    {type: "function", name: "TARGET_COUPON_BPS", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "MAX_COUPON_BPS", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {type: "function", name: "asset", inputs: [], outputs: [{type: "address"}], stateMutability: "view"},
    {type: "function", name: "hook", inputs: [], outputs: [{type: "address"}], stateMutability: "view"},
    {
        type: "function",
        name: "balanceOf",
        inputs: [{name: "account", type: "address"}],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "previewRedeem",
        inputs: [{name: "shares", type: "uint256"}],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "previewDeposit",
        inputs: [{name: "assets", type: "uint256"}],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "deposit",
        inputs: [
            {name: "assets", type: "uint256"},
            {name: "receiver", type: "address"},
        ],
        outputs: [{type: "uint256"}],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "withdraw",
        inputs: [
            {name: "assets", type: "uint256"},
            {name: "receiver", type: "address"},
            {name: "owner", type: "address"},
        ],
        outputs: [{type: "uint256"}],
        stateMutability: "nonpayable",
    },
    // events
    {
        type: "event",
        name: "Deposit",
        inputs: [
            {name: "caller", type: "address", indexed: true},
            {name: "owner", type: "address", indexed: true},
            {name: "assets", type: "uint256"},
            {name: "shares", type: "uint256"},
        ],
    },
    {
        type: "event",
        name: "FeesDeposited",
        inputs: [{name: "amount", type: "uint256"}],
    },
    {
        type: "event",
        name: "CouponAccrued",
        inputs: [
            {name: "amount", type: "uint256"},
            {name: "newLastAssets", type: "uint256"},
        ],
    },
] as const;

export const ATLAS_HOOK_ABI = [
    {
        type: "function",
        name: "poolHedges",
        inputs: [{name: "poolId", type: "bytes32"}],
        outputs: [
            {name: "perpPositionId", type: "bytes32"},
            {name: "totalHedgeSize", type: "uint256"},
            {name: "lastRebalanceBlock", type: "uint256"},
            {name: "open", type: "bool"},
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "lpContributions",
        inputs: [{name: "positionKey", type: "bytes32"}],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {type: "function", name: "reactiveCallback", inputs: [], outputs: [{type: "address"}], stateMutability: "view"},
    // events
    {
        type: "event",
        name: "HedgeOpened",
        inputs: [
            {name: "poolId", type: "bytes32", indexed: true},
            {name: "perpPositionId", type: "bytes32"},
            {name: "size", type: "uint256"},
        ],
    },
    {
        type: "event",
        name: "HedgeResized",
        inputs: [
            {name: "poolId", type: "bytes32", indexed: true},
            {name: "delta", type: "int256"},
            {name: "newTotalSize", type: "uint256"},
        ],
    },
    {
        type: "event",
        name: "HedgeClosed",
        inputs: [
            {name: "poolId", type: "bytes32", indexed: true},
            {name: "finalPnL", type: "int256"},
        ],
    },
    {
        type: "event",
        name: "RebalanceCallbackReceived",
        inputs: [
            {name: "poolId", type: "bytes32", indexed: true},
            {name: "appliedDelta", type: "int256"},
            {name: "nonce", type: "uint256"},
        ],
    },
] as const;

export const MOCK_ORACLE_ABI = [
    {type: "function", name: "getPrice", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
    {
        type: "function",
        name: "setPrice",
        inputs: [{name: "_price", type: "uint256"}],
        outputs: [],
        stateMutability: "nonpayable",
    },
] as const;

export const MOCK_PERP_ADAPTER_ABI = [
    {
        type: "function",
        name: "fundingRateAnnualBps",
        inputs: [],
        outputs: [{type: "int256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getPositionValue",
        inputs: [{name: "positionId", type: "bytes32"}],
        outputs: [{type: "uint256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getFundingAccrued",
        inputs: [{name: "positionId", type: "bytes32"}],
        outputs: [{type: "int256"}],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getTotalPnL",
        inputs: [{name: "positionId", type: "bytes32"}],
        outputs: [{type: "int256"}],
        stateMutability: "view",
    },
] as const;
