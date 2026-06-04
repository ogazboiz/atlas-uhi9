"use client";

import {useState, type FormEvent} from "react";
import {useChat} from "@ai-sdk/react";
import {DefaultChatTransport} from "ai";

export type AtlasChatContext = Record<string, unknown>;

interface AtlasChatProps {
    /// On-chain state passed to the LLM as a structured context block.
    context?: AtlasChatContext;
    /// Title rendered in the chat header.
    title?: string;
    /// Optional opener message rendered as the first assistant turn.
    opener?: string;
}

/// A focused, embeddable chat panel powered by Vercel AI Gateway + Claude Haiku.
/// Sends the surrounding page's on-chain state with every turn so the model
/// answers from real data rather than priors.
export function AtlasChat({context, title = "Ask Atlas", opener}: AtlasChatProps) {
    const [input, setInput] = useState("");
    const {messages, sendMessage, status, error} = useChat({
        transport: new DefaultChatTransport({
            api: "/api/atlas-chat",
            prepareSendMessagesRequest: ({messages}) => ({body: {messages, context}}),
        }),
    });
    const busy = status === "submitted" || status === "streaming";

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
                    Claude Haiku via AI Gateway
                </span>
            </div>

            <div className="flex-1 min-h-[180px] max-h-[420px] overflow-y-auto space-y-3 mb-3 pr-1">
                {messages.length === 0 && opener && <Bubble role="assistant" text={opener} />}
                {messages.map((m) => (
                    <Bubble key={m.id} role={m.role === "user" ? "user" : "assistant"} text={messageText(m)} />
                ))}
                {error && (
                    <div className="text-xs text-rose-400 px-3 py-2 border border-rose-900 rounded bg-rose-950/30">
                        {error.message ||
                            "Chat failed. Set AI_GATEWAY_API_KEY in Vercel project settings or enable AI Gateway."}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="How is my position doing? What happens if ETH drops 20%?"
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
                Atlas only sees structured on-chain context for this page. Numbers are read directly from
                deployed contracts.
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
