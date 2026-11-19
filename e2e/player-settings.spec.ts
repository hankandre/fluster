import { expect, test } from "@playwright/test";
import { currentTime, mockPlayerServer, moveTo, openArrival, startArrival, introAndOutro } from "./support/player-server";

const stoppedReports = (log: Awaited<ReturnType<typeof mockPlayerServer>>) => log.reports.filter((report) => report.path === "/Sessions/Playing/Stopped");

test("(b) Intros set to Skip automatically in the sheet skips the intro and says so", async ({ page }) => {
  await startArrival(page, true, { hasSegments: true, segments: introAndOutro });
  await page.keyboard.press("o");
  const sheet = page.getByRole("region", { name: "Player settings" });
  await sheet.getByRole("button", { name: "Playback" }).click();
  await sheet.getByRole("button", { name: /^What happens at an intro/ }).click();
  // Record the status text as it changes, so a loaded runner cannot miss the 2 s window between polls.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __saved: string[] }).__saved = seen;
    new MutationObserver(() => {
      for (const node of document.querySelectorAll(".settings-row-saved")) if (node.textContent) seen.push(node.textContent);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.getByRole("option", { name: "Skip automatically" }).click();
  const introRow = sheet.locator(".settings-row", { hasText: "Intros" });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __saved: string[] }).__saved)).toContain("✓ Saved");
  await expect(page.locator(".player-osd-pill", { hasText: "Intros:" })).toHaveCount(0);
  await expect(introRow.locator(".settings-row-saved")).toBeEmpty({ timeout: 6000 });
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("fluster.preferences") ?? "{}").skipModes)).toMatchObject({ intro: "auto" });

  await moveTo(page, 30);
  await expect.poll(() => currentTime(page)).toBe(70);
  await expect(page.getByText("Skipped intro")).toBeVisible();
});

test("(c) About & diagnostics opens while the video keeps playing, and Copy says Copied in its row", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await startArrival(page, true);
  const before = await currentTime(page);
  const settings = page.getByRole("button", { name: "Settings" });
  await settings.focus();
  await settings.click();
  const sheet = page.getByRole("region", { name: "Player settings" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "About & diagnostics" }).click();
  await expect(sheet.getByText("Version")).toBeVisible();
  await expect(sheet.getByText("Testfin").or(sheet.getByText("10.11.7"))).toBeVisible();
  await sheet.getByRole("button", { name: "Copy" }).click();
  await expect(sheet.locator(".settings-row", { hasText: "Copy diagnostics" }).getByText("Copied")).toBeVisible();
  await expect(page.getByText("Diagnostics copied")).toHaveCount(0);
  await expect(page.locator(".ui-toast")).toHaveCount(0);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split("\n")).toHaveLength(7);
  expect(await currentTime(page)).toBeGreaterThanOrEqual(before);
  expect(await page.locator("video").evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);

  await page.keyboard.press("Escape");
  await expect(sheet.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(settings).toBeFocused();
});

test("(d) Sign out from the sheet stops playback, shows sign-in, and revokes only after the Stopped report", async ({ page }) => {
  const log = await mockPlayerServer(page, { holdReports: true });
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await moveTo(page, 95);

  await page.keyboard.press("o");
  const sheet = page.getByRole("region", { name: "Player settings" });
  await sheet.getByRole("button", { name: "Account" }).click();
  await sheet.getByRole("button", { name: "Sign out" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Stop playback and sign out?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/#\/next\/sign-in$/);
  await expect(page.getByText("Signed out")).toBeVisible();
  // Reports are held, so nothing is revoked yet: the report that still needs the token goes first.
  await page.waitForTimeout(500);
  expect(log.sequence).not.toContain("POST /Sessions/Logout");
  log.releaseReports();
  await expect.poll(() => log.sequence.some((entry) => entry === "POST /Sessions/Logout")).toBe(true);
  await expect.poll(() => stoppedReports(log).length).toBe(1);
  const ticks = Number(stoppedReports(log)[0].body.PositionTicks) / 10_000_000;
  expect(ticks).toBeGreaterThan(90);
  expect(ticks).toBeLessThan(100);
  const stopped = log.sequence.findIndex((entry) => entry.startsWith("/Sessions/Playing/Stopped"));
  expect(stopped).toBeGreaterThanOrEqual(0);
  expect(stopped).toBeLessThan(log.sequence.indexOf("POST /Sessions/Logout"));
});

test("(d) Cancel on the sign-out confirm leaves playback running and the viewer signed in", async ({ page }) => {
  const log = await mockPlayerServer(page);
  await openArrival(page);
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("o");
  const sheet = page.getByRole("region", { name: "Player settings" });
  await sheet.getByRole("button", { name: "Account" }).click();
  await sheet.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeFocused();
  await expect(page).toHaveURL(/#\/next\/play\//);
  expect(stoppedReports(log)).toHaveLength(0);
  expect(log.sequence).not.toContain("POST /Sessions/Logout");
});
