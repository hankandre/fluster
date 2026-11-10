import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

// Mocks a Jellyfin server whose search finds one movie and one series.
async function mockSearchServer(page: Page) {
  const requests: URL[] = [];
  await page.route(`${serverUrl}/**`, (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
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
        return json({ Items: [] });
      case "/UserItems/Resume":
      case "/Shows/NextUp":
        return json({ Items: [] });
      case "/Items/Latest":
        return json([]);
      case "/Search/Hints":
        return json({
          SearchHints: [
            { Id: "m1", Name: "Great Movie", Type: "Movie", ProductionYear: 2019 },
            { Id: "series-1", Name: "Great Show", Type: "Series", ProductionYear: 2016 },
          ],
          TotalRecordCount: 2,
        });
      case "/Items":
        return json({
          Items: [
            { Id: "m1", Name: "Great Movie", Type: "Movie", ProductionYear: 2019 },
            { Id: "series-1", Name: "Great Show", Type: "Series", ProductionYear: 2016 },
          ],
        });
      case "/Shows/series-1/Seasons":
        return json({ Items: [{ Id: "se1", Name: "Season 1", Type: "Season" }] });
      case "/Shows/series-1/Episodes":
        return json({ Items: [{ Id: "e1", Name: "First Season Opener", Type: "Episode", IndexNumber: 1 }] });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return requests;
}

test("search with type-ahead, submit the term, and open a series result", async ({ page }) => {
  const requests = await mockSearchServer(page);

  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();

  await page.getByRole("combobox", { name: "Search movies, series, and episodes" }).fill("great");
  await expect(page.getByRole("option", { name: /Great Show/ })).toBeVisible();
  expect(requests.some((url) => url.pathname === "/Search/Hints" && url.searchParams.get("searchTerm") === "great")).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Series" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Great Movie, 2019" })).toBeVisible();
  expect(requests.some((url) => url.pathname === "/Items" && url.searchParams.get("searchTerm") === "great")).toBe(true);

  await page.getByRole("link", { name: "Great Show, 2016" }).click();
  await expect(page.getByRole("link", { name: "First Season Opener, Episode 1" })).toBeVisible();
});
