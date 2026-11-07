import { expect, test, type Page } from "@playwright/test";

const serverUrl = "http://127.0.0.1:8096";

// Mocks a Jellyfin server with Quick Connect. `approve()` flips the pending
// request to approved, as if the user entered the code on another device.
async function mockQuickConnectServer(page: Page) {
  const state = { approved: false, connectPolls: 0, authenticated: false };
  await page.route(`${serverUrl}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
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
