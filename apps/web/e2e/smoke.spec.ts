import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Menu -> 1 player -> map 1, walk right while firing, and check the simulation advanced. */
async function playOneRun(page: Page): Promise<void> {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // Give the client a moment to finish booting before using the keyboard menus.
  await page.waitForTimeout(2000);
  await page.keyboard.press("1");
  await page.waitForTimeout(500);
  await page.keyboard.press("1");

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
  await expect(page.getByRole("heading", { name: /Kampung Pisang/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Versi 2D" })).toBeVisible();
  await page.getByRole("link", { name: "Main", exact: true }).click();
  await playOneRun(page);
  expect(errors).toEqual([]);
});

test("2D Phaser client still runs at /play2d", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/play2d");
  await playOneRun(page);
  expect(errors).toEqual([]);
});
