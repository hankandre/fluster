import { expect, type Page } from "@playwright/test";

// Reads both boxes in one page call, so a title that re-renders while the page settles cannot be missed.
export async function expectBackClearOfTitle(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => {
      const back = document.querySelector("[data-page-back] button")?.getBoundingClientRect();
      const title = Array.from(document.querySelectorAll("h1")).find((h1) => h1.getBoundingClientRect().height > 0)?.getBoundingClientRect();
      if (!back || !title) return "missing";
      const overlaps = back.left < title.right && title.left < back.right && back.top < title.bottom && title.top < back.bottom;
      return overlaps ? `overlap back=${back.left},${back.top},${back.width}x${back.height} title=${title.left},${title.top},${title.width}x${title.height}` : "clear";
    }))
    .toBe("clear");
}
