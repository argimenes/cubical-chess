import { expect, test, type Page } from '@playwright/test';
import { inspectContinuation } from '../../src/app/inspect-move';
import { legalMoves } from '../../src/rules/engine';
import { cell } from '../../src/rules/geometry';
import { createSetup, type SetupId } from '../../src/rules/setups';

const field = (page: Page) => page.evaluate(() => window.__cubical.movementField());
const expected = (setup: SetupId, target: number) => [...new Set(inspectContinuation(createSetup(setup),
  legalMoves(createSetup(setup), 2).filter(m => m.to === target)).moves.map(m => m.to))].sort((a, b) => a - b);
const errors: string[] = [];
test.beforeEach(async ({page}) => {
  errors.length = 0; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/'); await page.waitForFunction(() => window.__cubical);
  await page.locator('#setup').selectOption('spatial-study'); await page.locator('#new-game').click();
});
test.afterEach(() => expect(errors).toEqual([]));

test('canvas hover reveals an engine-derived silver field, and leaving restores the gold field without mutation', async ({page}) => {
  await page.locator('#theme').selectOption('luminous');
  await page.locator('#ambient-effects').uncheck();
  const before = await page.evaluate(() => ({state: window.__cubical.snapshot(), save: localStorage.getItem('cubical-chess.active-game')}));
  const gold = (await field(page)).cells;
  const point = await page.evaluate(() => window.__cubical.project(348));
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await field(page)).continuation.origin).toBe(348);
  expect((await field(page)).continuation.cells.sort((a, b) => a - b)).toEqual(expected('spatial-study', 348));
  expect((await field(page)).continuation.interactive).toBe(false);
  expect((await field(page)).cells).toEqual(gold);
  await expect(page.locator('#move-detail')).toContainText('assuming no opponent response');
  await page.screenshot({path: 'docs/silver-continuation-preview.png'});
  await page.mouse.move(10, 10);
  expect((await field(page)).continuation).toEqual({origin: null, cells: [], interactive: false});
  expect((await field(page)).cells).toEqual(gold);
  expect(await page.evaluate(() => ({state: window.__cubical.snapshot(), save: localStorage.getItem('cubical-chess.active-game')}))).toEqual(before);
});

test('keyboard focus replaces the silver field across themes and Enter commits only the gold move', async ({page}) => {
  for (const theme of ['diagnostic', 'luminous', 'crystal']) {
    await page.locator('#theme').selectOption(theme);
    await page.getByRole('button', {name: 'Move to (4, 3, 5)', exact: true}).focus();
    expect((await field(page)).continuation.cells.sort((a, b) => a - b)).toEqual(expected('spatial-study', 348));
    await page.getByRole('button', {name: 'Move to (1, 2, 3)', exact: true}).focus();
    expect((await field(page)).continuation.origin).toBe(cell(1, 2, 3));
    expect((await field(page)).continuation.cells.sort((a, b) => a - b)).toEqual(expected('spatial-study', cell(1, 2, 3)));
  }
  await page.locator('#theme').selectOption('luminous');
  const capture = page.getByRole('button', {name: 'Move to (4, 3, 5)', exact: true});
  await capture.focus(); await capture.press('Enter');
  const state = await page.evaluate(() => window.__cubical.snapshot());
  expect(state.ply).toBe(1); expect(state.pieces[2].cell).toBe(348); expect(state.pieces[9].cell).toBeNull();
  expect((await field(page)).continuation.cells).toEqual([]);
  await page.locator('#replay-start').click();
  expect((await field(page)).continuation.cells).toEqual([]);
});

test('silver previews respect isolation and explicitly describe promotion alternatives', async ({page}) => {
  await page.locator('#plane').selectOption('3'); await page.locator('#isolate').check();
  await page.getByRole('button', {name: 'Move to (1, 2, 3)', exact: true}).focus();
  const cells = (await field(page)).continuation.cells;
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every(c => Math.floor(c / 64) === 3)).toBe(true);
  await page.locator('#isolate').uncheck();
  await page.locator('#setup').selectOption('promotion'); await page.locator('#new-game').click();
  await page.getByRole('button', {name: 'Move to (4, 3, 7)', exact: true}).focus();
  await expect(page.locator('#move-detail')).toContainText('Includes all promotion choices');
  expect((await field(page)).continuation.cells.sort((a, b) => a - b)).toEqual(expected('promotion', cell(4, 3, 7)));
  expect((await page.evaluate(() => window.__cubical.snapshot())).pieces[2].type).toBe('pawn');
  await page.locator('#piece-navigator').selectOption('1');
  expect((await field(page)).continuation.cells).toEqual([]);
});
