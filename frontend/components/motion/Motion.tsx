"use client";

/// Atlas motion primitives.
///
/// Built strictly on Emil Kowalski's animation rules
/// (https://emilkowal.ski/skill, animations.dev/vocabulary):
///   - UI animations stay under 300ms. Marketing reveals up to ~400ms.
///   - Custom strong easings, not the built-in CSS ones. Built-ins lack punch.
///   - Never animate from scale(0). Start at scale(0.96) + opacity 0.
///   - Buttons: scale(0.97) on :active with 160ms ease-out, in CSS.
///   - Origin-aware popovers. Modals stay centered.
///   - Only animate transform + opacity. No blur on entries — too expensive
///     and masks the very content you are trying to show. Blur is reserved
///     for crossfades that feel off (2px max).
///   - Asymmetric enter/exit: exits 50-60% of the enter duration.
///   - Hover effects gated behind `@media (hover: hover) and (pointer: fine)`.
///   - prefers-reduced-motion: KEEP opacity/color transitions, drop movement.
///
/// All components forward a `className` for drop-in Tailwind compatibility.

import {
    AnimatePresence,
    motion,
    useInView,
    useMotionValue,
    useReducedMotion,
    useSpring,
    useTransform,
    type Transition,
    type Variants,
} from "motion/react";
import {useEffect, useMemo, useRef, type ReactNode} from "react";

// --------------------------------------------------------------------------
// Easing curves — Emil's strong custom variants. Do NOT replace with the
// built-in CSS keywords; those lack the punch that makes UI feel intentional.
// --------------------------------------------------------------------------

/// Strong ease-out. Use for entrances and anything responding to user input.
/// The instant movement makes the interface feel snappy.
export const EASE_OUT: Transition["ease"] = [0.23, 1, 0.32, 1];

/// Strong ease-in-out. Use when an on-screen element moves from A to B
/// (tone changes, layout morphs).
export const EASE_IN_OUT: Transition["ease"] = [0.77, 0, 0.175, 1];

/// iOS-like drawer curve (from Ionic). Use for large drawers/sheets.
export const EASE_DRAWER: Transition["ease"] = [0.32, 0.72, 0, 1];

/// Spring tuned to feel snappy and interruptible. Press feedback.
export const SPRING_SNAP: Transition = {type: "spring", stiffness: 380, damping: 24, mass: 0.6};

/// Soft spring for hover lift and idle motion.
export const SPRING_SOFT: Transition = {type: "spring", stiffness: 200, damping: 22, mass: 0.8};

// Durations Emil's rule says UI stays under 300ms.
const DURATION_FAST = 0.16; // 160ms — buttons, tooltips
const DURATION_NORMAL = 0.22; // 220ms — dropdowns, selects, stat cards
const DURATION_REVEAL = 0.32; // 320ms — section entrances (marketing latitude)

// --------------------------------------------------------------------------
// Variants — reusable enter animations
// --------------------------------------------------------------------------

/// Drop in 8px from above with a quick settle. No blur — keep transform + opacity only.
export const fadeUpVariants: Variants = {
    hidden: {opacity: 0, y: 8},
    visible: {
        opacity: 1,
        y: 0,
        transition: {duration: DURATION_REVEAL, ease: EASE_OUT},
    },
};

/// Scale in from 0.96 (never from 0 — nothing in the real world appears from nothing).
export const scaleInVariants: Variants = {
    hidden: {opacity: 0, scale: 0.96},
    visible: {
        opacity: 1,
        scale: 1,
        transition: {duration: DURATION_NORMAL, ease: EASE_OUT},
    },
};

/// Slight spring overshoot for celebratory moments. Use rarely.
export const popInVariants: Variants = {
    hidden: {opacity: 0, scale: 0.94},
    visible: {opacity: 1, scale: 1, transition: SPRING_SNAP},
};

export const staggerContainerVariants: Variants = {
    hidden: {},
    visible: {
        transition: {staggerChildren: 0.07, delayChildren: 0.04},
    },
};

// --------------------------------------------------------------------------
// FadeIn — one-shot reveal, optionally tied to scroll-into-view.
// --------------------------------------------------------------------------

interface FadeInProps {
    children: ReactNode;
    delay?: number;
    /// Distance the element travels up on entry (px). 0 = pure fade.
    y?: number;
    /// Reveal only when scrolled into view.
    whenInView?: boolean;
    /// Pass through className for layout.
    className?: string;
    /// HTML element to render. Default 'div'.
    as?: "div" | "section" | "span";
}

export function FadeIn({children, delay = 0, y = 12, whenInView = false, className, as = "div"}: FadeInProps) {
    const reduced = useReducedMotion();
    const ref = useRef<HTMLElement | null>(null);
    const inView = useInView(ref as React.RefObject<HTMLElement>, {once: true, amount: 0.15});
    const should = !whenInView || inView;

    if (reduced) {
        if (as === "section") return <section className={className}>{children}</section>;
        if (as === "span") return <span className={className}>{children}</span>;
        return <div className={className}>{children}</div>;
    }

    // Transform + opacity only. No blur, no filter — those are expensive,
    // run on the CPU on Safari, and obscure the content you are revealing.
    const initial = {opacity: 0, y};
    const animate = should ? {opacity: 1, y: 0} : undefined;
    const transition = {duration: DURATION_REVEAL, ease: EASE_OUT, delay};

    if (as === "section") {
        return (
            <motion.section
                ref={ref as React.RefObject<HTMLElement>}
                className={className}
                initial={initial}
                animate={animate}
                transition={transition}
            >
                {children}
            </motion.section>
        );
    }
    if (as === "span") {
        return (
            <motion.span
                ref={ref as React.RefObject<HTMLSpanElement>}
                className={className}
                initial={initial}
                animate={animate}
                transition={transition}
            >
                {children}
            </motion.span>
        );
    }
    return (
        <motion.div
            ref={ref as React.RefObject<HTMLDivElement>}
            className={className}
            initial={initial}
            animate={animate}
            transition={transition}
        >
            {children}
        </motion.div>
    );
}

// --------------------------------------------------------------------------
// Stagger — container that cascades reveals across children.
// --------------------------------------------------------------------------

interface StaggerProps {
    children: ReactNode;
    /// Delay between successive children.
    delayChildren?: number;
    staggerChildren?: number;
    whenInView?: boolean;
    className?: string;
    as?: "div" | "section" | "ul";
}

export function Stagger({
    children,
    delayChildren = 0.05,
    staggerChildren = 0.07,
    whenInView = false,
    className,
    as = "div",
}: StaggerProps) {
    const reduced = useReducedMotion();
    const ref = useRef<HTMLElement | null>(null);
    const inView = useInView(ref as React.RefObject<HTMLElement>, {once: true, amount: 0.1});
    const should = !whenInView || inView;

    const variants: Variants = {
        hidden: {},
        visible: {transition: {delayChildren, staggerChildren}},
    };

    if (reduced) {
        if (as === "section") return <section className={className}>{children}</section>;
        if (as === "ul") return <ul className={className}>{children}</ul>;
        return <div className={className}>{children}</div>;
    }

    const animate = should ? "visible" : "hidden";

    if (as === "section") {
        return (
            <motion.section
                ref={ref as React.RefObject<HTMLElement>}
                className={className}
                initial="hidden"
                animate={animate}
                variants={variants}
            >
                {children}
            </motion.section>
        );
    }
    if (as === "ul") {
        return (
            <motion.ul
                ref={ref as React.RefObject<HTMLUListElement>}
                className={className}
                initial="hidden"
                animate={animate}
                variants={variants}
            >
                {children}
            </motion.ul>
        );
    }
    return (
        <motion.div
            ref={ref as React.RefObject<HTMLDivElement>}
            className={className}
            initial="hidden"
            animate={animate}
            variants={variants}
        >
            {children}
        </motion.div>
    );
}

/// Child of Stagger. Use one of the variant flavors.
export function StaggerItem({
    children,
    variant = "fadeUp",
    className,
}: {
    children: ReactNode;
    variant?: "fadeUp" | "scaleIn" | "popIn";
    className?: string;
}) {
    const reduced = useReducedMotion();
    if (reduced) return <div className={className}>{children}</div>;

    const variants =
        variant === "scaleIn"
            ? scaleInVariants
            : variant === "popIn"
              ? popInVariants
              : fadeUpVariants;

    return (
        <motion.div className={className} variants={variants}>
            {children}
        </motion.div>
    );
}

// --------------------------------------------------------------------------
// NumberTicker — interpolates between numeric values when prop changes.
// Uses tabular-nums and a spring so the digit stays calm under rapid updates.
// --------------------------------------------------------------------------

interface NumberTickerProps {
    value: number;
    /// Minimum fraction digits in formatted output.
    minimumFractionDigits?: number;
    /// Maximum fraction digits in formatted output.
    maximumFractionDigits?: number;
    /// Symbol or string rendered before the number (e.g. "$").
    prefix?: string;
    /// Symbol rendered after (e.g. "%").
    suffix?: string;
    className?: string;
    /// Spring used for interpolation; defaults to a gentle settle.
    transition?: Transition;
}

export function NumberTicker({
    value,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    prefix = "",
    suffix = "",
    className,
    transition,
}: NumberTickerProps) {
    const reduced = useReducedMotion();
    const motionValue = useMotionValue(0);
    const spring = useSpring(motionValue, transition ?? {stiffness: 90, damping: 22, mass: 1});
    const formatted = useTransform(spring, (v) => {
        const n = Number.isFinite(v) ? v : 0;
        return `${prefix}${n.toLocaleString(undefined, {
            minimumFractionDigits,
            maximumFractionDigits,
        })}${suffix}`;
    });

    useEffect(() => {
        if (reduced) motionValue.jump(value);
        else motionValue.set(value);
    }, [value, motionValue, reduced]);

    return (
        <motion.span className={["tabular-nums", className ?? ""].filter(Boolean).join(" ")}>
            {formatted}
        </motion.span>
    );
}

// --------------------------------------------------------------------------
// FloatIcon — gentle continuous up-and-down drift for the brand mark.
// --------------------------------------------------------------------------

interface FloatIconProps {
    children: ReactNode;
    /// Pixel amplitude of vertical drift.
    amplitude?: number;
    /// Seconds per cycle.
    period?: number;
    className?: string;
}

export function FloatIcon({children, amplitude = 4, period = 4.2, className}: FloatIconProps) {
    const reduced = useReducedMotion();
    if (reduced) return <span className={className}>{children}</span>;
    return (
        <motion.span
            className={className}
            animate={{y: [-amplitude * 0.4, amplitude * 0.4, -amplitude * 0.4]}}
            transition={{duration: period, repeat: Infinity, ease: "easeInOut"}}
        >
            {children}
        </motion.span>
    );
}

// --------------------------------------------------------------------------
// PressableMotion — snappy press feedback wrapper.
// Use to wrap a button or link that needs tactile scale + spring.
// --------------------------------------------------------------------------

interface PressableMotionProps {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    type?: "button" | "submit";
}

export function PressableMotion({children, className, onClick, href, disabled, type = "button"}: PressableMotionProps) {
    const reduced = useReducedMotion();
    // Emil: 0.97 scale on press for tactile feedback. Hover only on devices
    // with a real cursor — touch devices trigger hover on tap, causing false
    // positives. Motion handles whileHover at runtime so we cannot gate it
    // via CSS @media; we instead keep the scale subtle.
    const interaction = reduced
        ? {}
        : {whileHover: {scale: 1.02}, whileTap: {scale: 0.97}, transition: SPRING_SNAP};

    if (href) {
        return (
            <motion.a href={href} className={className} {...interaction}>
                {children}
            </motion.a>
        );
    }
    return (
        <motion.button type={type} className={className} onClick={onClick} disabled={disabled} {...interaction}>
            {children}
        </motion.button>
    );
}

// --------------------------------------------------------------------------
// HoverLift — subtle elevation on hover, used on cards.
// --------------------------------------------------------------------------

export function HoverLift({children, className}: {children: ReactNode; className?: string}) {
    const reduced = useReducedMotion();
    if (reduced) return <div className={className}>{children}</div>;
    return (
        <motion.div
            className={className}
            whileHover={{y: -2, transition: SPRING_SOFT}}
            transition={SPRING_SOFT}
        >
            {children}
        </motion.div>
    );
}

// --------------------------------------------------------------------------
// CrossfadeText — value changes animate via a quick crossfade.
// Use for changing labels / status text where you want continuity.
// --------------------------------------------------------------------------

/// Value swap with quick crossfade. Asymmetric — enter slower than exit
/// because the exit is the system responding, the enter is the new content.
export function CrossfadeText({children, value, className}: {children: ReactNode; value: string; className?: string}) {
    return (
        <span className={className}>
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={value}
                    initial={{opacity: 0, y: 3}}
                    animate={{opacity: 1, y: 0, transition: {duration: DURATION_NORMAL, ease: EASE_OUT}}}
                    exit={{opacity: 0, y: -3, transition: {duration: DURATION_FAST, ease: EASE_OUT}}}
                    style={{display: "inline-block"}}
                >
                    {children}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

// --------------------------------------------------------------------------
// SectionReveal — wraps a long section with a scroll-triggered reveal,
// internal stagger optional.
// --------------------------------------------------------------------------

export function SectionReveal({
    children,
    className,
    stagger = false,
}: {
    children: ReactNode;
    className?: string;
    stagger?: boolean;
}) {
    if (stagger) {
        return (
            <Stagger className={className} whenInView staggerChildren={0.07} as="section">
                {children}
            </Stagger>
        );
    }
    return (
        <FadeIn className={className} whenInView as="section">
            {children}
        </FadeIn>
    );
}

// --------------------------------------------------------------------------
// useStableId — stable string id memoized by deps (used to key crossfades).
// --------------------------------------------------------------------------

export function useStableSignature(...deps: unknown[]): string {
    return useMemo(() => deps.map((d) => String(d)).join("·"), [deps]);
}
