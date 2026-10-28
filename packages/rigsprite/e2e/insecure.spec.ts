import { expect, test } from '@playwright/test';
import { newHumanoid, SPRITE_FIXTURES } from './helpers';

// Plain http on a LAN IP is a non-secure context: crypto.randomUUID is undefined there.
test('works without crypto.randomUUID (non-secure context)', async ({ page }) => {
  await page.addInitScript(() => {
    delete (crypto as any).randomUUID;
    Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
  });
  await newHumanoid(page);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).not.toBe('function');

  await page.getByLabel('Sprites hochladen').setInputFiles(SPRITE_FIXTURES);
  await expect(page.getByTestId('sprite-head.png').locator('.sprite-bone')).toHaveText('head');
  await expect(page.getByTestId('sprite-torso.png')).toBeVisible();

  await page.getByRole('button', { name: 'Animieren' }).click();
  await page.getByRole('button', { name: 'Aus Template' }).click();
  await page.getByRole('button', { name: 'walk', exact: true }).click();
  await expect(page.getByLabel('Animation').locator('option:checked')).toHaveText('walk');

  const canvas = page.locator('.center canvas').nth(1);
  const shot = (await canvas.screenshot()).toString('base64');
  const nonBg = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] !== 0x2b || d[i + 1] !== 0x2b || d[i + 2] !== 0x2b) n++;
    return n;
  }, shot);
  expect(nonBg).toBeGreaterThan(50);
});
