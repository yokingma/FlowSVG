/** Public browser entry: expose the player and reusable choice control while keeping implementations under the browser module. */
export { createPlayer } from "./browser/player.js";
export type {
  FlowPlayer,
  PlayerErrorDetail,
  PlayerEventMap,
  PlayerInteractionDetail,
  PlayerOptions,
  PlayerState
} from "./browser/player.js";
export type { ThemeName } from "./core/model.js";

export { SelectControl, type SelectChoice } from "./browser/select-control.js";
