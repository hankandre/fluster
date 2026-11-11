import { expect, test, type Page } from "@playwright/test";
import { installMockServer, SERVER, type MockOptions } from "./support/mock-server";

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
      case "/Items/series-1":
        return json({ Id: "series-1", Name: "Great Show", Type: "Series", ProductionYear: 2016 });
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
  await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Search movies, series, and episodes" }).fill("great");
  await expect(page.getByRole("option", { name: /Great Show/ })).toBeVisible();
  expect(requests.some((url) => url.pathname === "/Search/Hints" && url.searchParams.get("searchTerm") === "great")).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Shows" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Great Movie, 2019" })).toBeVisible();
  expect(requests.some((url) => url.pathname === "/Items" && url.searchParams.get("searchTerm") === "great")).toBe(true);

  await page.getByRole("link", { name: "Great Show, 2016" }).click();
  await expect(page.getByRole("link", { name: "First Season Opener, Episode 1" })).toBeVisible();
});

// P13-12: the redesigned search page (DESIGN.md 7.13).

const COMBOBOX = "Search movies, series, and episodes";

async function signIn(page: Page, opts: MockOptions = {}): Promise<URL[]> {
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await installMockServer(page, opts);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(SERVER);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Home" }).waitFor({ timeout: 10_000 });
  return requests;
}

const searchRequests = (requests: URL[]) => requests.filter((url) => url.pathname === "/Items" && url.searchParams.has("searchTerm"));

test.describe("suggestions open what they name", () => {
  test("A: a movie suggestion opens its detail on click", async ({ page }) => {
    const requests = await signIn(page);
    await page.goto("/#/next/search");
    await page.getByRole("combobox", { name: COMBOBOX }).fill("long");
    await page.getByRole("option", { name: "The Long Quiet, 2023, Movie" }).click();
    await expect(page).toHaveURL(/#\/next\/item\/m1$/);
    await expect(page.getByRole("heading", { name: "The Long Quiet" })).toBeVisible();
    expect(searchRequests(requests)).toHaveLength(0);
  });

  test("B: an episode suggestion opens its detail from the keyboard", async ({ page }) => {
    const requests = await signIn(page);
    await page.goto("/#/next/search");
    await page.getByRole("combobox", { name: COMBOBOX }).fill("keeper");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/next\/item\/ep-2$/);
    expect(searchRequests(requests)).toHaveLength(0);
  });

  test("C: a series suggestion opens the series from the keyboard", async ({ page }) => {
    const requests = await signIn(page);
    await page.goto("/#/next/search");
    await page.getByRole("combobox", { name: COMBOBOX }).fill("harbor");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/next\/series\/s1$/);
    expect(searchRequests(requests)).toHaveLength(0);
  });

  test("D: a suggestion shows art, title, year, and type with combobox semantics", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/next/search");
    const combobox = page.getByRole("combobox", { name: COMBOBOX });
    await combobox.fill("the");
    const listbox = page.getByRole("listbox", { name: "Suggestions" });
    await expect(listbox).toBeVisible();
    await expect(combobox).toHaveAttribute("aria-expanded", "true");
    await expect(combobox).toHaveAttribute("aria-controls", (await listbox.getAttribute("id")) ?? "");
    const option = page.getByRole("option", { name: "The Long Quiet, 2023, Movie" });
    const src = (await option.locator("img").getAttribute("src")) ?? "";
    expect(src).toMatch(/\/Items\/m1\/Images\/Primary\?.*tag=tag-m1/);
    expect(src).not.toMatch(/api_key|token/i);
    await expect(option).toContainText("2023 · Movie");
    await page.keyboard.press("ArrowDown");
    await expect(combobox).toHaveAttribute("aria-activedescendant", (await option.getAttribute("id")) ?? "");
  });
});

test.describe("results", () => {
  test("E: groups render as horizontal rows and an episode opens its detail", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/next/search/o");
    const headings = page.locator("main h2");
    await expect(headings).toHaveText(["Movies", "Shows", "Episodes"]);
    await expect(page.locator("section.media-row .media-row-list")).toHaveCount(3);
    const episode = page.getByRole("link", { name: /The Keeper's Log/ });
    await expect(episode).toHaveAttribute("href", "#/next/item/ep-2");
    await episode.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/next\/item\/ep-2$/);
  });

  test("F: the start and no-results states", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/next/search");
    await expect(page.getByRole("heading", { name: "Search your libraries" })).toBeVisible();
    await page.goto("/#/next/search/zzzz");
    await expect(page.getByRole("heading", { name: 'No matches for "zzzz"' })).toBeVisible();
  });

  test("G: arrow keys move between the field and the rows", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/next/search/o");
    const combobox = page.getByRole("combobox", { name: COMBOBOX });
    await expect(combobox).toBeFocused();
    await expect(page.getByRole("link", { name: "The Long Quiet, 2023" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("section", { has: page.getByRole("heading", { name: "Movies" }) }).locator("[data-media-card]:focus")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("section", { has: page.getByRole("heading", { name: "Shows" }) }).locator("[data-media-card]:focus")).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(combobox).toBeFocused();
  });

  test("H: Load more fetches the next page and focuses a new card", async ({ page }) => {
    const requests = await signIn(page, { longSearch: true });
    await page.goto("/#/next/search/o");
    const loadMore = page.getByRole("button", { name: "Load more" });
    await expect(loadMore).toBeVisible();
    await loadMore.focus();
    const before = await page.locator("[data-media-card]").count();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-media-card]")).toHaveCount(before + 20);
    expect(searchRequests(requests).some((url) => url.searchParams.get("startIndex") === "40")).toBe(true);
    await expect(page.locator("[data-media-card]:focus")).toHaveCount(1);
    await expect(page.locator("[data-media-card]:focus")).toHaveAttribute("href", "#/next/item/m1-41");
  });
});

test.describe("the / shortcut", () => {
  test("I: / on Home opens Search with the field focused", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/next/home");
    const card = page.locator("[data-media-card]").first();
    await card.waitFor();
    await card.focus();
    await page.keyboard.press("/");
    await expect(page).toHaveURL(/#\/next\/search$/);
    const combobox = page.getByRole("combobox", { name: COMBOBOX });
    await expect(combobox).toBeFocused();
    await expect(combobox).toHaveValue("");
  });

  test("J: / on the results focuses the field, and a slash typed in it stays", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/next/search/o");
    const card = page.locator("[data-media-card]").first();
    await card.waitFor();
    await card.focus();
    await page.keyboard.press("/");
    const combobox = page.getByRole("combobox", { name: COMBOBOX });
    await expect(combobox).toBeFocused();
    await expect(page).toHaveURL(/#\/next\/search\/o$/);
    await page.keyboard.type("AC/DC");
    await expect(combobox).toHaveValue("AC/DC");
  });
});
