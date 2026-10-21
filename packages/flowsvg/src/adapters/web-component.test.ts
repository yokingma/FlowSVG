import { describe, expect, it } from "vitest";
import { FLOW_PLAYER_TAG, FlowPlayerElement, defineFlowPlayer } from "../web-component.js";

describe("web component entry", () => {
  it("is safe to import and call from a DOM-free runtime", () => {
    expect(FLOW_PLAYER_TAG).toBe("flowsvg-player");
    expect(FlowPlayerElement).toBeTypeOf("function");
    expect(defineFlowPlayer()).toBeUndefined();
  });

  it("declares the HTML attributes that map to player options", () => {
    expect(FlowPlayerElement.observedAttributes).toEqual([
      "document",
      "src",
      "autoplay",
      "controls",
      "speed",
      "theme",
      "reduced-motion",
      "hover-fill",
      "gif-export"
    ]);
  });
});
