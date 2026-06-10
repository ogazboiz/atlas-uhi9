"use client";

import {useEffect, useMemo, useState, type FormEvent} from "react";
import {useAccount} from "wagmi";
import {useChat} from "@ai-sdk/react";
import {WorkflowChatTransport} from "@workflow/ai";

export type AtlasChatContext = Record<string, unknown>;

interface AtlasChatProps {
    /// Optional structured context the page passes in. Kept for backwards
    /// compatibility with callers that still want to inject extra state,
    /// but the DurableAgent backend now mostly relies on its tools, not
    /// the static context block.
    context?: AtlasChatContext;
    /// Title rendered in the chat header.
    title?: string;
    /// Optional opener message rendered as the first assistant turn.
    opener?: string;
}

const RUN_ID_KEY = "atlas-chat-active-run-id";

/// Embeddable chat panel powered by a DurableAgent workflow.
///
/// Differences vs the previous streamText-only implementation:
/// - Each turn is durable. Server timeouts or page refreshes do not lose
///   the in-flight response; WorkflowChatTransport reconnects to the same
///   workflow run and resumes from the last received chunk.
/// - The agent calls four on-chain tools to fetch fresh state per turn
///   instead of trusting a static context block from the client.
export function AtlasChat({context, title = "Ask Atlas", opener}: AtlasChatProps) {
    const {address} = useAccount();
    const [input, setInput] = useState("");

    // Check for an active workflow run on mount so the chat picks up an
    // in-flight stream if the user refreshed mid-response.
    const initialActiveRunId = useMemo(() => {
        if (typeof window === "undefined") return undefined;
        return localStorage.getItem(RUN_ID_KEY) ?? undefined;
    }, []);

    const transport = useMemo(
        () =>
            new WorkflowChatTransport({
                api: "/api/atlas-chat",
                prepareSendMessagesRequest: ({messages}) => ({
                    body: {messages, userAddress: address ?? null, context: context ?? null},
                }),
                onChatSendMessage: (response: Response) => {
                    const runId = response.headers.get("x-workflow-run-id");
                    if (runId && typeof window !== "undefined") {
                        localStorage.setItem(RUN_ID_KEY, runId);
                    }
                },
                onChatEnd: () => {
                    if (typeof window !== "undefined") localStorage.removeItem(RUN_ID_KEY);
                },
                prepareReconnectToStreamRequest: ({api, ...rest}) => {
                    const runId = typeof window !== "undefined" ? localStorage.getItem(RUN_ID_KEY) : null;
                    if (!runId) throw new Error("No active workflow run ID found.");
                    return {
                        ...rest,
                        api: `${api}/${encodeURIComponent(runId)}/stream`,
                    };
                },
            }),
        [address, context],
    );

    const {messages, sendMessage, status, error} = useChat({
        transport,
        resume: Boolean(initialActiveRunId),
    });
    const busy = status === "submitted" || status === "streaming";

    // Drop a stale active runId if the chat completes naturally so subsequent
    // turns start fresh.
    useEffect(() => {
        if (!busy && messages.length > 0 && typeof window !== "undefined") {
            const last = messages[messages.length - 1];
            if (last.role === "assistant") localStorage.removeItem(RUN_ID_KEY);
        }
    }, [busy, messages]);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!input.trim() || busy) return;
        sendMessage({text: input});
        setInput("");
    }

    return (
        <section className="border border-zinc-900 rounded-xl p-5 bg-zinc-950 flex flex-col">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">{title}</h2>
                <span className="text-xs text-zinc-500 inline-flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-50" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
                    </span>
                    Durable Agent · Claude Haiku · 4 on-chain tools
                </span>
            </div>

            <div className="flex-1 min-h-[180px] max-h-[460px] overflow-y-auto space-y-3 mb-3 pr-1">
                {messages.length === 0 && opener && <Bubble role="assistant" text={opener} />}
                {messages.map((m) => (
                    <Bubble key={m.id} role={m.role === "user" ? "user" : "assistant"} text={messageText(m)} />
                ))}
                {error && (
                    <div className="text-xs text-rose-400 px-3 py-2 border border-rose-900 rounded bg-rose-950/30">
                        {error.message ||
                            "Chat failed. Enable Vercel Workflow + AI Gateway, or set AI_GATEWAY_API_KEY locally."}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="How is the vault doing? What's the latest reactive callback?"
                    className="flex-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-zinc-600 outline-none"
                />
                <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-medium bg-violet-500 hover:bg-violet-400 text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {busy ? "..." : "Ask"}
                </button>
            </form>

            <p className="text-[10px] text-zinc-600 mt-2">
                Each answer can call four durable tools that read live state directly from the deployed
                contracts. Numbers come from on-chain reads, not the model&apos;s priors.
            </p>
        </section>
    );
}

function Bubble({role, text}: {role: "user" | "assistant"; text: string}) {
    if (role === "user") {
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] px-3 py-2 rounded-lg bg-zinc-900 text-sm text-zinc-100">{text}</div>
            </div>
        );
    }
    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] px-3 py-2 rounded-lg bg-violet-950/40 border border-violet-900 text-sm text-zinc-200 whitespace-pre-wrap">
                {text}
            </div>
        </div>
    );
}

function messageText(m: {parts?: Array<{type: string; text?: string}>}): string {
    if (!m.parts) return "";
    return m.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
}
