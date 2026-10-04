import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { sindi } from "./agents/sindi";

// Sindi's own Mastra app, served by `mastra dev` on port 4111 (Mastra's default; PORT overrides it). Her A2A agent card and endpoint come with the server:
// /api/.well-known/sindi/agent-card.json and /api/a2a/sindi. Her traces go to her own storage, shown in Studio.
export const mastra = new Mastra({
  agents: { sindi },
  storage: new LibSQLStore({
    id: "sindi-storage",
    url: process.env.SINDI_DATABASE_URL || "file:./sindi.db",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "sindi",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
