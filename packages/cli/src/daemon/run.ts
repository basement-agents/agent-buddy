import { serve } from "@agent-buddy/server";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function runDaemon(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dashboardDir = path.join(here, "dashboard");
  const port = process.env.AGENT_BUDDY_PORT
    ? Number(process.env.AGENT_BUDDY_PORT)
    : undefined;
  await serve({ port, dashboardDir });
}
