"use client";

import {useCallback, useEffect, useMemo, useRef} from "react";

/// HedgedMercury — the signature interactive piece on /compare.
///
/// Two liquid-metal blobs sit side by side. Same verlet physics, same impacts,
/// completely different outcomes:
///
///   Atlas (right):   each point has an invisible spring pulling it toward its
///                    perfect-circle rest position. Distort it any way you want;
///                    the moment you release, surface tension snaps it back.
///                    On impact, ripples shoot out and resolve.
///
///   Vanilla (left):  identical verlet ring, no rest-position spring. Distort
///                    it and it stays distorted. Impacts leave permanent dents.
///
/// The metaphor is the product. Press 1-4 on the page below or drag the blobs
/// directly. On every `healPulse` increment (a Reactive Network callback
/// landing), the Atlas blob emits a cyan halo and reasserts its shape.

interface HedgedMercuryProps {
    /// Increment from the parent on every demo trigger. Sign carries direction
    /// (positive = downward / dump, negative = upward / pump). Magnitude scales
    /// the impulse strength.
    impactKey?: number;
    /// Increment when hook.lastNonce changes. Triggers the cyan heal halo on
    /// the Atlas blob and nudges all points back toward their rest positions.
    healPulse?: number;
    /// Live USDC values shown under each label.
    vanillaValue?: number;
    atlasValue?: number;
    className?: string;
}

type Pt = {
    x: number;
    y: number;
    px: number;
    py: number;
    rx: number; // rest x relative to blob center
    ry: number; // rest y relative to blob center
};

type Blob = {
    cx: number;
    cy: number;
    radius: number;
    points: Pt[];
    isAtlas: boolean;
};

type Ripple = {
    cx: number;
    cy: number;
    age: number;
    life: number;
    color: string;
    maxR: number;
};

const POINTS_PER_BLOB = 44;
const ITERATIONS = 8;
const ATLAS_REST_K = 0.06;
const SURFACE_K = 0.55;
const DAMPING = 0.92;
const NOISE_AMPLITUDE = 0.06;
const ATLAS_VALUE_BASE = 7000;

/// Build a circular ring of points around (cx, cy).
function buildBlob(cx: number, cy: number, radius: number, isAtlas: boolean): Blob {
    const pts: Pt[] = [];
    for (let i = 0; i < POINTS_PER_BLOB; i++) {
        const theta = (i / POINTS_PER_BLOB) * Math.PI * 2;
        const rx = Math.cos(theta) * radius;
        const ry = Math.sin(theta) * radius;
        pts.push({x: cx + rx, y: cy + ry, px: cx + rx, py: cy + ry, rx, ry});
    }
    return {cx, cy, radius, points: pts, isAtlas};
}

/// Verlet step + global forces.
function integrate(blob: Blob, dt: number, t: number) {
    const {points, cx, cy, isAtlas} = blob;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x;
        p.py = p.y;

        // Ambient idle noise so blobs gently breathe.
        const noiseAng = i * 1.37 + t * 0.0014;
        const nx = Math.sin(noiseAng) * NOISE_AMPLITUDE;
        const ny = Math.cos(noiseAng * 1.13) * NOISE_AMPLITUDE;

        let fx = nx;
        let fy = ny;

        // Atlas radial spring back to rest position. THIS is the hedge.
        if (isAtlas) {
            const targetX = cx + p.rx;
            const targetY = cy + p.ry;
            fx += (targetX - p.x) * ATLAS_REST_K;
            fy += (targetY - p.y) * ATLAS_REST_K;
        }

        p.x += vx + fx * dt * dt;
        p.y += vy + fy * dt * dt;
    }
}

/// Maintain neighbor-spring length so the blob stays cohesive.
function solveConstraints(blob: Blob) {
    const pts = blob.points;
    const restLen = (2 * Math.PI * blob.radius) / POINTS_PER_BLOB;
    for (let iter = 0; iter < ITERATIONS; iter++) {
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const diff = (restLen - dist) / dist;
            const k = SURFACE_K * 0.5;
            const ox = dx * diff * k;
            const oy = dy * diff * k;
            a.x -= ox;
            a.y -= oy;
            b.x += ox;
            b.y += oy;
        }
    }
}

/// Apply a directional impulse from outside the blob. Atlas: short-lived
/// because it springs back. Vanilla: leaves a permanent deformation.
function applyImpact(blob: Blob, sign: number, magnitude: number) {
    const angle = Math.random() * Math.PI * 2;
    const force = Math.min(60, 14 + Math.abs(magnitude) * 1.4);
    const dx = Math.cos(angle) * force;
    const dy = (Math.sin(angle) * force * 0.6 + force * 0.6) * sign;
    for (const p of blob.points) {
        p.x += dx;
        p.y += dy;
    }
}

/// Pull nearby points toward (mx, my). Smooth falloff.
function applyDrag(blob: Blob, mx: number, my: number, strength: number) {
    for (const p of blob.points) {
        const dx = mx - p.x;
        const dy = my - p.y;
        const d2 = dx * dx + dy * dy;
        const r2 = 90 * 90;
        if (d2 < r2) {
            const falloff = (1 - d2 / r2) * strength;
            p.x += dx * falloff;
            p.y += dy * falloff;
        }
    }
}

/// Snap-back nudge for Atlas: shove every point a bit toward its rest position.
function pullBackToRest(blob: Blob, amount: number) {
    for (const p of blob.points) {
        const tx = blob.cx + p.rx;
        const ty = blob.cy + p.ry;
        p.x += (tx - p.x) * amount;
        p.y += (ty - p.y) * amount;
    }
}

/// Draw a single blob as a smooth filled shape with gradient sheen.
function drawBlob(ctx: CanvasRenderingContext2D, blob: Blob, ts: number) {
    const pts = blob.points;
    if (pts.length === 0) return;

    // Build the closed path through point centers using quadratic curves
    // for a smoother liquid silhouette.
    ctx.beginPath();
    const first = pts[0];
    const last = pts[pts.length - 1];
    const startX = (first.x + last.x) / 2;
    const startY = (first.y + last.y) / 2;
    ctx.moveTo(startX, startY);
    for (let i = 0; i < pts.length; i++) {
        const cur = pts[i];
        const next = pts[(i + 1) % pts.length];
        const midX = (cur.x + next.x) / 2;
        const midY = (cur.y + next.y) / 2;
        ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
    }
    ctx.closePath();

    // Compute bounding box for gradient.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    if (blob.isAtlas) {
        // Atlas: emerald inner core fading to violet outer rim. Subtle pulse.
        const pulse = 0.92 + Math.sin(ts * 0.003) * 0.04;
        const grad = ctx.createRadialGradient(
            cx - w * 0.12,
            cy - h * 0.18,
            Math.min(w, h) * 0.1,
            cx,
            cy,
            Math.max(w, h) * 0.65,
        );
        grad.addColorStop(0, `rgba(110, 231, 183, ${0.88 * pulse})`);
        grad.addColorStop(0.55, `rgba(16, 185, 129, ${0.55 * pulse})`);
        grad.addColorStop(1, `rgba(167, 139, 250, ${0.35 * pulse})`);
        ctx.fillStyle = grad;
        ctx.shadowColor = "rgba(16, 185, 129, 0.65)";
        ctx.shadowBlur = 32;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Sheen highlight.
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    } else {
        // Vanilla: muted zinc with rose tinge along stretched edges. Compute
        // average strain to bias color.
        const restLen = (2 * Math.PI * blob.radius) / POINTS_PER_BLOB;
        let totalStrain = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            totalStrain += Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - restLen);
        }
        const avgStrain = totalStrain / pts.length;
        const roseMix = Math.min(0.55, avgStrain * 0.05);

        const grad = ctx.createRadialGradient(
            cx - w * 0.12,
            cy - h * 0.18,
            Math.min(w, h) * 0.1,
            cx,
            cy,
            Math.max(w, h) * 0.7,
        );
        grad.addColorStop(0, `rgba(180, 180, 188, 0.75)`);
        grad.addColorStop(0.55, `rgba(113, 113, 122, 0.55)`);
        grad.addColorStop(1, `rgba(251, 113, 133, ${0.18 + roseMix})`);
        ctx.fillStyle = grad;
        ctx.shadowColor = "rgba(82, 82, 91, 0.45)";
        ctx.shadowBlur = 22;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = `rgba(244,114,128,${0.15 + roseMix * 0.4})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }
}

/// Concentric expanding ring on the Atlas blob when a callback lands.
function drawRipple(ctx: CanvasRenderingContext2D, r: Ripple) {
    const t = r.age / r.life;
    const radius = 6 + r.maxR * t;
    const alpha = (1 - t) * 0.55;
    ctx.beginPath();
    ctx.arc(r.cx, r.cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = r.color.replace("ALPHA", String(alpha));
    ctx.lineWidth = 2.5;
    ctx.stroke();
}

export function HedgedMercury({
    impactKey = 0,
    healPulse = 0,
    vanillaValue,
    atlasValue,
    className,
}: HedgedMercuryProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const blobsRef = useRef<Blob[]>([]);
    const ripplesRef = useRef<Ripple[]>([]);
    const sizeRef = useRef<{w: number; h: number}>({w: 0, h: 0});
    const dragRef = useRef<{x: number; y: number; active: boolean; over: number}>({
        x: 0,
        y: 0,
        active: false,
        over: -1,
    });
    const valuesRef = useRef<{vanilla?: number; atlas?: number}>({vanilla: vanillaValue, atlas: atlasValue});
    const interactedRef = useRef<boolean>(false);
    const visibleRef = useRef<boolean>(true);
    const lastImpactRef = useRef<number>(impactKey);
    const lastHealRef = useRef<number>(healPulse);

    valuesRef.current = {vanilla: vanillaValue, atlas: atlasValue};

    /// Sample which blob a (x, y) point is inside.
    const hitTest = useCallback((x: number, y: number): number => {
        const blobs = blobsRef.current;
        for (let i = 0; i < blobs.length; i++) {
            const b = blobs[i];
            const dx = x - b.cx;
            const dy = y - b.cy;
            if (dx * dx + dy * dy < (b.radius + 10) * (b.radius + 10)) return i;
        }
        return -1;
    }, []);

    /// Rebuild blob centers + radii whenever container size changes.
    const rebuild = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        sizeRef.current = {w: rect.width, h: rect.height};
        const radius = Math.min(rect.width * 0.18, rect.height * 0.34, 130);
        const yMid = rect.height * 0.58;
        const vanillaCx = rect.width * 0.31;
        const atlasCx = rect.width * 0.69;
        blobsRef.current = [
            buildBlob(vanillaCx, yMid, radius, false),
            buildBlob(atlasCx, yMid, radius, true),
        ];
    }, []);

    // Resize observer.
    useEffect(() => {
        if (!canvasRef.current) return;
        const obs = new ResizeObserver(() => rebuild());
        obs.observe(canvasRef.current);
        rebuild();
        return () => obs.disconnect();
    }, [rebuild]);

    // Visibility observer (pauses rAF when offscreen to save CPU).
    useEffect(() => {
        if (!canvasRef.current) return;
        const obs = new IntersectionObserver(
            (entries) => {
                visibleRef.current = entries[0]?.isIntersecting ?? true;
            },
            {threshold: 0.05},
        );
        obs.observe(canvasRef.current);
        return () => obs.disconnect();
    }, []);

    // React to impact prop change: shared impulse to BOTH blobs.
    useEffect(() => {
        if (impactKey === lastImpactRef.current) return;
        lastImpactRef.current = impactKey;
        const sign = impactKey >= 0 ? 1 : -1;
        const magnitude = Math.max(5, Math.abs(impactKey) || 12);
        const blobs = blobsRef.current;
        for (const b of blobs) {
            applyImpact(b, sign, magnitude);
            // Visual ripple from impact point.
            ripplesRef.current.push({
                cx: b.cx,
                cy: b.cy,
                age: 0,
                life: 700,
                color: b.isAtlas
                    ? "rgba(167, 139, 250, ALPHA)"
                    : "rgba(251, 113, 133, ALPHA)",
                maxR: b.radius * 1.8,
            });
        }
    }, [impactKey]);

    // React to heal pulse: cyan halo on Atlas + nudge back toward rest.
    useEffect(() => {
        if (healPulse === lastHealRef.current) return;
        lastHealRef.current = healPulse;
        const atlas = blobsRef.current.find((b) => b.isAtlas);
        if (!atlas) return;
        pullBackToRest(atlas, 0.35);
        ripplesRef.current.push({
            cx: atlas.cx,
            cy: atlas.cy,
            age: 0,
            life: 1200,
            color: "rgba(56, 189, 248, ALPHA)",
            maxR: atlas.radius * 2.4,
        });
    }, [healPulse]);

    // Pointer interaction.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        function onDown(e: PointerEvent) {
            const rect = canvas!.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            dragRef.current = {x, y, active: true, over: hitTest(x, y)};
            interactedRef.current = true;
            canvas!.setPointerCapture(e.pointerId);
        }
        function onMove(e: PointerEvent) {
            const rect = canvas!.getBoundingClientRect();
            dragRef.current.x = e.clientX - rect.left;
            dragRef.current.y = e.clientY - rect.top;
            if (dragRef.current.active) interactedRef.current = true;
        }
        function onUp(e: PointerEvent) {
            dragRef.current.active = false;
            dragRef.current.over = -1;
            try {
                canvas!.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        }
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);
        return () => {
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointercancel", onUp);
        };
    }, [hitTest]);

    // Main animation loop.
    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        function tick(t: number) {
            const dt = Math.min(2, (t - last) / 16.66);
            last = t;
            const canvas = canvasRef.current;
            if (!canvas) {
                raf = requestAnimationFrame(tick);
                return;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                raf = requestAnimationFrame(tick);
                return;
            }

            if (!visibleRef.current) {
                raf = requestAnimationFrame(tick);
                return;
            }

            // Drag applies attractive force every frame while held.
            const drag = dragRef.current;
            if (drag.active && drag.over >= 0) {
                const b = blobsRef.current[drag.over];
                applyDrag(b, drag.x, drag.y, 0.35);
            }

            // Physics step.
            for (const b of blobsRef.current) {
                integrate(b, dt, t);
                solveConstraints(b);
            }

            // Clear canvas.
            const {w, h} = sizeRef.current;
            ctx.clearRect(0, 0, w, h);

            // Subtle divider line.
            ctx.beginPath();
            ctx.moveTo(w / 2, 12);
            ctx.lineTo(w / 2, h - 12);
            ctx.strokeStyle = "rgba(255,255,255,0.04)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw blobs.
            for (const b of blobsRef.current) drawBlob(ctx, b, t);

            // Draw ripples.
            const ripples = ripplesRef.current;
            for (let i = ripples.length - 1; i >= 0; i--) {
                const r = ripples[i];
                r.age += dt * 16.66;
                if (r.age >= r.life) {
                    ripples.splice(i, 1);
                    continue;
                }
                drawRipple(ctx, r);
            }

            // Labels + values.
            ctx.font = "600 11px ui-sans-serif, system-ui";
            ctx.textAlign = "center";
            const blobs = blobsRef.current;
            if (blobs.length >= 2) {
                const labelY = h * 0.18;
                ctx.fillStyle = "rgba(161,161,170,0.85)";
                ctx.letterSpacing = "0.16em";
                ctx.fillText("VANILLA LP", blobs[0].cx, labelY);
                ctx.fillStyle = "rgba(110,231,183,0.95)";
                ctx.fillText("ATLAS LP", blobs[1].cx, labelY);

                ctx.font = "600 22px ui-sans-serif, system-ui";
                ctx.fillStyle = "rgba(212,212,216,0.9)";
                const v = valuesRef.current.vanilla;
                ctx.fillText(v !== undefined ? `$${formatVal(v)}` : "—", blobs[0].cx, labelY + 26);
                ctx.fillStyle = "rgba(110,231,183,1)";
                const a = valuesRef.current.atlas ?? ATLAS_VALUE_BASE;
                ctx.fillText(`$${formatVal(a)}`, blobs[1].cx, labelY + 26);
            }

            // First-time hint.
            if (!interactedRef.current) {
                ctx.font = "500 11px ui-sans-serif, system-ui";
                ctx.fillStyle = "rgba(161,161,170,0.55)";
                ctx.fillText(
                    "drag the blobs · press 1-4 below for impact",
                    w / 2,
                    h - 16,
                );
            }

            raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    // SSR-safe wrapper.
    const cls = useMemo(
        () =>
            [
                "relative w-full h-[440px] sm:h-[480px] overflow-hidden rounded-2xl",
                className ?? "",
            ]
                .filter(Boolean)
                .join(" "),
        [className],
    );

    return (
        <div className={cls}>
            <canvas
                ref={canvasRef}
                style={{width: "100%", height: "100%", display: "block", touchAction: "none"}}
            />
        </div>
    );
}

function formatVal(v: number): string {
    return v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
