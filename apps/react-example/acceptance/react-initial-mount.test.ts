/** Initial effect failures must be contained without relying on the SDK's later onError callback. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { startShowcaseSite, type ShowcaseSite } from "../../../scripts/showcase-browser-site.js";

let site: ShowcaseSite;
beforeAll(async () => { site = await startShowcaseSite("flowsvg-react-example"); }, 120_000);
afterAll(async () => { await site?.close(); }, 30_000);

it("keeps navigation and the saved target usable when the first React adapter effect cannot mount", async () => {
  const page = site.page;
  await page.addInitScript(() => {
    const create = document.createElement.bind(document);
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "className")!;
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options);
      if (tag === "div") Object.defineProperty(element, "className", {
        configurable: true,
        get: () => descriptor.get!.call(element) as string,
        set: (value: string) => {
          if (value === "flowsvg-canvas") {
            document.createElement = create;
            throw new Error("Initial React canvas unavailable");
          }
          descriptor.set!.call(element, value);
        }
      });
      return element;
    }) as typeof document.createElement;
  });
  await page.goto(`${site.origin}/acceptance/?time=1250&theme=light`);
  await expect.poll(() => page.getByRole("alert").textContent()).toContain("Initial React canvas unavailable");
  expect(await page.locator(".flowsvg-canvas").count()).toBe(0);
  expect(await page.getByRole("navigation", { name: "Examples" }).getByRole("button").allTextContents()).toEqual(["Signal at rest", "Signal in motion"]);
  await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal in motion", exact: true }).click();
  await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("1250");
  expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("light");
  expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
  expect(await page.getByRole("alert").isVisible()).toBe(false);
}, 20_000);
