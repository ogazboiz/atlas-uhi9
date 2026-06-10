/// POST /api/atlas-chat
///
/// Starts a DurableAgent workflow per request. Returns the workflow's
/// streaming response and exposes `x-workflow-run-id` so the client
/// (WorkflowChatTransport) can reconnect to the same run if the connection
/// drops mid-stream.

import {convertToModelMessages, createUIMessageStreamResponse, type UIMessage} from "ai";
import {start} from "workflow/api";
import {atlasChatWorkflow} from "@/lib/agents/atlas-agent";

export async function POST(req: Request) {
    try {
        const {messages, userAddress}: {messages: UIMessage[]; userAddress?: string | null} = await req.json();
        const modelMessages = await convertToModelMessages(messages);
        const run = await start(atlasChatWorkflow, [modelMessages, userAddress ?? null]);

        return createUIMessageStreamResponse({
            stream: run.readable,
            headers: {
                "x-workflow-run-id": run.runId,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(
            JSON.stringify({
                error: "Atlas chat is unavailable.",
                detail: message,
                hint: "If running on Vercel, enable Workflow + AI Gateway in project settings. Locally, set AI_GATEWAY_API_KEY in .env.local.",
            }),
            {status: 500, headers: {"Content-Type": "application/json"}},
        );
    }
}
