import { expect, test, type Page } from '@playwright/test';
import { exportSheet, newHumanoidWithSprites } from './helpers';

/** Decodes the frame rectangle of both PNGs in the page and compares b[x, y] with a[w - 1 - x, y]. */
async function compareMirrored(page: Page, a: Buffer, b: Buffer, rect: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(
    async ({ a64, b64, rect }) => {
      const decode = async (b64: string) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        });
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
      };
      const pa = await decode(a64);
      const pb = await decode(b64);
      const at = (d: Uint8ClampedArray, x: number, y: number) => (y * rect.w + x) * 4;
      // Antialiased edges differ with the multisample pattern, which is not mirror-symmetric:
      // compare only interior pixels (all 3×3 neighbours of the mirrored reference share its alpha).
      const interior = (x: number, y: number) => {
        const alpha = pa[at(pa, rect.w - 1 - x, y) + 3];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= rect.w || ny >= rect.h) return false;
            if (pa[at(pa, rect.w - 1 - nx, ny) + 3] !== alpha) return false;
          }
        }
        return true;
      };
      let opaque = 0;
      let mismatched = 0;
      let identical = 0;
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          if (!interior(x, y)) continue;
          const ib = at(pb, x, y);
          const ia = at(pa, rect.w - 1 - x, y);
          if (pa[ia + 3] === 0) continue;
          opaque++;
          let diff = 0;
          let same = 0;
          for (let k = 0; k < 4; k++) {
            diff = Math.max(diff, Math.abs(pa[ia + k] - pb[ib + k]));
            same = Math.max(same, Math.abs(pa[ib + k] - pb[ib + k]));
          }
          if (diff > 8) mismatched++;
          if (same <= 8) identical++;
        }
      }
      return { opaque, mismatched, identical };
    },
    { a64: a.toString('base64'), b64: b.toString('base64'), rect },
  );
}

test('Spiegeln mirrors the exported sheet horizontally', async ({ page }) => {
  await newHumanoidWithSprites(page);
  await page.getByRole('button', { name: 'Animieren' }).click();
  await page.getByRole('button', { name: 'Aus Template' }).click();
  await page.getByRole('button', { name: 'walk', exact: true }).click();
  await expect(page.getByLabel('Animation').locator('option:checked')).toHaveText('walk');
  // The fixtures are left/right symmetric: shift and tilt the head so the frame is not.
  await page.evaluate(() => {
    const s = (window as any).__editor.getState();
    const img = Object.values(s.project.images).find((i: any) => i.name === 'head.png') as any;
    const part = s.project.parts.find((p: any) => p.imageId === img.id);
    s.updatePart(part.id, { x: part.x + 7, y: part.y + 9, rotation: part.rotation + 25 });
  });

  const plain = await exportSheet(page);

  const mirror = page.getByRole('button', { name: 'Spiegeln' });
  const mirrorSetting = () => page.evaluate(() => (window as any).__editor.getState().project.settings.mirror as boolean);
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');
  // M toggles the same project setting (and back).
  await page.keyboard.press('m');
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  expect(await mirrorSetting()).toBe(true);
  await page.keyboard.press('m');
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');
  await mirror.click();
  expect(await mirrorSetting()).toBe(true);
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');

  const mirrored = await exportSheet(page);

  // Same sheet size; the pivot (transformed origin) is mirrored inside the cell.
  expect(mirrored.meta.meta.size).toEqual(plain.meta.meta.size);
  const fa = plain.meta.frames['walk 0'].frame;
  const fb = mirrored.meta.frames['walk 0'].frame;
  expect(fb).toEqual(fa);
  expect(mirrored.meta.meta.pivot).toEqual({ x: fa.w - plain.meta.meta.pivot.x, y: plain.meta.meta.pivot.y });

  const r = await compareMirrored(page, plain.png, mirrored.png, fa);
  expect(r.opaque).toBeGreaterThan(100);
  // Frame 0 of the mirrored sheet is the horizontal mirror of the plain one (interior pixels) …
  expect(r.mismatched / r.opaque).toBeLessThan(0.005);
  // … and not simply the same picture.
  expect(r.identical / r.opaque).toBeLessThan(0.8);
});
