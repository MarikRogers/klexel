import { expect, test, type Page } from '@playwright/test';
import { exportSheet, newHumanoidWithSprites } from './helpers';

const orbit = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__editor.getState().orbit as {
        yaw: number;
        pitch: number;
      },
  );

/** Screenshot of the viewport canvases; the floating orbit panel is masked (its pressed state changes). */
const shot = (page: Page) =>
  page
    .locator('.center canvas')
    .nth(1)
    .screenshot({ mask: [page.getByRole('group', { name: 'Ansicht' })] });

const MAX_STABLE_SHOT_ATTEMPTS = 10;

/** Waits until two consecutive viewport screenshots agree (the view is drawn on the next animation frame). */
async function stableShot(page: Page): Promise<Buffer> {
  let last = await shot(page);
  for (let attempt = 0; attempt < MAX_STABLE_SHOT_ATTEMPTS; attempt++) {
    const next = await shot(page);
    if (next.equals(last)) return next;
    last = next;
  }
  throw new Error(`stableShot: viewport still changing after ${MAX_STABLE_SHOT_ATTEMPTS} attempts`);
}

test('right-drag orbits the view without a context menu; Vorne restores the front view', async ({ page }) => {
  await newHumanoidWithSprites(page);
  await page.evaluate(() => {
    (window as any).__menus = [];
    window.addEventListener('contextmenu', (e) => (window as any).__menus.push(e.defaultPrevented));
  });
  const front = await stableShot(page);

  const box = (await page.locator('.center canvas').nth(1).boundingBox())!;
  const c = { x: box.x + box.width / 2 - 60, y: box.y + box.height / 2 + 40 };
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 8; i++) await page.mouse.move(c.x + i * 12, c.y - i * 5);
  await page.mouse.up({ button: 'right' });

  const turned = await orbit(page);
  expect(turned.yaw).not.toBe(0);
  expect(turned.pitch).not.toBe(0);
  await expect(page.getByTestId('orbit-angles')).toHaveText(`${turned.yaw}° / ${turned.pitch}°`);
  // every context menu event in the viewport was suppressed
  expect(await page.evaluate(() => (window as any).__menus.every((p: boolean) => p))).toBe(true);
  // The browser context menu stays available on the orbit panel (e.g. paste into Ebenenabstand).
  expect(
    await page.getByLabel('Ebenenabstand').evaluate((el) => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    }),
  ).toBe(false);
  expect((await stableShot(page)).equals(front)).toBe(false);

  await page.getByRole('button', { name: 'Vorne' }).click();
  expect(await orbit(page)).toEqual({ yaw: 0, pitch: 0 });
  expect((await stableShot(page)).equals(front)).toBe(true);
});

test('orbit buttons and Ebenenabstand change the view; export ignores the orbit', async ({ page }) => {
  await newHumanoidWithSprites(page);
  await page.getByRole('button', { name: 'Animieren' }).click();
  await page.getByRole('button', { name: 'Aus Template' }).click();
  await page.getByRole('button', { name: 'walk', exact: true }).click();
  await expect(page.getByLabel('Animation').locator('option:checked')).toHaveText('walk');

  const plain = await exportSheet(page);

  await page.getByRole('button', { name: 'Seite' }).click();
  expect(await orbit(page)).toEqual({ yaw: 90, pitch: 0 });
  await page.getByRole('button', { name: 'Orbit hoch' }).click();
  await page.getByRole('button', { name: 'Orbit links' }).click();
  expect(await orbit(page)).toEqual({ yaw: 75, pitch: 15 });
  await page.getByLabel('Ebenenabstand').fill('30');
  await page.getByLabel('Ebenenabstand').press('Enter');
  expect(await page.evaluate(() => (window as any).__editor.getState().layerSpacing)).toBe(30);

  const turned = await exportSheet(page);
  expect(await orbit(page)).toEqual({ yaw: 75, pitch: 15 });
  expect(turned.meta).toEqual(plain.meta);
  expect(turned.png.equals(plain.png)).toBe(true);
});

test('orbit keys work from the page; the toolbar still fits in one row at 1366 px', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await newHumanoidWithSprites(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('w');
  expect(await orbit(page)).toEqual({ yaw: 0, pitch: 15 });
  await page.keyboard.press('Numpad3');
  expect(await orbit(page)).toEqual({ yaw: 90, pitch: 0 });
  await page.keyboard.press('7');
  expect(await orbit(page)).toEqual({ yaw: 0, pitch: 90 });
  await page.keyboard.press('1');
  expect(await orbit(page)).toEqual({ yaw: 0, pitch: 0 });

  const toolbar = page.locator('.toolbar');
  const { scroll, client } = await toolbar.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
});
