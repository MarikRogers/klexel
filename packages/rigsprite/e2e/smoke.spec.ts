import { expect, test, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newHumanoidWithSprites } from './helpers';

test('new humanoid project -> sprites -> walk -> export -> reload persists', async ({ page }) => {
  await newHumanoidWithSprites(page);
  const head = page.getByTestId('sprite-head.png');
  const torso = page.getByTestId('sprite-torso.png');
  // attached images show a bone name instead of the "Bone für ..." select
  await expect(head.locator('.sprite-bone')).toHaveText('head');
  await expect(torso.locator('.sprite-bone')).toHaveText('torso');
  await expect(page.getByLabel('Bone für head.png')).toHaveCount(0);
  await expect(page.getByLabel('Bone für torso.png')).toHaveCount(0);

  await page.getByRole('button', { name: 'Animieren' }).click();
  await page.getByRole('button', { name: 'Aus Template' }).click();
  await page.getByRole('button', { name: 'walk', exact: true }).click();
  await expect(page.getByLabel('Animation').locator('option:checked')).toHaveText('walk');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const all: Download[] = [];
  page.on('download', (d) => all.push(d));
  await page.getByRole('button', { name: 'Exportieren' }).click();
  await expect.poll(() => all.length).toBe(2);
  const pngDl = all.find((d) => d.suggestedFilename().endsWith('.png'));
  const jsonDl = all.find((d) => d.suggestedFilename().endsWith('.json'));
  expect(pngDl).toBeDefined();
  expect(jsonDl).toBeDefined();

  const meta = JSON.parse(readFileSync((await jsonDl!.path())!, 'utf8'));
  expect(Object.keys(meta.frames)).toHaveLength(16);
  expect(meta.meta.frameTags[0].name).toBe('walk');

  const buf = readFileSync((await pngDl!.path())!);
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buf.readUInt32BE(16)).toBe(meta.meta.size.w);
  expect(buf.readUInt32BE(20)).toBe(meta.meta.size.h);

  // scale 2: metadata must still describe the PNG in PNG pixel coordinates
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Skalierung').selectOption('2');
  const all2: Download[] = [];
  page.on('download', (d) => all2.push(d));
  await page.getByRole('button', { name: 'Exportieren' }).click();
  await expect.poll(() => all2.length).toBe(2);
  const meta2 = JSON.parse(readFileSync((await all2.find((d) => d.suggestedFilename().endsWith('.json'))!.path())!, 'utf8'));
  const buf2 = readFileSync((await all2.find((d) => d.suggestedFilename().endsWith('.png'))!.path())!);
  expect(meta2.meta.scale).toBe('2');
  expect(buf2.readUInt32BE(16)).toBe(meta2.meta.size.w);
  expect(buf2.readUInt32BE(20)).toBe(meta2.meta.size.h);
  expect(meta2.meta.size).toEqual({ w: meta.meta.size.w * 2, h: meta.meta.size.h * 2 });
  const f1 = meta.frames['walk 1'];
  const f2 = meta2.frames['walk 1'];
  expect(f2.frame).toEqual({ x: f1.frame.x * 2, y: f1.frame.y * 2, w: f1.frame.w * 2, h: f1.frame.h * 2 });
  expect(f2.sourceSize).toEqual({ w: f2.frame.w, h: f2.frame.h });
  for (const f of Object.values(meta2.frames) as { frame: { x: number; y: number; w: number; h: number } }[]) {
    expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(meta2.meta.size.w);
    expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(meta2.meta.size.h);
  }

  // autosave (1 s debounce), then reload
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              const open = indexedDB.open('keyval-store');
              open.onerror = () => resolve([]);
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('keyval')) {
                  db.close();
                  resolve([]);
                  return;
                }
                const req = db.transaction('keyval').objectStore('keyval').get('rigsprite:autosave');
                req.onerror = () => {
                  db.close();
                  resolve([]);
                };
                req.onsuccess = () => {
                  db.close();
                  try {
                    resolve((JSON.parse(String(req.result)).animations ?? []).map((a: { name: string }) => a.name));
                  } catch {
                    resolve([]);
                  }
                };
              };
            }),
        ),
      { message: 'autosave entry in IndexedDB should contain an animation named "walk"', timeout: 10_000 },
    )
    .toContain('walk');
  await page.reload();
  await expect(page.getByLabel('Animation').locator('option', { hasText: 'walk' })).toHaveCount(1);
});
