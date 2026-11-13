/** Offline bootstrap: consume inert JSON only after all inline assets and host markup exist. */
import { createPlayer } from "../browser.js";
import type { DiagramDocument, EmphasisColors, ThemeName } from "../core/model.js";

interface PlaybackData {
  document: DiagramDocument;
  options: { theme?: ThemeName; emphasis?: EmphasisColors; controls?: boolean; autoplay?: boolean; loop?: boolean; gifExport?: boolean };
}

const data = document.getElementById("flowsvg-data");
const host = document.getElementById("flowsvg-player");
if (!data || !host) throw new Error("FlowSVG offline playback data or host is missing.");
const payload: PlaybackData = JSON.parse(data.textContent ?? "");
const player = createPlayer(host, payload.document, payload.options);
if (payload.options.autoplay) player.play();
