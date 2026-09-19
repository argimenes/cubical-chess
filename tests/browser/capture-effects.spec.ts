import { expect, test, type Page } from '@playwright/test';

const animation = (page: Page) => page.evaluate(() => window.__cubical.replay().animation);
const capture = (page: Page) => page.getByRole('button', {name: 'Move to (4, 3, 5)', exact: true}).click();
const done = (page: Page) => page.waitForFunction(() => !window.__cubical.replay().animation.active);
const errors: string[] = [];

test.beforeEach(async ({page}) => {
  errors.length = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/'); await page.waitForFunction(() => window.__cubical);
  await page.locator('#setup').selectOption('spatial-study'); await page.locator('#new-game').click();
  await page.locator('#theme').selectOption('luminous');
});
test.afterEach(() => expect(errors).toEqual([]));

test('capture charges, shatters, fades, and freezes both phases during replay without changing the save', async ({page}) => {
  await capture(page);
  expect((await animation(page)).capture).toMatchObject({attacker: 2, cell: 348, phase: 'charging'});
  // The authoritative capture is already committed while its visual sequence plays.
  expect((await page.evaluate(() => window.__cubical.snapshot())).pieces[9].cell).toBeNull();
  await page.waitForFunction(() => window.__cubical.replay().animation.capture?.phase === 'shattering');
  await done(page); expect((await animation(page)).capture).toBeNull();
  const saved = await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'));
  const baseline = await page.evaluate(() => window.__cubical.presentation());

  await page.getByRole('button', {name: 'Play replay'}).click();
  await page.waitForFunction(() => window.__cubical.replay().animation.capture?.phase === 'charging');
  await page.getByRole('button', {name: 'Pause replay'}).click();
  expect((await animation(page)).capture?.phase).toBe('charging');
  await page.screenshot({path: 'docs/capture-electrical-charge.png'});
  await page.getByRole('button', {name: 'Play replay'}).click();
  await page.waitForFunction(() => window.__cubical.replay().animation.capture?.phase === 'shattering');
  await page.getByRole('button', {name: 'Pause replay'}).click();
  const paused = await animation(page);
  await page.screenshot({path: 'docs/capture-crystal-shards.png'});
  await page.waitForTimeout(250);
  expect(await animation(page)).toEqual(paused);
  expect(await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'))).toBe(saved);
  await page.getByRole('button', {name: 'Play replay'}).click();
  await done(page);
  expect((await animation(page)).capture).toBeNull();
  await page.locator('#replay-present').click();
  // Recreated piece buffers are uploaded on the next render after returning live.
  await expect.poll(async () => (await page.evaluate(() => window.__cubical.presentation())).geometries).toBe(baseline.geometries);
  const after = await page.evaluate(() => window.__cubical.presentation());
  expect(after.geometries).toBe(baseline.geometries);
  expect(after.textures).toBe(baseline.textures);
});

test('undo, theme changes and animation preferences remove capture effects safely', async ({page}) => {
  const before = await page.evaluate(() => window.__cubical.snapshot().board);
  await capture(page);
  await page.locator('#undo').click();
  expect((await animation(page)).capture).toBeNull();
  expect(await page.evaluate(() => window.__cubical.snapshot().board)).toEqual(before);
  for (const theme of ['diagnostic', 'crystal', 'luminous']) {
    await page.locator('#piece-navigator').selectOption('2'); await capture(page);
    expect((await animation(page)).capture).not.toBeNull();
    await page.locator('#theme').selectOption(theme);
    expect((await animation(page)).capture).toBeNull();
    await page.locator('#undo').click();
  }
  await page.locator('#piece-navigator').selectOption('2'); await capture(page);
  await page.locator('#ambient-effects').uncheck();
  expect((await animation(page)).active).toBe(false);
  expect((await animation(page)).capture).toBeNull();
  await page.locator('#undo').click();
  await page.locator('#piece-navigator').selectOption('2'); await capture(page);
  expect((await animation(page)).capture).toBeNull();
  await page.locator('#undo').click();
  await page.locator('#ambient-effects').check();
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.locator('#piece-navigator').selectOption('2'); await capture(page);
  expect((await animation(page)).active).toBe(false);
  expect((await animation(page)).capture).toBeNull();
});
