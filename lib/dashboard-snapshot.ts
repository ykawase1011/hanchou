import { spawn, type ChildProcess } from "node:child_process";

export interface SnapshotSubprocessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

function terminateProcessGroup(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back to killing the direct child.
    }
  }
  try { child.kill("SIGKILL"); } catch { /* The process already exited. */ }
}

export function runSnapshotSubprocess(options: SnapshotSubprocessOptions): Promise<Record<string, unknown>> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("snapshot timeout must be a positive integer");
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) throw new TypeError("snapshot output limit must be a positive integer");

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      reject(new Error("dashboard snapshot process could not be started"));
      return;
    }

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let totalBytes = 0;
    let settled = false;
    const finish = (error?: Error, value?: Record<string, unknown>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value as Record<string, unknown>);
    };
    const accept = (chunk: Buffer, capture: boolean): void => {
      totalBytes += chunk.length;
      if (totalBytes > maxOutputBytes) {
        terminateProcessGroup(child);
        finish(new Error("dashboard snapshot exceeded its output limit"));
        return;
      }
      if (capture) {
        stdout.push(chunk);
        stdoutBytes += chunk.length;
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => accept(chunk, true));
    child.stderr?.on("data", (chunk: Buffer) => accept(chunk, false));
    child.once("error", () => finish(new Error("dashboard snapshot process could not be started")));
    child.once("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(`dashboard snapshot process failed (${signal ?? code ?? "unknown"})`));
        return;
      }
      try {
        const value: unknown = JSON.parse(Buffer.concat(stdout, stdoutBytes).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid object");
        finish(undefined, value as Record<string, unknown>);
      } catch {
        finish(new Error("dashboard snapshot process returned invalid JSON"));
      }
    });

    const timer = setTimeout(() => {
      terminateProcessGroup(child);
      finish(new Error("dashboard snapshot timed out"));
    }, timeoutMs);
  });
}

export function createSnapshotSubprocessProvider(
  options: SnapshotSubprocessOptions,
): () => Promise<Record<string, unknown>> {
  let inFlight: Promise<Record<string, unknown>> | null = null;
  return () => {
    if (inFlight !== null) return inFlight;
    const request = runSnapshotSubprocess(options);
    inFlight = request;
    void request.then(
      () => { if (inFlight === request) inFlight = null; },
      () => { if (inFlight === request) inFlight = null; },
    );
    return request;
  };
}
