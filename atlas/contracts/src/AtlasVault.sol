// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AtlasVault
/// @notice ERC-4626 smoothing vault for Atlas LP positions. Receives all swap fees and
///         perp funding income from the hook, then pays out a flat per-block coupon to
///         aLP holders.
/// @dev The vault shares ARE the aLP token. Symbol: aLP-WETH-USDC, name: Atlas LP - WETH/USDC.
///      Coupon accrual is lazy: totalAssets() grows on-demand via the elapsed-block
///      formula, with `lastAssets` materialized only on deposit, withdraw, or explicit
///      accrual. See ../architecture.md section 4.3.
///
///      ACCOUNTING MODEL
///      ─────────────────
///      totalAssets()   = lastAssets + pending coupon growth (the PROMISED claim value)
///      vaultBalance    = underlying tokens actually held by the vault
///      bufferAmount    = vaultBalance - totalAssets()  (positive => surplus)
///      bufferHealth    = bufferAmount / 30-day forward coupon obligation
///
///      Auto-rules:
///        bufferHealth < 0.5  => pause deposits, halve coupon
///        bufferHealth >= 1.0 => unpause deposits
///        bufferHealth >= 1.5 => restore coupon to target
contract AtlasVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ CONSTANTS ============

    /// @dev Approximate blocks per year on a 2-second chain like Unichain.
    uint256 public constant BLOCKS_PER_YEAR = 15_768_000;

    /// @dev Basis points denominator (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Buffer health thresholds, expressed in basis points (10000 = 1.0x).
    uint256 public constant BUFFER_LOW_BPS = 5_000; // 0.5x
    uint256 public constant BUFFER_RESTORE_BPS = 10_000; // 1.0x
    uint256 public constant BUFFER_HEALTHY_BPS = 15_000; // 1.5x

    // ============ STORAGE ============

    /// @dev Admin set at construction; can set hook address one time post-deploy.
    address public immutable ADMIN;

    /// @dev Initial / target coupon rate. Coupon may be temporarily halved below this.
    uint256 public immutable TARGET_COUPON_BPS;

    /// @dev Hard cap on coupon to prevent runaway buffer drain.
    uint256 public immutable MAX_COUPON_BPS;

    /// @dev The hook contract authorized to deposit fees + funding via depositFromHook.
    /// @dev Settable once by the admin to resolve the hook<->vault address chicken-and-egg.
    address public hook;

    /// @dev Current coupon rate in basis points (e.g., 800 = 8% APR).
    uint256 public couponBps;

    /// @dev Materialized totalAssets at lastUpdateBlock.
    uint256 public lastAssets;

    /// @dev Block at which lastAssets was last updated.
    uint256 public lastUpdateBlock;

    /// @dev Whether new deposits are paused (true when buffer health below 0.5x).
    bool public depositsPaused;

    // ============ EVENTS ============

    event CouponAccrued(uint256 amount, uint256 newLastAssets);
    event CouponReduced(uint256 oldBps, uint256 newBps);
    event CouponRestored(uint256 oldBps, uint256 newBps);
    event BufferLow(uint256 healthBps);
    event BufferRestored(uint256 healthBps);
    event FeesDeposited(uint256 amount);
    event HookSet(address hook);

    // ============ ERRORS ============

    error DepositsPaused();
    error NotHook();
    error CouponAboveMax();
    error InitialCouponAboveMax();
    error NotAdmin();
    error HookAlreadySet();
    error HookNotSet();

    // ============ CONSTRUCTOR ============

    constructor(IERC20 asset_, uint256 initialCouponBps, uint256 maxCouponBps_)
        ERC4626(asset_)
        ERC20("Atlas LP - WETH/USDC", "aLP-WETH-USDC")
    {
        if (initialCouponBps > maxCouponBps_) revert InitialCouponAboveMax();
        ADMIN = msg.sender;
        TARGET_COUPON_BPS = initialCouponBps;
        MAX_COUPON_BPS = maxCouponBps_;
        couponBps = initialCouponBps;
        lastUpdateBlock = block.number;
    }

    // ============ MODIFIERS ============

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    // ============ ADMIN ============

    /// @notice One-time hook address binding. Required before depositFromHook works.
    function setHook(address _hook) external {
        if (msg.sender != ADMIN) revert NotAdmin();
        if (hook != address(0)) revert HookAlreadySet();
        hook = _hook;
        emit HookSet(_hook);
    }

    // ============ HOOK CASHFLOW ============

    /// @notice Called by AtlasHook to deposit collected fees and funding income.
    /// @dev Pulls tokens from the hook. Does NOT change exchange rate; grows the buffer.
    function depositFromHook(uint256 amount) external onlyHook nonReentrant {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit FeesDeposited(amount);
        _evaluateBufferState();
    }

    // ============ VIEWS ============

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        return lastAssets + _pendingCouponGrowth();
    }

    /// @notice Returns the buffer health ratio in basis points (10000 = 1.0x).
    /// @dev Returns `type(uint256).max` when the forward obligation is zero (no holders / no rate).
    function bufferHealth() public view returns (uint256) {
        uint256 obligation = totalAssets();
        if (obligation == 0) return type(uint256).max;

        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        if (vaultBalance <= obligation) return 0;
        uint256 buffer = vaultBalance - obligation;

        uint256 forward30Days = obligation * couponBps * 30 / (BPS_DENOMINATOR * 365);
        if (forward30Days == 0) return type(uint256).max;

        return buffer * BPS_DENOMINATOR / forward30Days;
    }

    /// @notice The currently accruing per-year rate after any auto-adjustments.
    function currentCouponBps() external view returns (uint256) {
        return couponBps;
    }

    // ============ INTERNAL HOOKS (ERC-4626) ============

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        if (depositsPaused) revert DepositsPaused();
        _accrueCoupon();
        super._deposit(caller, receiver, assets, shares);
        lastAssets += assets;
        _evaluateBufferState();
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _accrueCoupon();
        super._withdraw(caller, receiver, owner, assets, shares);
        // lastAssets cannot underflow because the burned shares correspond to <= lastAssets at this block.
        lastAssets -= assets;
        _evaluateBufferState();
    }

    // ============ INTERNAL HELPERS ============

    /// @dev Materializes the lazy coupon growth into lastAssets and updates lastUpdateBlock.
    function _accrueCoupon() internal {
        if (block.number == lastUpdateBlock) return;
        uint256 growth = _pendingCouponGrowth();
        if (growth > 0) {
            lastAssets += growth;
            emit CouponAccrued(growth, lastAssets);
        }
        lastUpdateBlock = block.number;
    }

    /// @dev Computes coupon growth since lastUpdateBlock without writing to storage.
    function _pendingCouponGrowth() internal view returns (uint256) {
        if (lastAssets == 0 || block.number == lastUpdateBlock) return 0;
        uint256 elapsed = block.number - lastUpdateBlock;
        return lastAssets * couponBps * elapsed / (BPS_DENOMINATOR * BLOCKS_PER_YEAR);
    }

    /// @dev Inspects vault solvency and buffer health, applying:
    ///        vaultBalance < obligation  => pause deposits + halve coupon (insolvency trigger)
    ///        health >= 1.0x             => unpause deposits
    ///        health >= 1.5x             => restore coupon to target
    /// @dev Insolvency is the trigger for negative actions to avoid false-positives on a
    ///      freshly seeded vault where bufferHealth is structurally zero.
    function _evaluateBufferState() internal {
        uint256 obligation = totalAssets();
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));

        if (vaultBalance < obligation) {
            if (!depositsPaused) {
                depositsPaused = true;
                emit BufferLow(0);
            }
            if (couponBps > TARGET_COUPON_BPS / 2 && couponBps > 1) {
                uint256 old = couponBps;
                couponBps = couponBps / 2;
                emit CouponReduced(old, couponBps);
            }
            return;
        }

        uint256 healthBps = _computeHealthBps(obligation, vaultBalance - obligation);

        if (healthBps >= BUFFER_RESTORE_BPS && depositsPaused) {
            depositsPaused = false;
            emit BufferRestored(healthBps);
        }
        if (healthBps >= BUFFER_HEALTHY_BPS && couponBps < TARGET_COUPON_BPS) {
            uint256 old = couponBps;
            couponBps = TARGET_COUPON_BPS;
            emit CouponRestored(old, couponBps);
        }
    }

    /// @dev Helper exposing the same math used by bufferHealth() to the internal evaluator.
    function _computeHealthBps(uint256 obligation, uint256 buffer) internal view returns (uint256) {
        uint256 forward30Days = obligation * couponBps * 30 / (BPS_DENOMINATOR * 365);
        if (forward30Days == 0) return type(uint256).max;
        return buffer * BPS_DENOMINATOR / forward30Days;
    }
}
