/// GET /api/atlas-chat/[runId]/stream
///
/// Resumable-stream endpoint for an existing chat workflow run. The
/// WorkflowChatTransport reconnects here when the initial stream is
/// interrupted (function timeout, lost connection, page refresh). The
/// `startIndex` query parameter lets the client skip already-received
/// chunks so the user does not see the response replay from the top.

import {createUIMessageStreamResponse} from "ai";
import {getRun} from "workflow/api";

export async function GET(
    req: Request,
    {params}: {params: Promise<{runId: string}>},
) {
    const {runId} = await params;
    const {searchParams} = new URL(req.url);
    const startIndexParam = searchParams.get("startIndex");
    const startIndex = startIndexParam !== null ? parseInt(startIndexParam, 10) : undefined;

    const run = getRun(runId);
    const readable = run.getReadable({startIndex});
    const tailIndex = await readable.getTailIndex();

    return createUIMessageStreamResponse({
        stream: readable,
        headers: {
            "x-workflow-stream-tail-index": String(tailIndex),
        },
    });
}
