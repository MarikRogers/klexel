import { expect, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const SPRITE_FIXTURES = ['e2e/fixtures/head.png', 'e2e/fixtures/torso.png'];

/** Starts a fresh humanoid project (accepting the discard confirmation, if any). */
export async function newHumanoid(page: Page): Promise<void> {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu', exact: true }).click();
  await page.getByRole('button', { name: 'Humanoid' }).click();
}

/** New humanoid project with the head and torso fixtures uploaded. */
export async function newHumanoidWithSprites(page: Page): Promise<void> {
  await newHumanoid(page);
  await page.getByLabel('Sprites hochladen').setInputFiles(SPRITE_FIXTURES);
  await expect(page.getByTestId('sprite-head.png')).toBeVisible();
  await expect(page.getByTestId('sprite-torso.png')).toBeVisible();
}

export interface SheetExport {
  png: Buffer;
  meta: {
    frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    meta: { size: { w: number; h: number }; pivot: { x: number; y: number } };
  };
}

/** Exports the sprite sheet through the dialog; returns the PNG bytes and the parsed JSON metadata. */
export async function exportSheet(page: Page): Promise<SheetExport> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const all: Download[] = [];
  const onDownload = (d: Download) => all.push(d);
  page.on('download', onDownload);
  await page.getByRole('button', { name: 'Exportieren' }).click();
  await expect.poll(() => all.length).toBe(2);
  page.off('download', onDownload);
  const png = readFileSync((await all.find((d) => d.suggestedFilename().endsWith('.png'))!.path())!);
  const meta = JSON.parse(readFileSync((await all.find((d) => d.suggestedFilename().endsWith('.json'))!.path())!, 'utf8'));
  // meta.size is the PNG size (IHDR width / height)
  expect(png.readUInt32BE(16)).toBe(meta.meta.size.w);
  expect(png.readUInt32BE(20)).toBe(meta.meta.size.h);
  return { png, meta };
}
