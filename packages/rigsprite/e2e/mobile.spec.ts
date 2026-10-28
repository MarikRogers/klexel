import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { newHumanoid, SPRITE_FIXTURES } from './helpers';

type Pt = { x: number; y: number };

/** Page coordinates of the centroid of a part's mesh (current frame, current view). */
async function partCenter(page: Page, imageName: string): Promise<Pt> {
  return page.evaluate(async (name) => {
    // Vite dev modules; built via Function so Playwright's transpiler leaves the dynamic import alone.
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { buildFrame } = await load('/src/core/frame.ts');
    const { toFrameInput } = await load('/src/core/project.ts');
    const { worldToScreen } = await load('/src/render/view.ts');
    const s = (window as any).__editor.getState();
    const image = Object.values(s.project.images).find((i: any) => i.name === name) as any;
    const part = s.project.parts.find((p: any) => p.imageId === image.id);
    const animationId = s.mode === 'animate' ? s.animationId : null;
    const item = buildFrame(toFrameInput(s.project, animationId), s.frame).items.find((i: any) => i.partId === part.id)!;
    let x = 0;
    let y = 0;
    const n = item.positions.length / 2;
    for (let i = 0; i < n; i++) {
      x += item.positions[i * 2];
      y += item.positions[i * 2 + 1];
    }
    const canvas = document.querySelectorAll('.center canvas')[1] as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const { cameraRotation: rotation, mirror } = s.project.settings;
    const view = { ...s.view, ...s.orbit, rotation, mirror, width: rect.width, height: rect.height };
    const p = worldToScreen(view, { x: x / n, y: y / n });
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, imageName);
}

const editor = <T,>(page: Page, fn: string) => page.evaluate(`(${fn})((window).__editor)`) as Promise<T>;
const undoCount = (page: Page) => editor<number>(page, '(e) => e.temporal.getState().pastStates.length');
const headPart = (page: Page) =>
  editor<{ x: number; y: number }>(
    page,
    `(e) => { const s = e.getState(); const img = Object.values(s.project.images).find((i) => i.name === 'head.png');
      const p = s.project.parts.find((p) => p.imageId === img.id); return { x: p.x, y: p.y }; }`,
  );

const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id })),
  });

async function swipe(cdp: CDPSession, from: Pt, to: Pt, steps = 8) {
  await touch(cdp, 'touchStart', [from]);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
  }
  await touch(cdp, 'touchEnd', []);
}

test('phone: upload, touch-drag a part, pinch-zoom, pose a bone', async ({ page }) => {
  await newHumanoid(page);
  const cdp = await page.context().newCDPSession(page);

  // The orbit panel starts folded on phones; unfolded, its buttons are finger-sized.
  const view = page.getByRole('button', { name: 'Ansicht' });
  await expect(view).toHaveAttribute('aria-expanded', 'false');
  await view.tap();
  const side = page.getByRole('button', { name: 'Seite' });
  for (const b of [side, page.getByRole('button', { name: 'Orbit hoch' })]) {
    const r = (await b.boundingBox())!;
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(32);
  }
  await side.tap();
  expect(await editor(page, '(e) => e.getState().orbit')).toEqual({ yaw: 90, pitch: 0 });
  await page.getByRole('button', { name: 'Vorne' }).tap();
  await view.tap();
  await expect(side).toHaveCount(0);

  const panels = page.getByRole('button', { name: 'Bones & Sprites' });
  await expect(panels).toHaveAttribute('aria-expanded', 'false');
  await panels.click();
  await expect(panels).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Sprites hochladen').setInputFiles(SPRITE_FIXTURES);
  await expect(page.getByTestId('sprite-head.png')).toBeVisible();
  if (process.env.PW_SCREENSHOT) await page.screenshot({ path: process.env.PW_SCREENSHOT.replace(/\.png$/, '-panel.png') });
  // A tap on the scrim outside the drawer closes it; Escape closes the Inspector drawer.
  await page.getByTestId('drawer-scrim').click({ position: { x: 380, y: 200 } });
  await expect(page.locator('aside.left')).toBeHidden();
  await expect(panels).toHaveAttribute('aria-expanded', 'false');
  const inspector = page.getByRole('button', { name: 'Inspector' });
  await inspector.click();
  await expect(page.locator('aside.right')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('aside.right')).toBeHidden();
  await expect(page.getByTestId('drawer-scrim')).toHaveCount(0);
  await expect(page.locator('aside.right')).toBeHidden();

  // One finger drags the head part: position changes, exactly one undo entry.
  const before = await headPart(page);
  const undo0 = await undoCount(page);
  const c = await partCenter(page, 'head.png');
  await swipe(cdp, c, { x: c.x + 40, y: c.y + 25 });
  const after = await headPart(page);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(5);
  expect(await undoCount(page)).toBe(undo0 + 1);
  // tapping a part does not open the inspector overlay
  await expect(page.locator('aside.right')).toBeHidden();

  // A second finger cancels the running drag: back to the start, no undo entry.
  const c2 = await partCenter(page, 'head.png');
  await touch(cdp, 'touchStart', [c2]);
  for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [{ x: c2.x + i * 8, y: c2.y }]);
  const mid1 = await headPart(page);
  expect(Math.hypot(mid1.x - after.x, mid1.y - after.y)).toBeGreaterThan(5);
  await touch(cdp, 'touchStart', [{ x: c2.x + 40, y: c2.y }, { x: c2.x - 60, y: c2.y + 80 }]);
  expect(await headPart(page)).toEqual(after);
  await touch(cdp, 'touchEnd', []);
  expect(await undoCount(page)).toBe(undo0 + 1);
  expect(await headPart(page)).toEqual(after);

  // Two-finger pinch apart: zoom grows.
  const zoom0 = await editor<number>(page, '(e) => e.getState().view.zoom');
  const box = (await page.locator('.center canvas').nth(1).boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pair = (d: number) => [{ x: mid.x - d, y: mid.y }, { x: mid.x + d, y: mid.y }];
  await touch(cdp, 'touchStart', pair(30));
  for (let d = 40; d <= 120; d += 10) await touch(cdp, 'touchMove', pair(d));
  await touch(cdp, 'touchEnd', []);
  const zoom1 = await editor<number>(page, '(e) => e.getState().view.zoom');
  expect(zoom1).toBeGreaterThan(zoom0 * 2);

  // Animate + walk template, scrub to frame 3 by touch, pose the head by touch → key at frame 3.
  await page.getByRole('button', { name: 'Animieren' }).click();
  await page.getByRole('button', { name: 'Aus Template' }).click();
  await page.getByRole('button', { name: 'walk', exact: true }).click();
  await expect(page.getByLabel('Animation').locator('option:checked')).toHaveText('walk');
  const f3 = (await page.getByTestId('frame-3').boundingBox())!;
  await touch(cdp, 'touchStart', [{ x: f3.x + f3.width / 2, y: f3.y + f3.height / 2 }]);
  await touch(cdp, 'touchEnd', []);
  expect(await editor<number>(page, '(e) => e.getState().frame')).toBe(3);

  const keyedHead = () =>
    editor<number[]>(
      page,
      `(e) => { const s = e.getState(); const a = s.project.animations.find((x) => x.id === s.animationId);
        return Object.values(a.tracks.head ?? {}).flat().map((k) => k.frame); }`,
    );
  expect(await keyedHead()).not.toContain(3);
  const h = await partCenter(page, 'head.png');
  await swipe(cdp, h, { x: h.x + 60, y: h.y - 10 });
  expect(await editor<string>(page, '(e) => e.getState().selectedBoneId')).toBe('head');
  expect(await keyedHead()).toContain(3);

  // 48-frame animation: a horizontal swipe on the bone rows scrolls the timeline, then a key beyond
  // the initial view can be tapped.
  await page.getByRole('button', { name: '+ Neu' }).click();
  const length = page.locator('footer.timeline').getByLabel('Länge');
  await length.fill('48');
  await length.press('Enter');
  await editor(page, `(e) => { const s = e.getState(); s.setFrame(44); s.poseBone('head', { rotation: 12 }); s.setFrame(0); }`);
  const grid = page.locator('.timeline-grid');
  expect(await grid.evaluate((el) => el.scrollLeft)).toBe(0);
  const far = page.getByTestId('track-head').locator('[data-testid="key"][data-frame="44"]');
  const gridBox = (await grid.boundingBox())!;
  expect((await far.boundingBox())!.x).toBeGreaterThan(gridBox.x + gridBox.width);
  const row = (await page.getByTestId('track-torso').boundingBox())!;
  const y = row.y + row.height / 2;
  const keyCenterX = async () => {
    const b = (await far.boundingBox())!;
    return b.x + b.width / 2;
  };
  for (let i = 0; i < 8 && (await keyCenterX()) > gridBox.x + gridBox.width - 20; i++) {
    await swipe(cdp, { x: 390, y }, { x: 140, y }, 10);
  }
  expect(await grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const keyBox = (await far.boundingBox())!;
  expect(keyBox.x + keyBox.width / 2).toBeLessThan(gridBox.x + gridBox.width);
  expect(keyBox.x + keyBox.width / 2).toBeGreaterThan(gridBox.x + 110);
  await touch(cdp, 'touchStart', [{ x: keyBox.x + keyBox.width / 2, y: keyBox.y + keyBox.height / 2 }]);
  await touch(cdp, 'touchEnd', []);
  await expect(far).toHaveClass(/selected/);
  await expect(page.getByRole('button', { name: 'Key löschen' })).toBeVisible();

  // Long-press a key (> 500 ms): the easing menu opens and stays open after the finger lifts;
  // tapping an option applies it.
  const lpKey = page.getByTestId('track-head').locator('[data-testid="key"][data-frame="44"]');
  const lb = (await lpKey.boundingBox())!;
  const lp = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 };
  await touch(cdp, 'touchStart', [lp]);
  await page.waitForTimeout(700);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const easingAt44 = () =>
    editor<string>(
      page,
      `(e) => { const s = e.getState(); const a = s.project.animations.find((x) => x.id === s.animationId);
        return a.tracks.head.rotation.find((k) => k.frame === 44).easing; }`,
    );
  expect(await easingAt44()).not.toBe('easeInOut');
  const opt = (await menu.getByRole('menuitem', { name: 'Weich' }).boundingBox())!;
  await touch(cdp, 'touchStart', [{ x: opt.x + opt.width / 2, y: opt.y + opt.height / 2 }]);
  await touch(cdp, 'touchEnd', []);
  await expect(menu).toBeHidden();
  expect(await easingAt44()).toBe('easeInOut');

  await page.screenshot({ path: process.env.PW_SCREENSHOT ?? 'test-results/mobile.png' });
});
