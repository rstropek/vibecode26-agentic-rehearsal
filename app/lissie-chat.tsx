"use client";

import { CopilotChat, CopilotKit } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import {
  useLissieToolRenderers,
  useRefreshWhenLissieChangesTodos,
} from "@/app/lissie-tool-calls";

const AGENT_ID = "lissie";

// The chat with Lissie. The runtime at /api/copilotkit reads the session cookie and only accepts `threadId`
// when it is the signed-in user's own thread, so passing it from the server is safe and restores the history.
export function LissieChat({ threadId }: { threadId: string }) {
  return (
    <div className="lissie-chat flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-paper-raised">
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        useSingleEndpoint={false}
        enableInspector={false}
      >
        <Chat threadId={threadId} />
      </CopilotKit>
    </div>
  );
}

// Inside <CopilotKit>, where the tool renderers and the agent subscription can register.
function Chat({ threadId }: { threadId: string }) {
  useLissieToolRenderers();
  useRefreshWhenLissieChangesTodos(AGENT_ID);
  return (
    <CopilotChat
      agentId={AGENT_ID}
      threadId={threadId}
      className="min-h-0 flex-1"
      labels={{
        chatInputPlaceholder: "Tell Lissie what needs doing",
        chatDisclaimerText: "Lissie is a cat. Check her work.",
      }}
    />
  );
}
