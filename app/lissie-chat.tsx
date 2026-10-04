"use client";

import { CopilotChat, CopilotKit } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

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
        <CopilotChat
          agentId="lissie"
          threadId={threadId}
          className="min-h-0 flex-1"
          labels={{
            chatInputPlaceholder: "Tell Lissie what needs doing",
            chatDisclaimerText: "Lissie is a cat. Check her work.",
          }}
        />
      </CopilotKit>
    </div>
  );
}
