import { expect, test, type Page } from '@playwright/test';
import type { GameStatus, Move, Piece } from '../../src/rules/types';

interface Diagnostics {
  snapshot(): { pieces: Piece[]; board: number[]; side: string; ply: number; selected: number | null; moves: Move[]; status: GameStatus; history: string[]; generationMs: number };
  project(cell: number): { x: number; y: number };
  metrics(): { drawCalls: number; triangles: number; lastRenderMs: number; renders: number };
  camera(): number[];
  presentation(): { starTwinkle: boolean | null; lattice: { mode: string; frostedCells: boolean; localCells: number[]; localSegments: number }; optical: { refraction: boolean; spectral: boolean; caustics: boolean; inclusions: boolean } | null; theme: string; director: string; effects: boolean; geometries: number; textures: number; samples: number; medianSubmitMs: number; p95SubmitMs: number; target: number[] };
  movementField(): { cells: number[]; focused: number | null; guideKind: string | null; guideCount: number; points: number[][]; dashed: boolean; inspectedCell: number | null };
}
declare global { interface Window { __cubical: Diagnostics } }
const cell = (x: number, y: number, z: number) => x + 8 * y + 64 * z;
const field = (page: Page) => page.evaluate(() => window.__cubical.movementField());
const snapshot = (page: Page) => page.evaluate(() => window.__cubical.snapshot());
const runtimeErrors = new WeakMap<Page, string[]>();
const frame = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function clickCell(page: Page, x: number, y: number, z: number, touch = false) {
  await frame(page);
  const position = await page.evaluate(c => window.__cubical.project(c), cell(x, y, z));
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
  if (await page.locator('#depth-chooser').isVisible()) {
    const choice = page.locator('#depth-options button').filter({ hasText: '(' + [x, y, z].join(', ') + ')' });
    if (touch) await choice.tap(); else await choice.click();
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
  await page.screenshot({ path: 'docs/spatial-field-desktop.png' });
  console.log('Desktop render metrics:', JSON.stringify(await page.evaluate(() => window.__cubical.metrics())));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('knight constellation reveals one dashed elbow on canvas hover', async ({ page }) => {
  await load(page, 'spatial-study');
  const before = await snapshot(page);
  expect((await field(page)).cells).toHaveLength(24);
  expect((await field(page)).guideCount).toBe(0);
  const target = cell(4, 3, 5);
  const point = await page.evaluate(c => window.__cubical.project(c), target);
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await field(page)).focused).toBe(target);
  const inspected = await field(page);
  expect(inspected.cells).toHaveLength(24);
  expect(inspected.guideCount).toBe(1);
  expect(inspected.dashed).toBe(true);
  expect(inspected.points).toEqual([[-0.5, -0.5, -0.5], [-0.5, 1.5, -0.5], [0.5, 1.5, -0.5]]);
  await expect(page.locator('#move-detail')).toContainText('Capture Black pawn');
  await frame(page);
  await page.screenshot({ path: 'docs/spatial-field-knight-focus.png' });
  await page.mouse.move(10, 10);
  expect((await field(page)).guideCount).toBe(0);
  expect((await field(page)).cells).toEqual(inspected.cells);
  expect((await snapshot(page)).board).toEqual(before.board);
  expect((await snapshot(page)).history).toEqual(before.history);
  await page.locator('#trajectories').uncheck();
  await page.mouse.move(point.x, point.y);
  expect((await field(page)).focused).toBe(target);
  expect((await field(page)).guideCount).toBe(0);
});

test('keyboard focus explains a capture and Enter commits it', async ({ page }) => {
  await load(page, 'spatial-study');
  const destination = page.getByRole('button', { name: 'Move to (4, 3, 5)', exact: true });
  await destination.focus();
  expect((await field(page)).guideCount).toBe(1);
  expect((await snapshot(page)).ply).toBe(0);
  await expect(destination).toHaveClass(/inspected/);
  await page.locator('#piece-navigator').focus();
  expect((await field(page)).guideCount).toBe(0);
  await destination.focus();
  await destination.press('Enter');
  expect((await snapshot(page)).pieces[9].cell).toBeNull();
  expect((await field(page)).guideCount).toBe(0);
  await page.locator('#undo').click();
  expect((await field(page)).cells).toHaveLength(0);
});

test('slider and step guides use exactly the engine path; changing levels clears inspection', async ({ page }) => {
  await load(page, 'spatial-study');
  for (const [id, destination] of [['3', '(1, 2, 4)'], ['4', '(6, 2, 3)'], ['5', '(2, 4, 3)'], ['0', '(1, 0, 0)']]) {
    await page.locator('#piece-navigator').selectOption(id);
    expect((await field(page)).guideCount).toBe(0);
    const button = page.getByRole('button', { name: 'Move to ' + destination, exact: true });
    await button.focus();
    const rendered = await field(page);
    const move = (await snapshot(page)).moves.find(m => m.to === rendered.focused)!;
    const world = (c: number) => [c % 8 - 3.5, Math.floor(c / 64) - 3.5, Math.floor(c / 8) % 8 - 3.5];
    expect(rendered.guideCount).toBe(1);
    expect(rendered.dashed).toBe(false);
    expect(rendered.points).toEqual([move.from, ...move.path].map(world));
    expect((await snapshot(page)).ply).toBe(0);
  }
  await page.locator('#plane').selectOption('0');
  expect((await field(page)).guideCount).toBe(0);
});

test('check and promotion-dependent consequences appear only on inspection', async ({ page }) => {
  await page.locator('#piece-navigator').selectOption('3');
  await page.getByRole('button', { name: 'Move to (3, 7, 6)', exact: true }).focus();
  await expect(page.locator('#move-detail')).toContainText('Gives check.');
  expect((await snapshot(page)).status).toEqual({ kind: 'playing', check: false });
  expect((await snapshot(page)).ply).toBe(0);
  await load(page, 'promotion');
  expect((await field(page)).guideCount).toBe(0);
  await page.getByRole('button', { name: 'Move to (3, 3, 7)', exact: true }).focus();
  await expect(page.locator('#move-detail')).toContainText('Check depends on the promotion choice.');
  await expect(page.locator('#promotion-dialog')).not.toBeVisible();
  expect((await snapshot(page)).pieces[2].type).toBe('pawn');
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('touch selection, two-finger navigation and single-screen portrait/landscape', async ({ page, context }) => {
    await page.locator('#game-panel-button').click();
    await load(page, 'spatial-study');
    await page.locator('#game-panel-button').click();
    await clickCell(page, 4, 3, 5, true);
    expect((await snapshot(page)).ply).toBe(0);
    expect((await field(page)).guideCount).toBe(1);
    await expect(page.locator('#instruction')).toContainText('tap again');
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
    await page.screenshot({ path: 'docs/spatial-field-tablet.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.getByRole('button', { name: 'Isometric', exact: true }).click(); await frame(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(await page.evaluate(() => document.querySelector('.selected-section')!.getBoundingClientRect().bottom <= document.querySelector('#inspect-panel .panel-footnote')!.getBoundingClientRect().top + 1)).toBe(true);
    await page.screenshot({ path: 'docs/spatial-field-tablet-landscape.png' });
  });
});

test('autosave restores capture, profile, turn and history, with undo surviving reload', async ({ page }) => {
  await load(page, 'spatial-study', 'prototype-1-three');
  const before = await snapshot(page);
  await page.getByRole('button', { name: 'Move to (4, 3, 5)', exact: true }).click();
  const moved = await snapshot(page);
  await expect(page.locator('#save-status')).toContainText('Saved automatically');
  await page.reload();
  await expect(page.locator('#turn-label')).toHaveText('Black to move');
  expect((await snapshot(page)).board).toEqual(moved.board);
  expect((await snapshot(page)).history).toEqual(moved.history);
  await expect(page.locator('#profile')).toHaveValue('prototype-1-three');
  await expect(page.locator('#setup')).toHaveValue('spatial-study');
  await page.locator('#undo').click();
  await page.reload();
  expect((await snapshot(page)).pieces).toEqual(before.pieces);
  expect((await snapshot(page)).ply).toBe(0);
  await expect(page.locator('#undo')).toBeDisabled();
});

test('reset requires confirmation, cancel and Escape preserve the save, confirmed reset persists', async ({ page }) => {
  await load(page, 'spatial-study');
  await page.getByRole('button', { name: 'Move to (4, 3, 5)', exact: true }).click();
  const before = await snapshot(page);
  await page.locator('#reset-game').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await expect(page.locator('#cancel-reset')).toBeFocused();
  await page.locator('#cancel-reset').click();
  expect((await snapshot(page)).board).toEqual(before.board);
  await page.locator('#reset-game').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reset-dialog')).not.toBeVisible();
  await page.reload();
  expect((await snapshot(page)).board).toEqual(before.board);
  await page.locator('#reset-game').click();
  await page.locator('#confirm-reset').click();
  await page.reload();
  expect((await snapshot(page)).ply).toBe(0);
  expect((await snapshot(page)).pieces[9].cell).toBe(cell(4, 3, 5));
  await expect(page.locator('#setup')).toHaveValue('spatial-study');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('promotion autosave restores chosen type and undo restores captured piece', async ({ page }) => {
  await load(page, 'promotion');
  await page.getByRole('button', { name: 'Move to (4, 3, 7)', exact: true }).click();
  await page.locator('[data-promote="knight"]').click();
  await page.reload();
  expect((await snapshot(page)).pieces[2].type).toBe('knight');
  expect((await snapshot(page)).pieces[3].cell).toBeNull();
  await page.locator('#undo').click();
  expect((await snapshot(page)).pieces[2].type).toBe('pawn');
  expect((await snapshot(page)).pieces[3].cell).toBe(cell(4, 3, 7));
});

test('unreadable save is reported and preserved until explicit reset', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('cubical-chess.active-game', '{broken'));
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('unavailable or incompatible');
  expect(await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'))).toBe('{broken');
  expect((await snapshot(page)).pieces).toHaveLength(32);
  await page.locator('#reset-game').click();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#save-status')).toContainText('Saved automatically');
});

test('blocked storage keeps play usable and reports unsaved changes', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await load(page, 'spatial-study');
  await page.getByRole('button', { name: 'Move to (4, 3, 5)', exact: true }).click();
  expect((await snapshot(page)).ply).toBe(1);
  await expect(page.locator('#save-status')).toContainText('Could not save');
});


test('themes preserve selection, legal field, live state and save; resources recover on return', async ({ page }) => {
  await load(page, 'spatial-study');
  const before = await snapshot(page);
  const saved = await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'));
  const baseline = await page.evaluate(() => window.__cubical.presentation());
  for (let i = 0; i < 3; i++) {
    await page.locator('#theme').selectOption('luminous'); await frame(page);
    expect((await snapshot(page)).board).toEqual(before.board);
    expect((await snapshot(page)).selected).toBe(2);
    expect((await field(page)).cells).toHaveLength(24);
    await page.locator('#theme').selectOption('diagnostic'); await frame(page);
    expect((await page.evaluate(() => window.__cubical.presentation())).geometries).toBe(baseline.geometries);
    expect((await page.evaluate(() => window.__cubical.presentation())).textures).toBe(baseline.textures);
  }
  expect(await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'))).toBe(saved);
  await page.locator('#theme').selectOption('luminous');
  await page.getByRole('button', { name: 'Move to (4, 3, 5)', exact: true }).focus();
  expect((await field(page)).guideCount).toBe(1);
  expect((await field(page)).dashed).toBe(true);
  await page.getByRole('button', { name: 'Move to (4, 3, 5)', exact: true }).press('Enter');
  expect((await snapshot(page)).pieces[9].cell).toBeNull();
  await page.locator('#undo').click();
  expect((await snapshot(page)).board).toEqual(before.board);
});

test('camera focus and inspection orbit are presentation-only and immediately interruptible', async ({ page }) => {
  await load(page, 'spatial-study');
  const before = await snapshot(page);
  const saved = await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'));
  await page.locator('#camera-study summary').click();
  await page.locator('#focus-piece').click();
  await expect.poll(async () => (await page.evaluate(() => window.__cubical.presentation())).director).toBe('manual');
  expect((await page.evaluate(() => window.__cubical.presentation())).target).toEqual([-0.5, -0.5, -0.5]);
  await page.locator('#orbit-piece').click();
  expect((await page.evaluate(() => window.__cubical.presentation())).director).toBe('inspection');
  await page.keyboard.press('Tab');
  expect((await page.evaluate(() => window.__cubical.presentation())).director).toBe('manual');
  await page.locator('#orbit-piece').click();
  await page.mouse.move(500, 500); await page.mouse.wheel(0, 30);
  await expect.poll(async () => (await page.evaluate(() => window.__cubical.presentation())).director).toBe('manual');
  await page.locator('#orbit-piece').click();
  const point = await page.locator('#board canvas').boundingBox();
  await page.mouse.move(point!.x + 15, point!.y + 15); await page.mouse.down();
  expect((await page.evaluate(() => window.__cubical.presentation())).director).toBe('manual');
  await page.mouse.move(point!.x + 60, point!.y + 40); await page.mouse.up();
  expect((await snapshot(page)).board).toEqual(before.board);
  expect(await page.evaluate(() => localStorage.getItem('cubical-chess.active-game'))).toBe(saved);
});

test('luminous reduced-motion mode retains a static field and instant focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, 'spatial-study');
  await page.locator('#theme').selectOption('luminous');
  await page.locator('#camera-study summary').click();
  await page.locator('#orbit-piece').click();
  await frame(page);
  const presentation = await page.evaluate(() => window.__cubical.presentation());
  expect(presentation.director).toBe('manual'); expect(presentation.effects).toBe(false);
  expect((await field(page)).cells).toHaveLength(24);
  const renders = await page.evaluate(() => window.__cubical.metrics().renders);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__cubical.metrics().renders)).toBe(renders);
});

test('records theme study screenshots and comparable camera-motion metrics', async ({ page }) => {
  await load(page, 'spatial-study');
  for (const theme of ['diagnostic', 'luminous']) {
    await page.locator('#theme').selectOption(theme);
    await page.getByRole('button', { name: 'Isometric', exact: true }).click(); await frame(page);
    await page.screenshot({ path: 'docs/electric-regression-' + theme + '-study.png' });
    console.log('Static theme ' + theme + ':', JSON.stringify(await page.evaluate(() => ({ ...window.__cubical.metrics(), ...window.__cubical.presentation() })))) ;
    await page.locator('#camera-study summary').click();
    await page.locator('#orbit-piece').click();
    await page.waitForTimeout(1600);
    console.log('Theme study ' + theme + ':', JSON.stringify(await page.evaluate(() => ({ ...window.__cubical.metrics(), ...window.__cubical.presentation() }))));
    await page.locator('#manual-camera').click();
    await page.locator('#camera-study summary').click();
  }
  await page.getByRole('button', { name: 'Below', exact: true }).click(); await frame(page);
  await page.screenshot({ path: 'docs/electric-regression-luminous-below.png' });
  await page.locator('#ambient-effects').uncheck();
  await frame(page);
  const renders = await page.evaluate(() => window.__cubical.metrics().renders);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__cubical.metrics().renders)).toBe(renders);
});

test('dense opening keeps its legal field across themes and from below', async ({ page }) => {
  await page.locator('#piece-navigator').selectOption('3');
  const before = await snapshot(page), destinations = (await field(page)).cells;
  await page.locator('#theme').selectOption('luminous'); await frame(page);
  expect((await field(page)).cells).toEqual(destinations);
  expect((await snapshot(page)).board).toEqual(before.board);
  console.log('Luminous opening:', JSON.stringify(await page.evaluate(() => ({ ...window.__cubical.metrics(), ...window.__cubical.presentation() }))));
  await page.screenshot({ path: 'docs/electric-regression-luminous-opening.png' });
  await page.getByRole('button', { name: 'Below', exact: true }).click(); await frame(page);
  expect((await field(page)).cells).toEqual(destinations);
  await expect(page.locator('.piece-label:visible')).toHaveCount(32);
});

test.describe('luminous tablet', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('touch cancels camera motion and still picks a themed capture', async ({ page }) => {
    await page.locator('#game-panel-button').tap(); await load(page, 'spatial-study');
    await page.locator('#inspect-panel-button').tap();
    await page.locator('#theme').selectOption('luminous');
    await page.locator('#camera-study summary').tap();
    await page.locator('#orbit-piece').tap();
    expect((await page.evaluate(() => window.__cubical.presentation())).director).toBe('inspection');
    await page.locator('#inspect-panel-button').tap();
    expect((await page.evaluate(() => window.__cubical.presentation())).director).toBe('manual');
    await page.getByRole('button', { name: 'Isometric', exact: true }).tap();
    await page.screenshot({ path: 'docs/electric-regression-luminous-tablet.png' });
    await clickCell(page, 4, 3, 5, true);
    expect((await snapshot(page)).ply).toBe(0); expect((await field(page)).guideCount).toBe(1);
    await clickCell(page, 4, 3, 5, true);
    expect((await snapshot(page)).pieces[9].cell).toBeNull();
  });
});
