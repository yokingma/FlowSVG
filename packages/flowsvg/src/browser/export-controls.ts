/**
 * Optional player GIF UI. One task owns its input, abort signal and download resources independently of playback.
 * The browser exporter stays behind a dynamic import; portable builds replace only that import with an inline bridge.
 */
import type { DiagramDocument, ThemeName } from "../core/model.js";
import type { GifExportProgress } from "../export/types.js";

const MAX_FILENAME_LENGTH = 120;

interface ExportInput {
  document: DiagramDocument;
  theme: ThemeName;
}

/** Own the visible export state and one cancellable task; destroy silences asynchronous results and releases downloads. */
export class GifExportControls {
  readonly element: HTMLSpanElement;
  private readonly startButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly status: HTMLSpanElement;
  private readonly progress: HTMLProgressElement;
  private task: AbortController | undefined;
  private destroyed = false;
  private readonly downloadUrls = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly owner: Document, private readonly captureInput: () => ExportInput) {
    this.element = owner.createElement("span");
    this.element.className = "flowsvg-export-controls";
    this.startButton = owner.createElement("button");
    this.startButton.type = "button";
    this.startButton.textContent = "Export GIF";
    this.startButton.setAttribute("aria-label", "Export GIF");
    this.cancelButton = owner.createElement("button");
    this.cancelButton.type = "button";
    this.cancelButton.textContent = "Cancel export";
    this.cancelButton.hidden = true;
    this.progress = owner.createElement("progress");
    this.progress.setAttribute("aria-label", "GIF export progress");
    this.progress.hidden = true;
    this.status = owner.createElement("span");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.element.append(this.startButton, this.cancelButton, this.progress, this.status);
    this.startButton.addEventListener("click", this.start);
    this.cancelButton.addEventListener("click", this.cancel);
  }

  destroy(): void {
    this.destroyed = true;
    this.task?.abort();
    this.startButton.removeEventListener("click", this.start);
    this.cancelButton.removeEventListener("click", this.cancel);
    for (const [url, timer] of this.downloadUrls) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    this.downloadUrls.clear();
  }

  /** Reserve the slot and capture input before loading code so repeated clicks and document loads cannot race the import. */
  private start = (): void => {
    if (this.destroyed || this.task) return;
    const controller = new AbortController();
    this.task = controller;
    const input = this.captureInput();
    this.startButton.disabled = true;
    this.cancelButton.hidden = false;
    this.progress.hidden = false;
    this.progress.removeAttribute("value");
    this.status.textContent = "Preparing GIF…";
    void this.run(controller, input);
  };

  private cancel = (): void => {
    this.task?.abort();
  };

  private async run(controller: AbortController, input: ExportInput): Promise<void> {
    try {
      const { exportGif } = await loadExporter(controller.signal);
      if (!this.isActive(controller)) return;
      const bytes = await exportGif(input.document, {
        theme: input.theme,
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.isActive(controller)) this.renderProgress(progress);
        }
      });
      if (!this.isActive(controller)) return;
      this.download(bytes, input.document.title);
      this.status.textContent = "GIF export complete.";
    } catch (error) {
      if (this.destroyed || this.task !== controller) return;
      this.status.textContent = controller.signal.aborted
        ? "GIF export cancelled."
        : `GIF export failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // A cancelled import may return without throwing; always release its slot, but never update destroyed UI.
      if (this.task === controller) {
        this.task = undefined;
        if (!this.destroyed) {
          if (controller.signal.aborted) this.status.textContent = "GIF export cancelled.";
          this.startButton.disabled = false;
          this.cancelButton.hidden = true;
          this.progress.hidden = true;
        }
      }
    }
  }

  private isActive(controller: AbortController): boolean {
    return !this.destroyed && this.task === controller && !controller.signal.aborted;
  }

  private renderProgress(progress: GifExportProgress): void {
    this.progress.max = Math.max(1, progress.total);
    this.progress.value = progress.completed;
    const labels = { preparing: "Preparing", sampling: "Sampling", encoding: "Encoding", complete: "Completing" };
    this.status.textContent = `${labels[progress.phase]} GIF: ${progress.completed}/${progress.total}`;
  }

  private download(bytes: Uint8Array, title: string | undefined): void {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/gif" }));
    const link = this.owner.createElement("a");
    link.href = url;
    link.download = downloadFilename(title);
    try {
      this.owner.body.append(link);
      link.click();
    } finally {
      link.remove();
      // Defer revocation until the browser consumes the click. Destruction also releases pending download URLs.
      const timer = setTimeout(() => { URL.revokeObjectURL(url); this.downloadUrls.delete(url); }, 0);
      this.downloadUrls.set(url, timer);
    }
  }
}

/** Keep titles as filename data, including on Windows, and retain the extension within a bounded name. */
function downloadFilename(title: string | undefined): string {
  const name = (title ?? "").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, MAX_FILENAME_LENGTH);
  const safeName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name;
  return `${safeName || "FlowSVG"}.gif`;
}

/** Abort waiting for a module fetch as well as an active encoder; late module resolution cannot retain the task slot. */
async function loadExporter(signal: AbortSignal): Promise<typeof import("../export.js")> {
  signal.throwIfAborted();
  let stopListening = (): void => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    stopListening = () => signal.removeEventListener("abort", onAbort);
  });
  try {
    return await Promise.race([import("../export.js"), cancelled]);
  } finally {
    stopListening();
  }
}
