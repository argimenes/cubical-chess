import { expect, test, type Page } from '@playwright/test';
import type { GameStatus, Move, Piece } from '../../src/rules/types';

interface Diagnostics {
  snapshot(): { pieces: Piece[]; board: number[]; side: string; ply: number; selected: number | null; moves: Move[]; status: GameStatus; history: string[]; generationMs: number };
  project(cell: number): { x: number; y: number };
  metrics(): { drawCalls: number; triangles: number; lastRenderMs: number; renders: number };
  camera(): number[];
}
declare global { interface Window { __cubical: Diagnostics } }
const cell = (x: number, y: number, z: number) => x + 8 * y + 64 * z;
const snapshot = (page: Page) => page.evaluate(() => window.__cubical.snapshot());
const runtimeErrors = new WeakMap<Page, string[]>();
const frame = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function clickCell(page: Page, x: number, y: number, z: number, touch = false) {
  await frame(page);
  const position = await page.evaluate(c => window.__cubical.project(c), cell(x, y, z));
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
  if (await page.locator('#depth-chooser').isVisible()) {
    await page.locator('#depth-options button').filter({ hasText: '(' + [x, y, z].join(', ') + ')' }).click();
  }
}
async function load(page: Page, setup: string, profile = 'prototype-1') {
  await page.locator('#setup').selectOption(setup);
  await page.locator('#profile').selectOption(profile);
  await page.locator('#new-game').click();
  await frame(page);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__cubical && document.querySelector('#board canvas'));
  await frame(page);
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test('outer planes, real canvas move, and complete undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const before = await snapshot(page);
  expect(before.pieces).toHaveLength(32);
  expect(before.pieces.filter(p => p.owner === 'white').every(p => p.cell! < 64)).toBeTruthy();
  expect(before.pieces.filter(p => p.owner === 'black').every(p => p.cell! >= 448)).toBeTruthy();
  await clickCell(page, 3, 2, 0);
  await expect(page.locator('#selected-name')).toHaveText('White pawn');
  await expect(page.locator('#legal-count')).toHaveText('2');
  await clickCell(page, 3, 2, 1);
  await expect(page.locator('#turn-label')).toHaveText('Black to move');
  const moved = await snapshot(page);
  expect(moved.ply).toBe(1); expect(moved.pieces[11].cell).toBe(cell(3, 2, 1));
  await expect(page.locator('#history .move-row')).toHaveCount(1);
  await page.locator('#undo').click();
  const restored = await snapshot(page);
  expect(restored.board).toEqual(before.board); expect(restored.pieces).toEqual(before.pieces); expect(restored.ply).toBe(0);
  expect(errors).toEqual([]);
});

test('knight jump capture works with guides hidden', async ({ page }) => {
  await load(page, 'spatial-study');
  await expect(page.locator('#selected-name')).toHaveText('White knight');
  await expect(page.locator('#legal-count')).toHaveText('24');
  await page.locator('#trajectories').uncheck();
  await clickCell(page, 4, 3, 5);
  const moved = await snapshot(page);
  expect(moved.pieces[2].cell).toBe(cell(4, 3, 5)); expect(moved.pieces[9].cell).toBeNull();
  await expect(page.locator('#piece-count')).toHaveText('9');
  await page.locator('#undo').click();
  expect((await snapshot(page)).pieces[9].cell).toBe(cell(4, 3, 5));
});

test('orbit, zoom and pan never commit a move', async ({ page }) => {
  await load(page, 'spatial-study');
  const before = await snapshot(page);
  const camera = await page.evaluate(() => window.__cubical.camera());
  const start = await page.evaluate(c => window.__cubical.project(c), cell(3, 3, 3));
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 100, start.y + 65, { steps: 12 }); await page.mouse.up();
  await frame(page);
  expect(await page.evaluate(() => window.__cubical.camera())).not.toEqual(camera);
  await page.mouse.wheel(0, -100); await frame(page);
  await page.mouse.down({ button: 'right' }); await page.mouse.move(start.x + 50, start.y, { steps: 5 }); await page.mouse.up({ button: 'right' });
  const after = await snapshot(page);
  expect(after.board).toEqual(before.board); expect(after.ply).toBe(0);
});

test('pinned piece has no destinations and can be inspected from below', async ({ page }) => {
  await load(page, 'king-safety');
  await expect(page.locator('#selected-name')).toHaveText('White rook');
  await expect(page.locator('#legal-count')).toHaveText('0');
  expect((await snapshot(page)).status).toEqual({ kind: 'playing', check: false });
  await page.getByRole('button', { name: 'Below', exact: true }).click();
  await frame(page);
  expect((await page.evaluate(() => window.__cubical.camera()))[1]).toBeLessThan(0);
});

test('promotion is chosen before commit, and undo restores a pawn and capture', async ({ page }) => {
  await load(page, 'promotion');
  await page.getByRole('button', { name: 'Move to (4, 3, 7)', exact: true }).click();
  await expect(page.locator('#promotion-dialog')).toBeVisible();
  expect((await snapshot(page)).ply).toBe(0);
  await page.locator('#cancel-promotion').click();
  expect((await snapshot(page)).pieces[2].type).toBe('pawn');
  await page.getByRole('button', { name: 'Move to (4, 3, 7)', exact: true }).click();
  await page.locator('[data-promote="knight"]').click();
  const after = await snapshot(page);
  expect(after.pieces[2].type).toBe('knight'); expect(after.pieces[3].cell).toBeNull(); expect(after.ply).toBe(1);
  await page.locator('#undo').click();
  const restored = await snapshot(page);
  expect(restored.pieces[2].type).toBe('pawn'); expect(restored.pieces[2].cell).toBe(cell(3, 3, 6)); expect(restored.pieces[3].cell).toBe(cell(4, 3, 7));
});

test('pawn comparison removes only the backward planar quiet destination', async ({ page }) => {
  await load(page, 'spatial-study');
  await page.locator('#piece-navigator').selectOption('5');
  const four = (await snapshot(page)).moves.filter(m => m.capturedId === null).map(m => m.to);
  expect(four).toHaveLength(4);
  await load(page, 'spatial-study', 'prototype-1-three');
  await page.locator('#piece-navigator').selectOption('5');
  const three = (await snapshot(page)).moves.filter(m => m.capturedId === null).map(m => m.to);
  expect(three).toHaveLength(3);
  expect(four.filter(c => !three.includes(c))).toEqual([cell(2, 3, 2)]);
});

test('plane visibility leaves state intact and full-cube view recovers all pieces', async ({ page }) => {
  const before = await snapshot(page);
  await page.locator('#plane').selectOption('0'); await page.locator('#isolate').check(); await frame(page);
  await expect(page.locator('.piece-label.white:visible')).toHaveCount(16); await expect(page.locator('.piece-label.black:visible')).toHaveCount(0);
  await page.locator('#plane').selectOption('7'); await frame(page);
  await expect(page.locator('.piece-label.black:visible')).toHaveCount(16); await expect(page.locator('.piece-label.white:visible')).toHaveCount(0);
  await page.locator('#isolate').uncheck(); await frame(page);
  await expect(page.locator('.piece-label:visible')).toHaveCount(32);
  expect((await snapshot(page)).board).toEqual(before.board);
});

test('overlapping front-view pieces offer an explicit depth choice', async ({ page }) => {
  await page.getByRole('button', { name: 'Front', exact: true }).click(); await frame(page);
  const point = await page.evaluate(c => window.__cubical.project(c), cell(3, 2, 0));
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#depth-chooser')).toBeVisible();
  await page.locator('#depth-options button').filter({ hasText: '(3, 2, 0)' }).click();
  await expect(page.locator('#selected-name')).toHaveText('White pawn');
  expect((await snapshot(page)).ply).toBe(0);
});

test('captures desktop study screenshot and render metrics', async ({ page }) => {
  await load(page, 'spatial-study');
  await page.screenshot({ path: 'docs/prototype-1-desktop.png' });
  console.log('Desktop render metrics:', JSON.stringify(await page.evaluate(() => window.__cubical.metrics())));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('touch selection, two-finger navigation and single-screen portrait/landscape', async ({ page, context }) => {
    await page.locator('#game-panel-button').click();
    await load(page, 'spatial-study');
    await page.locator('#game-panel-button').click();
    await clickCell(page, 4, 3, 5, true);
    await expect.poll(async () => (await snapshot(page)).ply).toBe(1);
    const before = await snapshot(page);
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y: 550, id: 1 }, { x: 500, y: 550, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 510, id: 1 }, { x: 550, y: 570, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frame(page);
    expect((await snapshot(page)).board).toEqual(before.board);
    await page.getByRole('button', { name: 'Isometric', exact: true }).click(); await frame(page);
    await page.screenshot({ path: 'docs/prototype-1-tablet.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.getByRole('button', { name: 'Isometric', exact: true }).click(); await frame(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: 'docs/prototype-1-tablet-landscape.png' });
  });
});
