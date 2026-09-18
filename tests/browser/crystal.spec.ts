import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const effects = ['refraction', 'spectral', 'caustics', 'inclusions'] as const;
const frame = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const snapshot = (page: Page) => page.evaluate(() => window.__cubical.snapshot());
const presentation = (page: Page) => page.evaluate(() => window.__cubical.presentation());
const errors = new WeakMap<Page, string[]>();
const target = 4 + 8 * 3 + 64 * 5;

async function setup(page: Page, study = 'spatial-study') {
  await page.locator('#setup').selectOption(study); await page.locator('#new-game').click();
  await frame(page);
}
async function solo(page: Page, effect: typeof effects[number] | 'combined' | 'inclusion-study' | null) {
  for (const id of effects) await page.locator('#crystal-' + id).uncheck();
  for (const id of effects) if (effect === 'inclusion-study' || (effect === 'combined' && id !== 'inclusions') || effect === id) await page.locator('#crystal-' + id).check();
  await frame(page);
}
async function canvasCell(page: Page, cell: number, touch = false) {
  await frame(page);
  const p = await page.evaluate(c => window.__cubical.project(c), cell);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  if (await page.locator('#depth-chooser').isVisible()) {
    const coordinate = '(' + [cell % 8, Math.floor(cell / 8) % 8, Math.floor(cell / 64)].join(', ') + ')';
    const button = page.locator('#depth-options button').filter({ hasText: coordinate });
    if (touch) await button.tap(); else await button.click();
  }
}

test.beforeEach(async ({ page }) => {
  const found: string[] = []; errors.set(page, found);
  page.on('pageerror', error => found.push(error.message));
  page.on('console', message => { if (message.type() === 'error') found.push(message.text()); });
  await page.goto('/'); await page.waitForFunction(() => !!window.__cubical); await frame(page);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('each Crystal effect preserves the board, saved game, marker positions and actual capture picking', async ({ page }) => {
  test.setTimeout(90000);
  for (const effect of [...effects, 'combined', 'inclusion-study'] as const) {
    await setup(page);
    const before = await snapshot(page);
    const saved = await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'));
    const coordinates = await page.evaluate(() => window.__cubical.snapshot().moves.map(m => window.__cubical.project(m.to)));
    await page.locator('#theme').selectOption('crystal'); await solo(page, effect);
    expect((await presentation(page)).optical).toEqual(Object.fromEntries(effects.map(id => [id, effect === 'inclusion-study' || (effect === 'combined' && id !== 'inclusions') || effect === id])));
    expect((await snapshot(page)).board).toEqual(before.board);
    expect((await snapshot(page)).moves).toEqual(before.moves);
    expect(await page.evaluate(() => window.__cubical.snapshot().moves.map(m => window.__cubical.project(m.to)))).toEqual(coordinates);
    expect(await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'))).toBe(saved);
    expect((await page.evaluate(() => window.__cubical.movementField())).cells).toHaveLength(24);
    await canvasCell(page, target);
    expect((await snapshot(page)).pieces[9].cell).toBeNull();
    await page.locator('#undo').click();
    expect((await snapshot(page)).board).toEqual(before.board);
    await page.locator('#theme').selectOption('diagnostic');
  }
});

test('sparse optics survive resize without textures and are released; reduced motion and animation off remain idle', async ({ page }) => {
  test.setTimeout(60000);
  await setup(page);
  const baseline = await presentation(page);
  for (const effect of effects) {
    await page.locator('#theme').selectOption('crystal'); await solo(page, effect);
    expect((await presentation(page)).textures).toBe(baseline.textures);
    await page.setViewportSize({ width: 1194, height: 834 }); await frame(page);
    await page.getByRole('button', { name: 'Below', exact: true }).click(); await frame(page);
    expect((await page.evaluate(() => window.__cubical.movementField())).cells).toHaveLength(24);
    await page.locator('#theme').selectOption('diagnostic'); await frame(page);
    expect((await presentation(page)).textures).toBe(baseline.textures);
    expect((await presentation(page)).geometries).toBe(baseline.geometries);
  }
  await page.locator('#theme').selectOption('crystal'); await solo(page, 'caustics');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await frame(page);
  let renders = await page.evaluate(() => window.__cubical.metrics().renders);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__cubical.metrics().renders)).toBe(renders);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#ambient-effects').uncheck(); await frame(page);
  renders = await page.evaluate(() => window.__cubical.metrics().renders);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__cubical.metrics().renders)).toBe(renders);
});

test('records exaggerated and separate optical treatments at fixed poses and warm camera performance', async ({ page }) => {
  test.setTimeout(120000);
  await setup(page); await page.locator('#theme').selectOption('crystal');
  // Freeze scintillation for reproducible side-by-side stills.
  await page.locator('#ambient-effects').uncheck();
  const results: Record<string, unknown> = {};
  for (const effect of ['diagnostic', null, ...effects, 'inclusion-study', 'combined'] as const) {
    await page.locator('#theme').selectOption(effect === 'diagnostic' ? 'diagnostic' : 'crystal');
    if (effect !== 'diagnostic') await solo(page, effect);
    await page.getByRole('button', { name: 'Isometric', exact: true }).click(); await frame(page);
    const name = effect ?? 'off';
    results[name] = { static: { ...await presentation(page), ...await page.evaluate(() => window.__cubical.metrics()) } };
    await page.screenshot({ path: 'docs/crystal-bold-' + name + '.png' });
    await page.locator('#camera-study summary').click();
    await page.locator('#orbit-piece').click();
    const intervals = await page.evaluate(async () => {
      const durations: number[] = []; let last = 0;
      for (let i = 0; i < 24; i++) {
        const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
        if (i > 5) durations.push(now - last); last = now;
      }
      return durations.sort((a, b) => a - b);
    });
    Object.assign(results[name] as object, { camera: await presentation(page), frameIntervalsMs: intervals });
    await page.locator('#manual-camera').click(); await page.locator('#camera-study summary').click();
  }
  await writeFile('docs/crystal-bold-measurements.json', JSON.stringify(results, null, 2) + '\n');
  console.log('Crystal measurements:', JSON.stringify(results));
  await page.getByRole('button', { name: 'Below', exact: true }).click(); await frame(page);
  await page.screenshot({ path: 'docs/crystal-bold-combined-below.png' });
  await setup(page, 'outer-planes');
  await page.locator('#piece-navigator').selectOption('3');
  for (const effect of [...effects, 'combined', 'inclusion-study'] as const) {
    await solo(page, effect);
    await page.getByRole('button', { name: 'Isometric', exact: true }).click(); await frame(page);
    await page.screenshot({ path: 'docs/crystal-bold-' + effect + '-opening.png' });
    await expect(page.locator('.piece-label:visible')).toHaveCount(32);
    expect((await page.evaluate(() => window.__cubical.movementField())).cells).toHaveLength(33);
  }
});

test.describe('Crystal tablet', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('combined exaggerated optics retain precise two-tap capture and reload', async ({ page }) => {
    await page.locator('#game-panel-button').tap(); await setup(page);
    await page.locator('#inspect-panel-button').tap();
    await page.locator('#theme').selectOption('crystal'); expect((await presentation(page)).optical).toEqual({ refraction: true, spectral: true, caustics: true, inclusions: false });
    await page.locator('#inspect-panel-button').tap();
    await page.screenshot({ path: 'docs/crystal-bold-tablet.png' });
    await canvasCell(page, target, true);
    expect((await snapshot(page)).ply).toBe(0);
    expect((await page.evaluate(() => window.__cubical.movementField())).guideCount).toBe(1);
    await canvasCell(page, target, true);
    expect((await snapshot(page)).pieces[9].cell).toBeNull();
    await page.reload();
    expect((await snapshot(page)).pieces[9].cell).toBeNull();
    expect((await presentation(page)).theme).toBe('diagnostic');
  });
});
