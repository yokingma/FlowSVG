/** Mount failures must stay inside the real Vue adapter subtree and leave page actions usable. */
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  startShowcaseSite,
  type ShowcaseSite,
} from "../../../scripts/showcase-browser-site.js";

let site: ShowcaseSite;
beforeAll(async () => {
  site = await startShowcaseSite("flowsvg-vue-example");
}, 120_000);
afterAll(async () => {
  await site?.close();
}, 30_000);

it("captures a descendant mount error without an unhandled page error and retries the saved target", async () => {
  const { page, origin } = site;
  const uncaughtErrors: string[] = [];
  page.on("pageerror", (error) => {
    uncaughtErrors.push(error.message);
  });
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "className",
    )!;
    let rejectNextCanvas = true;
    Object.defineProperty(Element.prototype, "className", {
      ...descriptor,
      set(value: string) {
        if (rejectNextCanvas && value === "flowsvg-canvas") {
          rejectNextCanvas = false;
          throw new Error("Vue mount boundary probe");
        }
        descriptor.set!.call(this, value);
      },
    });
  });
  await page.goto(`${origin}/acceptance/?time=1250`);
  await expect
    .poll(() => page.locator("#error").textContent())
    .toContain("Vue mount boundary probe");
  expect(
    await page
      .getByRole("navigation", { name: "Examples" })
      .getByRole("button")
      .count(),
  ).toBe(2);
  expect(await page.locator(".flowsvg-canvas > svg").count()).toBe(0);
  await page
    .getByRole("navigation", { name: "Examples" })
    .getByRole("button", { name: "Signal in motion", exact: true })
    .click();
  await expect
    .poll(() => page.locator(".flowsvg-canvas > svg").count())
    .toBe(1);
  expect(
    await page.getByRole("slider", { name: "Progress" }).inputValue(),
  ).toBe("1250");
  expect(
    await page.getByRole("button", { name: "Play", exact: true }).count(),
  ).toBe(1);
  expect(await page.getByRole("alert").isVisible()).toBe(false);
  expect(uncaughtErrors).toEqual([]);
}, 20_000);
