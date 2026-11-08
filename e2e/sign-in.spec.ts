import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";
// Playwright answers this route itself, so no private address is contacted.
const lanServerUrl = "http://192.168.50.10:8096";

// Mocks a Jellyfin server with Quick Connect. `approve()` flips the pending
// request to approved, as if the user entered the code on another device.
async function mockQuickConnectServer(page: Page, origin = serverUrl) {
  const state = { approved: false, connectPolls: 0, authenticated: false, paths: [] as string[] };
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "OPTIONS") state.paths.push(path);
    const json = (body: unknown) => route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    switch (path) {
      case "/System/Info/Public":
        return json({ ServerName: "Testfin", Version: "10.11.7", Id: "server-1" });
      case "/QuickConnect/Enabled":
        return json(true);
      case "/QuickConnect/Initiate":
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: false });
      case "/QuickConnect/Connect":
        state.connectPolls += 1;
        return json({ Secret: "e2e-secret", Code: "482913", Authenticated: state.approved });
      case "/Users/AuthenticateWithQuickConnect":
        state.authenticated = true;
        return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Tester" } });
      default:
        return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } });
    }
  });
  return state;
}

async function startQuickConnect(page: Page) {
  await page.goto("/#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.getByLabel("Server URL").fill(serverUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("quick-connect-code")).toHaveText("482913");
  await expect(page.getByText("Waiting for approval…")).toBeVisible();
}

test("Quick Connect approval signs in and opens Home", async ({ page }) => {
  const state = await mockQuickConnectServer(page);
  await startQuickConnect(page);

  state.approved = true;
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 8_000 });
  expect(state.authenticated).toBe(true);
  expect(page.url()).toContain("#/next/home");
});

test("Cancel stops Quick Connect polling", async ({ page }) => {
  const state = await mockQuickConnectServer(page);
  await startQuickConnect(page);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Server URL")).toBeVisible();
  const pollsAtCancel = state.connectPolls;
  await page.waitForTimeout(4_500);
  expect(state.connectPolls).toBe(pollsAtCancel);
  expect(state.authenticated).toBe(false);
});

test("a private-LAN HTTP server asks once before signing in", async ({ page }) => {
  const state = await mockQuickConnectServer(page, lanServerUrl);
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill(lanServerUrl);
  await page.keyboard.press("Enter");

  const warning = page.getByRole("alertdialog", { name: "This server uses an unencrypted connection." });
  await expect(warning).toContainText(`Fluster will remember this choice for “Testfin” at ${lanServerUrl}.`);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(state.paths).toEqual(["/System/Info/Public"]);

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.getByLabel("Server URL").fill(lanServerUrl);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Connect without encryption" }).click();
  await expect(page.getByTestId("quick-connect-code")).toHaveText("482913");

  // The choice is remembered for this server Id and origin.
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Server URL").fill(lanServerUrl);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("quick-connect-code")).toHaveText("482913");
  await expect(warning).toHaveCount(0);
});

test("a public HTTP server is refused without any request", async ({ page }) => {
  const requests: string[] = [];
  await page.route("http://media.example/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/#/next/sign-in");
  await page.getByLabel("Server URL").fill("http://media.example");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("plain HTTP on the internet");
  expect(requests).toEqual([]);
});

test("the app opens on manual server connection with a browser-mode label", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/next\/sign-in$/);
  await expect(page.getByLabel("Server URL")).toHaveAttribute("type", "url");
  await expect(page.getByText("Browser development mode")).toBeVisible();
});

// UDP discovery needs the desktop shell; browser mode has no way to send it.
test("browser mode hides Find servers on this network", async ({ page }) => {
  await page.goto("/#/next/sign-in");
  await expect(page.getByLabel("Server URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find servers on this network" })).toHaveCount(0);
});
