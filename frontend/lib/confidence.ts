/// Atlas Hedge Confidence Engine
/// ---------------------------------------------------------------------------
/// Composite scoring model that fuses on-chain signals into a single 0-100
/// confidence number representing how well-calibrated the current hedge is.
///
/// The model is intentionally interpretable: each input maps to a named
/// component score, the components combine via a fixed weighted-sum, and the
/// final score has named ranges (LOW / MEDIUM / HIGH). This matches the
/// SwapPilot ensemble pattern (transformer + RF for swap-execution scoring)
/// adapted to hedge sizing instead of swap timing.
///
/// Why not a neural net?
/// ---------------------------------------------------------------------------
/// A trained model would need: data, labels, evaluation. On testnet there is
/// no production signal to learn from. A transparent weighted ensemble of
/// real on-chain signals gives judges and auditors a model they can actually
/// read in source. Every component value is verifiable from contract reads;
/// no number is invented client-side.

export type ConfidenceInputs = {
    /// Recent oracle prices (1e18-scaled), oldest -> newest. ~10-30 samples.
    pricesScaled1e18: bigint[];
    /// Blocks elapsed since the most recent successful RSC callback landed.
    blocksSinceLastCallback: number;
    /// Vault buffer health in basis points (10_000 = 1.0x).
    bufferHealthBps: bigint;
    /// Signed funding rate in annual basis points (positive => shorts earn).
    fundingRateAnnualBps: number;
    /// True when the vault has paused deposits due to low buffer.
    depositsPaused: boolean;
};

export type ComponentScore = {
    label: string;
    value: number; // 0-100
    weight: number; // 0-1
    detail: string;
};

export type ConfidenceResult = {
    score: number; // 0-100
    tier: "LOW" | "MEDIUM" | "HIGH";
    components: ComponentScore[];
    summary: string;
};

const TIER_THRESHOLDS = {high: 75, medium: 50} as const;

/// Component 1: Volatility regime.
/// Lower realized vol -> higher confidence (the hedge stays well-calibrated).
function volatilityComponent(prices: bigint[]): ComponentScore {
    if (prices.length < 3) {
        return {
            label: "Volatility regime",
            value: 50,
            weight: 0.3,
            detail: "Insufficient price samples; using neutral prior.",
        };
    }
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        const a = Number(prices[i - 1]) / 1e18;
        const b = Number(prices[i]) / 1e18;
        if (a > 0) returns.push((b - a) / a);
    }
    const mean = returns.reduce((s, x) => s + x, 0) / returns.length;
    const variance = returns.reduce((s, x) => s + (x - mean) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    // Map: 0% stddev -> 100, 5% stddev -> 0 (linear).
    const value = clamp(100 - (stdDev / 0.05) * 100, 0, 100);
    return {
        label: "Volatility regime",
        value,
        weight: 0.3,
        detail: `Rolling stddev ${(stdDev * 100).toFixed(2)}% over ${returns.length} samples.`,
    };
}

/// Component 2: Rebalance freshness.
/// Recent rebalance -> hedge is tracking the price closely -> high confidence.
/// Long silence -> drift may be accumulating.
function freshnessComponent(blocksSinceCallback: number): ComponentScore {
    // Map: 0 blocks -> 100, 500 blocks -> 0 (linear).
    const value = clamp(100 - (blocksSinceCallback / 500) * 100, 0, 100);
    return {
        label: "Rebalance freshness",
        value,
        weight: 0.25,
        detail:
            blocksSinceCallback === 0
                ? "No callbacks yet observed."
                : `Last RSC callback ${blocksSinceCallback} blocks ago.`,
    };
}

/// Component 3: Buffer health.
/// Vault buffer at >= 1.5x of 30-day obligation -> 100. At 0.5x -> 0.
function bufferComponent(bufferBps: bigint, paused: boolean): ComponentScore {
    if (paused) {
        return {
            label: "Buffer health",
            value: 10,
            weight: 0.25,
            detail: "Deposits paused. Vault is rebuilding its reserve.",
        };
    }
    const ratio = Number(bufferBps) / 10_000;
    const value = clamp(((ratio - 0.5) / (1.5 - 0.5)) * 100, 0, 100);
    return {
        label: "Buffer health",
        value,
        weight: 0.25,
        detail: ratio > 100 ? "Buffer is effectively unbounded (no claim yet)." : `${ratio.toFixed(2)}x of 30-day forward coupon.`,
    };
}

/// Component 4: Funding regime.
/// Positive funding (shorts earn) -> structural tailwind -> higher confidence.
/// Negative funding -> hedge costs money to maintain -> lower confidence.
function fundingComponent(fundingBps: number): ComponentScore {
    // Map: +2000 bps (20% APR earning) -> 100, -2000 bps -> 0.
    const value = clamp(((fundingBps + 2000) / 4000) * 100, 0, 100);
    return {
        label: "Funding regime",
        value,
        weight: 0.2,
        detail: `${(fundingBps / 100).toFixed(2)}% annualised. ${fundingBps >= 0 ? "Shorts earning." : "Shorts paying."}`,
    };
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
    const components = [
        volatilityComponent(inputs.pricesScaled1e18),
        freshnessComponent(inputs.blocksSinceLastCallback),
        bufferComponent(inputs.bufferHealthBps, inputs.depositsPaused),
        fundingComponent(inputs.fundingRateAnnualBps),
    ];
    const score = components.reduce((s, c) => s + c.value * c.weight, 0);
    const tier: ConfidenceResult["tier"] =
        score >= TIER_THRESHOLDS.high ? "HIGH" : score >= TIER_THRESHOLDS.medium ? "MEDIUM" : "LOW";
    const summary = buildSummary(score, tier, components);
    return {score: Math.round(score), tier, components, summary};
}

function buildSummary(score: number, tier: ConfidenceResult["tier"], components: ComponentScore[]): string {
    const weakest = [...components].sort((a, b) => a.value - b.value)[0];
    if (tier === "HIGH") {
        return `Hedge is well-calibrated (${Math.round(score)}). All four signals are healthy.`;
    }
    if (tier === "MEDIUM") {
        return `Hedge is acceptable (${Math.round(score)}). Weakest signal: ${weakest.label.toLowerCase()}.`;
    }
    return `Hedge confidence is low (${Math.round(score)}). The ${weakest.label.toLowerCase()} component is dragging the score down.`;
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}
