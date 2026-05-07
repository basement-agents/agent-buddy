import { existsSync, readFileSync, watch } from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { runtimePaths } from "../daemon/runtime-paths.js";

export interface TailOptions {
  tail: number;
}

export async function tailLogFile(opts: TailOptions): Promise<string> {
  const paths = runtimePaths();
  if (!existsSync(paths.logFile)) return "No logs yet.";
  const text = readFileSync(paths.logFile, "utf8");
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-opts.tail).join("\n");
}

export async function followLogFile(): Promise<void> {
  const paths = runtimePaths();
  if (!existsSync(paths.logFile)) {
    process.stdout.write("No logs yet. Waiting for daemon to write...\n");
  } else {
    process.stdout.write((await tailLogFile({ tail: 200 })) + "\n");
  }
  let position = existsSync(paths.logFile) ? (await fsp.stat(paths.logFile)).size : 0;
  const dir = path.dirname(paths.logFile);
  const fileName = path.basename(paths.logFile);

  watch(dir, async (_event, filename) => {
    if (filename !== fileName) return;
    if (!existsSync(paths.logFile)) return;
    const stat = await fsp.stat(paths.logFile);
    if (stat.size <= position) {
      position = stat.size;
      return;
    }
    const fd = await fsp.open(paths.logFile, "r");
    try {
      const buf = Buffer.alloc(stat.size - position);
      await fd.read(buf, 0, buf.length, position);
      process.stdout.write(buf.toString("utf8"));
    } finally {
      await fd.close();
    }
    position = stat.size;
  });

  await new Promise<void>(() => { /* never resolves */ });
}
