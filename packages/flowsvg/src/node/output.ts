/** Publish complete CLI output on the destination filesystem; exclusive linking protects concurrent writers. */
import { randomUUID } from "node:crypto";
import { link, rename, unlink, writeFile } from "node:fs/promises";

/** Atomically publish complete bytes or text. Only explicit overwrite replaces an existing output. */
export async function publishOutput(destination: string, content: string | Uint8Array, overwrite: boolean, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const temporaryPath = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { flag: "wx", signal });
    signal.throwIfAborted();
    if (overwrite) await rename(temporaryPath, destination);
    else await link(temporaryPath, destination);
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
  }
}
