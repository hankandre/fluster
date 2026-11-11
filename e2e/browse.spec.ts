import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

const item = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({
  Id: id,
  Name: name,
  Type: type,
  ProductionYear: 2016,
  ...extra,
});

// Mocks a Jellyfin server with one library, a series with two seasons, and a collection.
async function mockBrowseServer(page: Page) {
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
        return json({ Items: [{ Id: "lib-1", Name: "Mixed Library", CollectionType: "movies" }] });
      case "/UserItems/Resume":
      case "/Shows/NextUp":
        return json({ Items: [] });
      case "/Items/Latest":
        return json([]);
      case "/Items":
        if (url.searchParams.get("parentId") === "box-1") {
          return json({ Items: [item("m-in-box", "Boxed Movie", "Movie")] });
        }
        return json({
          Items: [
            item("series-1", "Great Show", "Series"),
            item("box-1", "Great Saga", "BoxSet"),
            item("m1", "Plain Movie", "Movie"),
          ],
        });
      case "/Items/box-1":
        return json(item("box-1", "Great Saga", "BoxSet"));
      case "/Items/series-1":
        return json(item("series-1", "Great Show", "Series"));
      case "/Shows/series-1/Seasons":
        return json({ Items: [item("se1", "Season 1", "Season"), item("se2", "Season 2", "Season")] });
      case "/Shows/series-1/Episodes":
        return json({
          Items: url.searchParams.get("seasonId") === "se2"
            ? [item("e2", "Second Season Opener", "Episode", { IndexNumber: 1 })]
            : [item("e1", "First Season Opener", "Episode", { IndexNumber: 1 })],
        });
      default:
        return route.fulfill({ status: 404, headers: cors });
    }
  });
  return requests;
}

test("browse a library, sort, open a series and season, and open a collection", async ({ page }) => {
  const requests = await mockBrowseServer(page);

  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Mixed Library" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mixed Library" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plain Movie, 2016" })).toBeVisible();

  await page.getByRole("button", { name: /^Sort/ }).click();
  await page.getByRole("option", { name: "Newest added first" }).click();
  await expect.poll(() => requests.some((url) => url.pathname === "/Items"
    && url.searchParams.get("sortBy") === "DateCreated" && url.searchParams.get("sortOrder") === "Descending")).toBe(true);

  await page.getByRole("link", { name: "Great Show, 2016" }).click();
  await expect(page.getByRole("link", { name: "First Season Opener, Episode 1" })).toBeVisible();
  await page.getByRole("tab", { name: "Season 2" }).click();
  await expect(page.getByRole("tab", { name: "Season 2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Second Season Opener, Episode 1" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/next\/browse\/lib-1$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Mixed Library" }).click();
  await expect(page).toHaveURL(/#\/next\/browse\/lib-1$/);
  await page.getByRole("link", { name: "Great Saga, 2016" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Great Saga" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Boxed Movie, 2016" })).toBeVisible();
});
