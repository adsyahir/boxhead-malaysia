import { expect, test, type Browser, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Press the menu keys in order (3D: Start, 1 player, Abu, map 1; 2D: 1 player, map 1), walk right while
 * firing, and check the simulation advanced.
 */
async function playOneRun(page: Page, menuKeys: string[] = ["1", "1", "1", "1"]): Promise<void> {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // Give the client a moment to finish booting before using the keyboard menus.
  await page.waitForTimeout(2000);
  for (const key of menuKeys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
  }

  await expect(canvas).toHaveAttribute("data-scene", "Game", { timeout: 15_000 });
  const start = await canvas.getAttribute("data-players");
  await page.keyboard.down("d");
  await page.keyboard.down("f");
  await page.waitForTimeout(4000);
  await page.keyboard.up("d");
  await page.keyboard.up("f");

  const tick = Number(await canvas.getAttribute("data-tick"));
  expect(tick).toBeGreaterThan(60);
  const end = await canvas.getAttribute("data-players");
  expect(end).toMatch(/^\d+,\d+$/);
  expect(end).not.toEqual(start);
}

test("home loads, 3D client: 1P on Kampung Pisang runs for a few seconds without console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /kampung pisang/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Versi 2D" })).toBeVisible();
  await playOneRun(page);
  expect(errors).toEqual([]);
});

test("2D Phaser client still runs at /play2d", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/play2d");
  await playOneRun(page, ["1", "1"]);
  expect(errors).toEqual([]);
});

test("language switch Malay -> English persists across reloads", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Tetapan/ }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Start/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors).toEqual([]);
});

test("main menu flow: Start, mode, hero, map reach the game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Siti/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
});

test("exit to menu asks for confirmation and only leaves on yes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });

  await page.getByRole("button", { name: "Keluar ke Menu" }).first().click(); // HUD home button pauses and warns
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: /Batal/ }).click(); // keep playing
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(canvas).toHaveAttribute("data-scene", "Game");

  // Still paused after cancelling, so the pause screen's own Exit button is the one to press.
  await page.locator(".g3d-pause-actions").getByRole("button", { name: "Keluar ke Menu" }).click();
  await page.getByRole("button", { name: /Ya, keluar/ }).click();
  await expect(canvas).toHaveAttribute("data-scene", "Menu");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible();
});

test("pause menu opens How to Play and Settings without ending the run", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });

  await page.keyboard.press("Escape"); // pause
  const pause = page.locator(".g3d-pause-actions");
  await pause.getByRole("button", { name: "Cara Bermain" }).click();
  await expect(page.getByRole("heading", { name: "Cara Bermain" })).toBeVisible();
  await page.keyboard.press("Escape"); // closes Help, run still paused
  await pause.getByRole("button", { name: "Tetapan" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "Game");
  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".g3d-pause")).toBeHidden();
});

async function openOnline(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /Dalam Talian/ }).click();
  await page.getByLabel("Nama anda").fill(name);
  return page;
}

test("online: two players create, join, ready up, start and move in the same world", async ({ browser }) => {
  const host = await openOnline(browser, "Abu Test");
  await host.getByRole("button", { name: "Cipta bilik peribadi" }).click();
  const code = (await host.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);

  const guest = await openOnline(browser, "Siti Test");
  await guest.getByPlaceholder("KOD").fill(code);
  await guest.getByRole("button", { name: "Sertai", exact: true }).click();
  await expect(guest.getByTestId("room-code")).toHaveText(code);
  await expect(host.getByTestId("seat-1")).toContainText("Siti Test");

  // host cannot start until the guest is ready
  await expect(host.getByRole("button", { name: /Menunggu rakan bersedia/ })).toBeDisabled();
  await guest.getByRole("button", { name: "Saya sedia" }).click();
  await host.getByRole("button", { name: "Mula Permainan" }).click();

  const hc = host.locator("canvas");
  const gc = guest.locator("canvas");
  await expect(hc).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect(gc).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect(hc).toHaveAttribute("data-slot", "0");
  await expect(gc).toHaveAttribute("data-slot", "1");

  const xs = async (p: Page) => ((await p.locator("canvas").getAttribute("data-players")) ?? "").split("|").map((s) => Number(s.split(",")[0]));
  await expect.poll(async () => (await xs(host)).length).toBe(2);
  const before = await xs(host);

  await host.keyboard.down("d"); // host walks right, guest walks left
  await guest.keyboard.down("a");
  await host.waitForTimeout(2500);
  await host.keyboard.up("d");
  await guest.keyboard.up("a");
  await host.waitForTimeout(600);

  const [h0, h1] = await xs(host);
  const [g0, g1] = await xs(guest);
  expect(h0!).toBeGreaterThan(before[0]! + 100); // slot 0 moved right
  expect(h1!).toBeLessThan(before[1]! - 100); // slot 1 moved left
  // both clients show the same world, give or take network delay
  expect(Math.abs(h0! - g0!)).toBeLessThan(60);
  expect(Math.abs(h1! - g1!)).toBeLessThan(60);

  await host.context().close();
  await guest.context().close();
});

test("online: a room that does not exist, or a bad name, is refused with a clear message", async ({ browser }) => {
  const page = await openOnline(browser, "Abu Test");
  await page.getByPlaceholder("KOD").fill("ZZZZ");
  await page.getByRole("button", { name: "Sertai", exact: true }).click();
  await expect(page.locator(".g3d-error")).toContainText("Bilik tidak ditemui");

  await page.getByLabel("Nama anda").fill("ab");
  await expect(page.getByRole("button", { name: "Cipta bilik awam" })).toBeDisabled();
  await page.context().close();
});

test("online: a public room shows up in the list and can be joined from it", async ({ browser }) => {
  const host = await openOnline(browser, "Abu Test");
  await host.getByRole("button", { name: "Cipta bilik awam" }).click();
  const code = (await host.getByTestId("room-code").textContent())!.trim();

  const guest = await openOnline(browser, "Siti Test");
  const row = guest.locator(".g3d-roomrow", { hasText: code });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Abu Test");
  await row.getByRole("button", { name: "Sertai" }).click();
  await expect(guest.getByTestId("room-code")).toHaveText(code);
  await host.context().close();
  await guest.context().close();
});
