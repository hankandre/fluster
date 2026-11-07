import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

// A 1x1 transparent GIF, served for every image request.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  Id: id,
  Name: name,
  Type: "Movie",
  ProductionYear: 2016,
  ImageTags: { Primary: `${id}-tag` },
  PrimaryImageAspectRatio: 0.667,
  ...extra,
});

// Mocks a Jellyfin server whose Quick Connect request is already approved.
async function mockHomeServer(page: Page) {
  const requests: string[] = [];
  await page.route(`${serverUrl}/**`, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/Items/") && url.pathname.includes("/Images/")) {
      return route.fulfill({ status: 200, headers: cors, contentType: "image/gif", body: PIXEL });
    }
    switch (url.pathname) {
      case "/System/Info/Public":
        return json({ ServerName: "Testfin", Version: "10.11.7", Id: "server-1" });
      case "/QuickConnect/Enabled":
        return json(true);
      case "/QuickConnect/Initiate":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: false });
      case "/QuickConnect/Connect":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: true });
      case "/Users/AuthenticateWithQuickConnect":
        return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Tester" } });
      case "/UserViews":
        return json({ Items: [{ Id: "lib-1", Name: "Movies", CollectionType: "movies" }, { Id: "lib-2", Name: "Music", CollectionType: "music" }] });
      case "/UserItems/Resume":
        return json({ Items: [card("movie-1", "Half Watched", { RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 500 } })] });
      case "/Shows/NextUp":
        return json({ Items: [card("ep-1", "Pilot", { Type: "Episode", SeriesName: "Great Show", ParentIndexNumber: 1, IndexNumber: 2 })] });
      case "/Items/Latest":
        return json([card("movie-2", "Brand New")]);
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return requests;
}

test("signing in shows Continue Watching, Next Up, and Latest rows with cards", async ({ page }) => {
  const requests = await mockHomeServer(page);

  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });

  await expect(page.getByRole("heading", { name: "Continue Watching" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Half Watched, 2016" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Watched" })).toHaveAttribute("aria-valuenow", "50");

  await expect(page.getByRole("heading", { name: "Next Up" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Great Show, S1E2 · Pilot" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Latest in Movies" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Brand New, 2016" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Latest in Music/ })).toHaveCount(0);

  await expect(page.getByTestId("card-image").first()).toHaveAttribute("data-state", "loaded");
  expect(requests.some((path) => path.includes("/Images/Primary?tag=movie-2-tag"))).toBe(true);
  expect(requests.filter((path) => path.includes("/Images/")).every((path) => !/api_key|token/i.test(path))).toBe(true);

  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Half Watched, 2016" }).focus();
  await expect(page.getByRole("button", { name: "Half Watched, 2016" })).toBeFocused();
});
