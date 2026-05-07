import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";

export function writePidFile(file: string, pid: number): void {
  const fd = openSync(file, "wx");
  try {
    writeSync(fd, String(pid));
  } finally {
    closeSync(fd);
  }
}

export function readPidFile(file: string): number | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function clearPidFile(file: string): void {
  try {
    unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
