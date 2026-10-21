/** Exercise the custom combobox through visible pointer actions in shared host and delivery checks. */
import type { Locator } from "playwright-core";

/** Open a named trigger and commit its visible option. */
export async function chooseOption(control: Locator, value: string): Promise<void> {
  await control.click();
  await control.locator("..").locator(`[role="option"][data-value="${value}"]`).click();
}
