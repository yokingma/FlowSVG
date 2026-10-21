/// <reference path="./gifenc.d.ts" />
/** Quantize and encode one transferred frame at a time; acknowledgement bounds retained RGBA memory. */
import { GIFEncoder, quantize, applyPalette } from "gifenc";
const encoder = GIFEncoder();
const MAX_DELAY_MS = 655_350;
const MAX_PALETTE_COLORS = 256;
interface FrameMessage { type: "frame"; rgba: ArrayBuffer; width: number; height: number; delayMs: number; repeat: number }
interface FinishMessage { type: "finish" }
self.onmessage = (event: MessageEvent<FrameMessage | FinishMessage>) => {
  try {
    const message = event.data;
    if (message.type === "finish") {
      encoder.finish();
      const bytes = encoder.bytes();
      self.postMessage({ bytes }, { transfer: [bytes.buffer] });
      return;
    }
    const rgba = new Uint8Array(message.rgba);
    const palette = quantize(rgba, MAX_PALETTE_COLORS);
    const indexed = applyPalette(rgba, palette);
    let remaining = message.delayMs;
    do {
      const delay = Math.min(remaining, MAX_DELAY_MS);
      encoder.writeFrame(indexed, message.width, message.height, { palette, delay, repeat: message.repeat });
      remaining -= delay;
    } while (remaining > 0);
    self.postMessage({ acknowledged: true });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
