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

test("phone landscape: menu, heroes and maps fit on one screen; icon and manifest load", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const inView = async (name: RegExp) => {
    const b = await page.getByRole("button", { name }).boundingBox();
    expect(b, String(name)).not.toBeNull();
    expect(b!.y).toBeGreaterThanOrEqual(0);
    expect(b!.y + b!.height).toBeLessThanOrEqual(390);
  };
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  for (const n of [/Mula/, /Cara Bermain/, /Tetapan/, /Papan Markah/, /Kredit/]) await inView(n);
  const title = await page.locator(".g3d-title").boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  for (const n of [/Abu/, /Siti/, /Ah Meng/, /Mei Ling/, /Muthu/, /Kavitha/, /Hamid/, /Kiah/]) await inView(n);
  await page.getByRole("button", { name: /Abu/ }).click();
  for (const n of [/Kampung Pisang/, /Kebun Getah/, /Tanah Perkuburan/]) await inView(n);
  for (const path of ["/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/icon.svg"]) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
});

test("touch: dragging the Fire stick aims and shoots that way while the left stick walks", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/?debug");
  await page.getByRole("button", { name: /Mula/ }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect.poll(() => page.locator("canvas").getAttribute("data-tick").then(Number), { timeout: 10_000 }).toBeGreaterThan(30);
  const res = await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const layer = document.querySelector(".g3d-touch")!;
    const r = layer.getBoundingClientRect();
    const fire = { x: r.left + r.width - 90, y: r.top + r.height - 100 };
    const stick = { x: r.left + 110, y: r.top + r.height - 110 };
    const ev = (type: string, id: number, x: number, y: number) =>
      layer.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    const world = () => (window as unknown as { __kppWorld(): { players: { x: number; facing: { x: number; y: number } }[]; projectiles: { vx: number; vy: number }[] } }).__kppWorld();
    const x0 = world().players[0]!.x;
    ev("pointerdown", 1, stick.x, stick.y);
    ev("pointermove", 1, stick.x + 50, stick.y); // walk right
    ev("pointerdown", 2, fire.x, fire.y);
    ev("pointermove", 2, fire.x, fire.y - 50); // aim up
    await wait(700);
    const w = world();
    const out = {
      moved: w.players[0]!.x - x0,
      facing: w.players[0]!.facing,
      upShots: w.projectiles.filter((b) => b.vy < 0 && Math.abs(b.vx) < 1).length,
      knob: document.querySelector(".g3d-knob.aim") !== null,
    };
    ev("pointerup", 1, 0, 0);
    ev("pointerup", 2, 0, 0);
    return out;
  });
  expect(res.moved).toBeGreaterThan(40);
  expect(res.facing.x).toBeCloseTo(0, 3);
  expect(res.facing.y).toBeCloseTo(-1, 3);
  expect(res.upShots).toBeGreaterThan(0);
  expect(res.knob).toBe(true);
  await ctx.close();
});

test("desktop: the hero aims at the mouse and left click fires", async ({ page }) => {
  await page.goto("/?debug");
  await page.getByRole("button", { name: /Mula/ }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect.poll(() => canvas.getAttribute("data-tick").then(Number), { timeout: 10_000 }).toBeGreaterThan(30);
  type W = { players: { facing: { x: number; y: number } }[]; projectiles: { vx: number; vy: number }[] };
  const world = () => page.evaluate(() => (window as unknown as { __kppWorld(): W }).__kppWorld());
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // The camera keeps the hero near the middle: point the mouse well to the right, then well above.
  await page.mouse.move(cx + box.width * 0.4, cy);
  await expect.poll(async () => (await world()).players[0]!.facing.x, { timeout: 5000 }).toBeGreaterThan(0.9);
  await expect(canvas).toHaveCSS("cursor", "crosshair");
  await page.mouse.move(cx, box.y + 20);
  await expect.poll(async () => (await world()).players[0]!.facing.y, { timeout: 5000 }).toBeLessThan(-0.85);

  await page.mouse.down();
  await expect.poll(async () => (await world()).projectiles.filter((p) => p.vy < 0).length, { timeout: 5000 }).toBeGreaterThan(0);
  await page.mouse.up();
});

test("Settings: the performance display switches on and shows FPS in a run, and no ping offline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Tetapan/ }).click({ timeout: 30_000 });
  const toggle = page.locator(".g3d-row", { hasText: "Paparan prestasi" }).getByRole("button");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Siap" }).click();
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect(page.getByTestId("perf")).toContainText(/FPS\s*\d+/, { timeout: 5000 });
  await expect(page.getByTestId("perf-ping")).toHaveCount(0);
});

test("mode screen has 1 Player and Online only (no local 2 player)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Mula/ }).click({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /1 Pemain/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dalam Talian/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /2 Pemain/ })).toHaveCount(0);
  await page.keyboard.press("2"); // key 2 is Online now
  await expect(page.getByLabel("Nama anda")).toBeVisible();
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

  await page.keyboard.press("Escape"); // pause, then Exit from the pause menu warns before leaving
  await page.locator(".g3d-pause-actions").getByRole("button", { name: "Keluar ke Menu" }).click();
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

async function openOnline(browser: Browser, name: string, settings?: Record<string, unknown>): Promise<Page> {
  const ctx = await browser.newContext();
  if (settings) await ctx.addInitScript((v) => localStorage.setItem("kpp-settings", v), JSON.stringify(settings));
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
  // your own hero is predicted locally (reacts at once); the server position corrects it gently
  await expect(hc).toHaveAttribute("data-predict", "on", { timeout: 10_000 });
  await expect(gc).toHaveAttribute("data-predict", "on", { timeout: 10_000 });

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

test("online: the performance display shows ping to the room server", async ({ browser }) => {
  const host = await openOnline(browser, "Ping Host", { perf: true });
  await host.getByRole("button", { name: "Cipta bilik peribadi" }).click();
  const code = (await host.getByTestId("room-code").textContent())!.trim();
  const guest = await openOnline(browser, "Ping Guest");
  await guest.getByPlaceholder("KOD").fill(code);
  await guest.getByRole("button", { name: "Sertai", exact: true }).click();
  await guest.getByRole("button", { name: "Saya sedia" }).click();
  await host.getByRole("button", { name: "Mula Permainan" }).click();
  await expect(host.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });

  const perf = host.getByTestId("perf");
  await expect(perf).toContainText("FPS");
  await expect(host.getByTestId("perf-ping")).toHaveText(/^\d+ ms$/, { timeout: 10_000 }); // first ping after ~2 s
  await expect(perf).toContainText("Kemas kini");
  await expect(guest.getByTestId("perf")).toHaveCount(0); // off unless switched on
  await host.context().close();
  await guest.context().close();
});

test("upgrade list shows every level from How to Play", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Cara Bermain/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Cara Bermain/ }).click();
  await page.getByRole("button", { name: "Lihat senarai naik taraf" }).click();
  await expect(page.getByRole("heading", { name: "Senarai Naik Taraf" })).toBeVisible();
  await expect(page.locator(".g3d-upgrades li")).toHaveCount(58);
  await expect(page.locator(".g3d-upgrades li", { hasText: "Senjata baru: Uzi (kekunci 2)" })).toContainText("5");
  await expect(page.locator(".g3d-upgrades li", { hasText: "Senjata baru: Senapang Kilat (kekunci 0)" })).toContainText("70");
  await expect(page.locator(".g3d-upgrades li").last()).toContainText("Senapang Kilat+: Jarak Jauh");
  await page.keyboard.press("Escape"); // back to How to Play
  await expect(page.getByRole("heading", { name: "Cara Bermain" })).toBeVisible();
});

test("number keys pick weapons directly and the HUD shows the team level", async ({ page }) => {
  await page.goto("/?debug");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect(page.locator(".g3d-level")).toContainText("Tahap 1");

  // give the team level 5 (Uzi) without grinding kills
  await page.evaluate(() => {
    const w = (window as unknown as { __kppWorld: () => { level: number; unlocked: string[]; players: { ammo: Record<string, number> }[] } }).__kppWorld();
    w.level = 5;
    w.unlocked.push("uzi");
    w.players[0]!.ammo.uzi = 60;
  });
  await expect(page.locator(".g3d-level")).toContainText("Tahap 5");
  await expect(page.locator(".g3d-unlocks span.cur")).toContainText("1.Lastik");
  await page.keyboard.press("2");
  await expect(page.locator(".g3d-unlocks span.cur")).toContainText("2.Uzi");
  await page.keyboard.press("5"); // Bom Ikan is not unlocked: ignored
  await page.waitForTimeout(300);
  await expect(page.locator(".g3d-unlocks span.cur")).toContainText("2.Uzi");
  await page.keyboard.press("1");
  await expect(page.locator(".g3d-unlocks span.cur")).toContainText("1.Lastik");
});

test("menu soundscape waits for a key press, then plays; the game stays quiet until ghosts are near", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?debug");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => typeof (window as unknown as { __kppAudio?: unknown }).__kppAudio === "function");
  const audio = () => page.evaluate(() => (window as unknown as { __kppAudio: () => { ready: boolean; ambience: boolean; level: number; dread: { intensity: number; beats: number } } }).__kppAudio());

  // browsers keep a page silent until the first gesture; the menu says how to turn it on
  expect((await audio()).ready).toBe(false);
  await expect(page.getByText(/Ketik skrin atau tekan satu kekunci/)).toBeVisible();
  await page.keyboard.press("Shift");
  await expect.poll(async () => (await audio()).ambience).toBe(true);
  await expect(page.getByText(/Ketik skrin atau tekan satu kekunci/)).toBeHidden();
  await expect.poll(async () => (await audio()).level, { timeout: 15_000 }).toBeGreaterThan(0.001); // real sound reaches the output

  // into a game: the soundscape stops, and with no enemy close there is no dread
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await expect.poll(async () => (await audio()).ambience).toBe(false);
  expect((await audio()).dread.intensity).toBe(0);

  // a ghost right next to the hero: dread rises and the heart starts beating
  await page.evaluate(() => {
    const w = (window as unknown as { __kppWorld: () => { queue: unknown[]; phase: string; enemies: unknown[]; players: { x: number; y: number }[] } }).__kppWorld();
    w.queue = [];
    w.phase = "wave";
    const p = w.players[0]!;
    w.enemies = [{ id: 7001, kind: "pocong", x: p.x + 90, y: p.y, radius: 11, hp: 100000, maxHp: 100000, speed: 0, contactDamage: 0, points: 0, rise: 0, attackCd: 0, fireCd: 99, hop: 0, kx: 0, ky: 0 }];
  });
  await expect.poll(async () => (await audio()).dread.intensity).toBeGreaterThan(0.5);
  await expect.poll(async () => (await audio()).dread.beats, { timeout: 10_000 }).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test("keyboard: Tab shows a visible focus ring, and small controls are at least 44px", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, style: cs.outlineStyle, width: cs.outlineWidth };
  });
  expect(ring.tag).toBe("BUTTON");
  expect(ring.style).not.toBe("none");
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(3);

  await page.getByRole("button", { name: /Tetapan/ }).click();
  for (const sel of [".lang-switch button", ".g3d-chip", ".g3d-back", ".g3d-btn.slim"]) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box, sel).not.toBeNull();
    expect(box!.height, `${sel} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${sel} width`).toBeGreaterThanOrEqual(44);
  }
});

test("pause menu is a dialog: focus moves into it, Esc closes it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await page.keyboard.press("Escape");
  const dialog = page.getByRole("dialog", { name: "JEDA" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("online lobby: every control works (copy, map, hero, leave)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const host = await ctx.newPage();
  await host.goto("/");
  await host.getByRole("button", { name: /Mula/ }).click({ timeout: 30_000 });
  await host.getByRole("button", { name: /Dalam Talian/ }).click();
  await host.getByLabel("Nama anda").fill("Abu Test");
  await host.getByRole("button", { name: "Muat semula" }).click(); // refresh the room list: no error, list stays sensible
  await host.getByRole("button", { name: "Cipta bilik peribadi" }).click();
  const code = (await host.getByTestId("room-code").textContent())!.trim();

  await host.getByRole("button", { name: "Salin kod" }).click();
  await expect(host.getByRole("button", { name: "Disalin!" }).first()).toBeVisible();
  expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await host.getByRole("button", { name: "Salin pautan" }).click();
  expect(await host.evaluate(() => navigator.clipboard.readText())).toContain(`/?room=${code}`);

  await host.getByRole("button", { name: "Kebun Getah" }).click();
  await expect(host.getByRole("button", { name: "Kebun Getah" })).toHaveAttribute("aria-pressed", "true");
  await expect(host.getByRole("button", { name: "Kampung Pisang" })).toHaveAttribute("aria-pressed", "false");

  await host.getByRole("button", { name: "Siti", exact: true }).click();
  await expect(host.getByTestId("seat-0")).toContainText("Siti");

  await host.getByRole("button", { name: "Keluar bilik" }).click();
  await expect(host.getByRole("heading", { name: "Main Dalam Talian" })).toBeVisible();
  await ctx.close();
});

const API = "http://localhost:8787";
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
// A wave-1 run the game can produce: 8 pocong, 10 s (the shortest a wave can take), 3,000 points.
const run = { nickname: "Api Tester", score: 3000, wave: 1, kills: 8, map: "kampung-pisang", mode: "1p", durationMs: 10_000 };
/** Headers the game page sends; the server refuses score posts without its Origin. */
const fromGame = (ip: string) => ({ origin: "http://localhost:3100", "cf-connecting-ip": ip });
const NO_TICKET = "00000000-0000-4000-8000-000000000000";

test("leaderboard API: tickets, real play time, cheats refused, rate limit, best first", async ({ request }) => {
  const ip = randomIp();
  const ticket = async (from = ip) => {
    const r = await request.post(`${API}/api/runs`, { data: { map: "kampung-pisang" }, headers: fromGame(from) });
    expect(r.status()).toBe(201);
    return ((await r.json()) as { ticket: string }).ticket;
  };
  const post = (body: unknown, h: Record<string, string> = fromGame(ip)) => request.post(`${API}/api/scores`, { data: body, headers: h });

  // Not from the game page: no Origin (curl, scripts), another site, or a cross-site browser request.
  expect((await post({ ...run, ticket: NO_TICKET }, { "cf-connecting-ip": ip })).status()).toBe(403);
  expect((await post({ ...run, ticket: NO_TICKET }, { ...fromGame(ip), origin: "https://evil.example" })).status()).toBe(403);
  expect((await post({ ...run, ticket: NO_TICKET }, { ...fromGame(ip), "sec-fetch-site": "cross-site" })).status()).toBe(403);
  expect((await request.post(`${API}/api/runs`, { data: { map: "kampung-pisang" } })).status()).toBe(403);

  // Edited numbers fail the rules before any ticket is looked at.
  for (const bad of [{ score: 99_999_999 }, { durationMs: 1000 }, { mode: "online" }, { nickname: "ab" }, { nickname: "kote" }, { score: 3003 }, { score: 900_000 }])
    expect((await post({ ...run, ...bad, ticket: NO_TICKET })).status(), JSON.stringify(bad)).toBe(400);
  expect((await post({ ...run, ticket: NO_TICKET })).status()).toBe(400); // made-up ticket

  // A real ticket, sent at once: the run cannot have lasted 10 s yet.
  const early = await ticket();
  const tooSoon = await post({ ...run, ticket: early });
  expect(tooSoon.status()).toBe(400);
  expect(((await tooSoon.json()) as { reason: string }).reason).toBe("Sent sooner than the run could have lasted");

  // Tickets for the next submits, then wait the run's length as a player would.
  const tickets = await Promise.all([ticket(), ticket(), ticket(), ticket(), ticket(), ticket()]);
  const other = await ticket(randomIp());
  await new Promise((r) => setTimeout(r, 8_000));

  const ok = await post({ ...run, nickname: `Api${Date.now() % 1_000_000}`, score: 5550, ticket: tickets[0] });
  expect(ok.status()).toBe(201);
  expect((await post({ ...run, score: 5540, ticket: tickets[0] })).status()).toBe(400); // a ticket works once

  const list = await request.get(`${API}/api/scores?map=kampung-pisang&mode=1p&limit=100`);
  expect(list.status()).toBe(200);
  expect(list.headers()["cache-control"]).toContain("max-age=30");
  const { scores } = (await list.json()) as { scores: { rank: number; score: number }[] };
  expect(scores.some((s) => s.score === 5550)).toBe(true);
  for (let i = 1; i < scores.length; i++) expect(scores[i - 1]!.score).toBeGreaterThanOrEqual(scores[i]!.score);

  // the same sender gets 5 stored scores a minute (1 already used above)
  for (let i = 1; i <= 4; i++) expect((await post({ ...run, score: 3000 + i * 10, ticket: tickets[i] })).status()).toBe(201);
  expect((await post({ ...run, score: 3500, ticket: tickets[5] })).status()).toBe(429);
  expect((await request.post(`${API}/api/scores`, { data: { ...run, score: 3500, ticket: other }, headers: fromGame(randomIp()) })).status()).toBe(201); // someone else is fine
});

test("game over: submit a score with a nickname, then find it on the leaderboard", async ({ page }) => {
  await page.goto("/?debug");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });

  // end the run with a result the game can produce: 10 s played, 3 pocong in a row (100 x combo 1+2+3).
  // The server only takes it once 10 s have really passed since the run's ticket, so play that long first.
  await page.waitForTimeout(8_000);
  await page.evaluate(() => {
    const w = (window as unknown as { __kppWorld: () => { time: number; kills: number; score: number; players: { hp: number; alive: boolean }[] } }).__kppWorld();
    w.time = 10;
    w.kills = 3;
    w.score = 600;
    w.players[0]!.hp = 0;
    w.players[0]!.alive = false;
  });
  await expect(page.getByRole("heading", { name: "TAMAT" })).toBeVisible({ timeout: 15_000 });

  const nick = `E2E ${String(Date.now()).slice(-6)}`;
  await expect(page.getByRole("button", { name: "Hantar markah" })).toBeDisabled(); // no name yet
  await page.getByLabel("Nama anda").fill(nick);
  await page.getByRole("button", { name: "Hantar markah" }).click();
  await expect(page.getByText(/Markah dihantar\. Kedudukan anda: #\d+/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Lihat Papan Markah" }).click();
  await expect(page.getByRole("heading", { name: "Papan Markah" })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(nick) })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("row", { name: new RegExp(nick) })).toContainText("600");
});

test("game over: a failed submit says so and can be retried with the run kept", async ({ page }) => {
  await page.goto("/?debug");
  await expect(page.getByRole("button", { name: /Mula/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Mula/ }).click();
  await page.getByRole("button", { name: /1 Pemain/ }).click();
  await page.getByRole("button", { name: /Abu/ }).click();
  await page.getByRole("button", { name: /Kampung Pisang/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "Game", { timeout: 20_000 });
  await page.waitForTimeout(8_000);
  await page.evaluate(() => {
    const w = (window as unknown as { __kppWorld: () => { time: number; kills: number; score: number; players: { hp: number; alive: boolean }[] } }).__kppWorld();
    w.time = 10;
    w.kills = 3;
    w.score = 300;
    w.players[0]!.hp = 0;
    w.players[0]!.alive = false;
  });
  await expect(page.getByRole("heading", { name: "TAMAT" })).toBeVisible({ timeout: 15_000 });

  await page.route("**/api/scores", (r) => r.abort());
  await page.getByLabel("Nama anda").fill(`Retry ${String(Date.now()).slice(-5)}`);
  await page.getByRole("button", { name: "Hantar markah" }).click();
  await expect(page.locator(".g3d-error")).toContainText("Tak dapat hantar markah, cuba lagi");

  await page.unroute("**/api/scores");
  await page.getByRole("button", { name: "Cuba lagi" }).click();
  await expect(page.getByText(/Markah dihantar/)).toBeVisible({ timeout: 15_000 });
});

test("leaderboard page: loading, empty and error states, with a retry", async ({ page }) => {
  await page.route("**/api/scores?*", (r) => r.abort());
  await page.goto("/leaderboard");
  await expect(page.locator(".g3d-error")).toContainText("Tidak dapat memuatkan papan markah");
  await page.unroute("**/api/scores?*");

  await page.route("**/api/scores?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scores: [] }) }));
  await page.getByRole("button", { name: "Cuba lagi" }).click();
  await expect(page.getByText("Belum ada markah di sini")).toBeVisible();

  await page.getByRole("button", { name: "Dalam Talian" }).click();
  await page.getByRole("button", { name: "Kebun Getah" }).click();
  await expect(page.getByRole("button", { name: "Kebun Getah" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Dalam Talian" })).toHaveAttribute("aria-pressed", "true");
});
