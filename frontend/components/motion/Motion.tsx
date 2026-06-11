"use client";

/// Atlas motion primitives.
///
/// Built on Emil Kowalski's animation vocabulary:
///   - Ease-out by default (responding to user)
///   - Ease-in-out for A->B layout
///   - Springs for press feedback (snappy, interruptible)
///   - Tabular numbers everywhere a value can change
///   - Stagger 60-80ms between siblings
///   - Stagger entry: 18-22ms cascade across hero -> metrics -> cards
///   - Idle float / pulse for ambient life
///   - prefers-reduced-motion respected through the useReducedMotion hook
///
/// All components forward a `className` so they stay drop-in compatible
/// with the existing Tailwind-based design system.

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
// Shared timing primitives
// --------------------------------------------------------------------------

/// Standard "ease-out" curve. Reach the destination quickly, settle slow.
/// Use for: any element responding to user input (clicks, route enters).
export const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1];

/// "Ease-in-out" — slow, fast, slow. Use when an element on screen
/// travels from A to B (color changes, layout morphs).
export const EASE_IN_OUT: Transition["ease"] = [0.65, 0, 0.35, 1];

/// Spring tuned to feel snappy but settled. Used for press feedback +
/// micro-interactions.
export const SPRING_SNAP: Transition = {type: "spring", stiffness: 360, damping: 26, mass: 0.6};

/// Spring tuned for gentle settle. Used for hover lift, idle motion.
export const SPRING_SOFT: Transition = {type: "spring", stiffness: 180, damping: 22, mass: 0.8};

// --------------------------------------------------------------------------
// Variants — reusable enter animations
// --------------------------------------------------------------------------

export const fadeUpVariants: Variants = {
    hidden: {opacity: 0, y: 12, filter: "blur(6px)"},
    visible: {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: {duration: 0.55, ease: EASE_OUT},
    },
};

export const scaleInVariants: Variants = {
    hidden: {opacity: 0, scale: 0.96, filter: "blur(4px)"},
    visible: {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        transition: {duration: 0.5, ease: EASE_OUT},
    },
};

export const popInVariants: Variants = {
    hidden: {opacity: 0, scale: 0.85},
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

    const initial = {opacity: 0, y, filter: "blur(6px)"};
    const animate = should ? {opacity: 1, y: 0, filter: "blur(0px)"} : undefined;
    const transition = {duration: 0.55, ease: EASE_OUT, delay};

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
    const interaction = reduced
        ? {}
        : {whileHover: {scale: 1.015}, whileTap: {scale: 0.97}, transition: SPRING_SNAP};

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

export function CrossfadeText({children, value, className}: {children: ReactNode; value: string; className?: string}) {
    return (
        <span className={className}>
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={value}
                    initial={{opacity: 0, y: 4}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.22, ease: EASE_OUT}}
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
