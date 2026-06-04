"use client";

import {useEffect, useRef} from "react";
import {createChart, ColorType, type IChartApi, type ISeriesApi, LineSeries} from "lightweight-charts";

export type ChartPoint = {time: number; vanilla: number; atlas: number};

interface PriceChartProps {
    data: ChartPoint[];
}

export function PriceChart({data}: PriceChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const vanillaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const atlasSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            layout: {
                background: {type: ColorType.Solid, color: "transparent"},
                textColor: "#a1a1aa",
                attributionLogo: false,
            },
            grid: {
                vertLines: {color: "#18181b"},
                horzLines: {color: "#18181b"},
            },
            rightPriceScale: {borderColor: "#27272a"},
            timeScale: {borderColor: "#27272a", timeVisible: true, secondsVisible: true},
            width: containerRef.current.clientWidth,
            height: 400,
            autoSize: true,
        });

        const vanilla = chart.addSeries(LineSeries, {
            color: "#71717a",
            lineWidth: 2,
            title: "Vanilla LP",
        });
        const atlas = chart.addSeries(LineSeries, {
            color: "#10b981",
            lineWidth: 2,
            title: "Atlas LP",
        });

        chartRef.current = chart;
        vanillaSeriesRef.current = vanilla;
        atlasSeriesRef.current = atlas;

        return () => {
            chart.remove();
            chartRef.current = null;
            vanillaSeriesRef.current = null;
            atlasSeriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!vanillaSeriesRef.current || !atlasSeriesRef.current) return;
        const vanillaPoints = data.map((d) => ({time: d.time as never, value: d.vanilla}));
        const atlasPoints = data.map((d) => ({time: d.time as never, value: d.atlas}));
        vanillaSeriesRef.current.setData(vanillaPoints);
        atlasSeriesRef.current.setData(atlasPoints);
        chartRef.current?.timeScale().fitContent();
    }, [data]);

    return <div ref={containerRef} className="w-full" />;
}
