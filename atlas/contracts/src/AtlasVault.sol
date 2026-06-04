// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title AtlasVault
/// @notice ERC-4626 smoothing vault for Atlas LP positions. Receives all swap fees and
///         perp funding income from the hook, then pays out a flat per-block coupon to
///         aLP holders.
/// @dev The vault shares ARE the aLP token. Symbol: "aLP-WETH-USDC", name: "Atlas LP - WETH/USDC".
///      Coupon accrual is lazy: exchange rate is computed on-demand using elapsed blocks,
///      not pushed per-block, to keep gas cost zero during idle periods.
///      See ../architecture.md section 4.3 for the lazy accrual formula.
contract AtlasVault is ERC4626, ReentrancyGuard {
    using Math for uint256;

    // ============ CONSTANTS ============

    /// @dev Blocks per year (approximation, assumes 2-second blocks on Unichain).
    uint256 public constant BLOCKS_PER_YEAR = 15_768_000;

    /// @dev Basis points denominator (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ============ STORAGE ============

    /// @dev The hook contract authorized to deposit fees + funding via depositFromHook.
    address public hook;

    /// @dev Current coupon rate in basis points (e.g., 800 = 8% APR).
    uint256 public couponBps;

    /// @dev Cap on coupon rate; prevents buffer drain (e.g., 1500 = 15% APR).
    uint256 public maxCouponBps;

    /// @dev Last computed exchange rate (1e18 = 1.0).
    uint256 public lastExchangeRate;

    /// @dev Block at which lastExchangeRate was last updated.
    uint256 public lastUpdateBlock;

    /// @dev Reserve buffer for variance absorption.
    uint256 public bufferAmount;

    /// @dev Whether new deposits are paused (true when buffer health below 0.5x).
    bool public depositsPaused;

    // ============ EVENTS ============

    event CouponAccrued(uint256 newExchangeRate);
    event CouponReduced(uint256 oldBps, uint256 newBps, string reason);
    event CouponRestored(uint256 oldBps, uint256 newBps);
    event BufferLow(uint256 currentHealth);
    event BufferRestored(uint256 currentHealth);
    event FeesDeposited(uint256 amount);

    // ============ ERRORS ============

    error DepositsPaused();
    error NotHook();
    error CouponAboveMax();

    // ============ CONSTRUCTOR ============

    constructor(IERC20 asset_, address hook_, uint256 initialCouponBps, uint256 maxCouponBps_)
        ERC4626(asset_)
        ERC20("Atlas LP - WETH/USDC", "aLP-WETH-USDC")
    {
        hook = hook_;
        couponBps = initialCouponBps;
        maxCouponBps = maxCouponBps_;
        lastExchangeRate = 1e18;
        lastUpdateBlock = block.number;
    }

    // ============ HOOK ============

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    /// @notice Called by AtlasHook to deposit collected fees and funding income.
    function depositFromHook(uint256 amount) external onlyHook {
        // TODO: pull tokens from hook, add to buffer, emit FeesDeposited
    }

    // ============ VIEWS ============

    /// @notice Returns the buffer health ratio in basis points (10000 = 1.0x).
    /// @dev Buffer health = bufferAmount / (30-day forward coupon obligation).
    function bufferHealth() public view returns (uint256) {
        // TODO: compute 30-day coupon obligation = totalAssets * couponBps * 30 / 365 / 10000
        // TODO: return bufferAmount * 10000 / obligation
    }

    /// @notice Returns the current lazy-computed exchange rate (1e18 = 1.0).
    function currentExchangeRate() public view returns (uint256) {
        // TODO: lastExchangeRate * (1 + couponBps * blocksSinceUpdate / BLOCKS_PER_YEAR / 10000)
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        // TODO: return total assets reflecting accrued coupon (lazy)
        return super.totalAssets();
    }

    // ============ INTERNAL HOOKS ============

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        if (depositsPaused) revert DepositsPaused();
        // TODO: accrueCoupon before standard 4626 deposit
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        // TODO: accrueCoupon before standard 4626 withdraw
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ============ INTERNAL HELPERS ============

    /// @dev Materializes the lazy coupon accrual into storage and updates buffer state.
    function _accrueCoupon() internal {
        // TODO: update lastExchangeRate using currentExchangeRate(), reset lastUpdateBlock
        // TODO: check buffer health and adjust couponBps if thresholds breached
    }
}
