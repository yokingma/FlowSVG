import { describe, expect, it } from "vitest";
import { createPlayer } from "../browser.js";

describe("browser entry", () => {
  it("can be imported without DOM access", () => {
    expect(createPlayer).toBeTypeOf("function");
  });
});
