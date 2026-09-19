import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { encodeGame, moveLabel, SAVE_KEY, type HistoryEntry } from '../../src/app/saved-game';
import { commitMove, legalMoves, sideToMove } from '../../src/rules/engine';
import { createSetup, type SetupId } from '../../src/rules/setups';

function fixture(setup: SetupId = 'spatial-study') {
  const state = createSetup(setup, 'prototype-1-three');
  const positions = [structuredClone(state)];
  const history: HistoryEntry[] = [];
  for (let i = 0; i < 4; i++) {
    const moves = legalMoves(state);
    const move = i === 0 ? moves.find(m => m.capturedId !== null && m.pieceId === 2 && (!m.promotion || m.promotion === 'knight'))! : moves[(i * 13) % moves.length];
    const owner = sideToMove(state);
    const undo = commitMove(state, move);
    history.push({ undo, owner, label: moveLabel(undo.previousType, undo.move) });
    positions.push(structuredClone(state));
  }
  return { raw: encodeGame(setup, state.profile, history), positions, history };
}
const replay = (page: Page) => page.evaluate(() => window.__cubical.replay());
const live = (page: Page) => page.evaluate(() => {
  const { board, pieces, ply, history } = window.__cubical.snapshot();
  return { board, pieces, ply, history };
});
async function load(page: Page, raw: string) {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: SAVE_KEY, raw });
  await page.goto('/');
  await page.waitForFunction(() => window.__cubical);
}

for (const setup of ['spatial-study', 'promotion'] as const) {
  test(`replay steps ${setup} through capture/promotion while protecting live history, export and autosave`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const { raw, positions } = fixture(setup);
    await load(page, raw);
    const before = await live(page);
    await page.getByRole('button', { name: 'Jump to start' }).click();
    expect((await replay(page)).pieces).toEqual(positions[0].pieces);
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    let current = await replay(page);
    expect(current.cursor).toBe(1);
    expect(current.pieces).toEqual(positions[1].pieces);
    // The actual mesh moves between cells, including when its type changes at promotion.
    expect(current.animation.active).toBe(true);
    const moving = current.animation.pieces.find(p => p.id === 2)!;
    expect(moving.position).not.toEqual(moving.target);
    await page.waitForFunction(() => !window.__cubical.replay().animation.active);
    current = await replay(page);
    expect(current.animation.pieces.find(p => p.id === 2)!.position).toEqual(moving.target);
    await expect(page.locator('#history [aria-current="step"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Previous move' }).click();
    expect((await replay(page)).pieces).toEqual(positions[0].pieces);
    await page.waitForFunction(() => !window.__cubical.replay().animation.active);
    await page.locator('#piece-navigator').selectOption('2');
    await expect(page.locator('#destinations')).toContainText('read-only');
    await expect(page.locator('#destinations button')).toHaveCount(0);
    expect(await live(page)).toEqual(before);
    expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBe(raw);
    const downloading = page.waitForEvent('download');
    await page.locator('#export-game').click();
    expect(await readFile((await (await downloading).path())!, 'utf8')).toBe(raw);
    await page.getByRole('button', { name: 'Back to present' }).click();
    expect((await replay(page)).active).toBe(false);
    expect((await replay(page)).pieces).toEqual(positions.at(-1)!.pieces);
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').click();
    expect((await live(page)).pieces).toEqual(positions.at(-2)!.pieces);
    expect(errors).toEqual([]);
  });
}

test('auto-play animates, pauses in place, resumes, stops at the end and returns to present', async ({ page }) => {
  const { raw, positions } = fixture();
  await load(page, raw);
  await page.getByRole('button', { name: 'Play replay' }).click();
  await page.waitForFunction(() => {
    const replay = window.__cubical.replay();
    return replay.cursor === 1 && replay.animation.active;
  });
  await page.getByRole('button', { name: 'Pause replay' }).click();
  const paused = await replay(page);
  expect(paused.playing).toBe(false);
  expect(paused.animation.paused).toBe(true);
  await page.waitForTimeout(1700);
  expect(await replay(page)).toEqual(paused);
  await page.getByRole('button', { name: 'Play replay' }).click();
  await page.waitForFunction(() => {
    const replay = window.__cubical.replay();
    return replay.cursor === replay.length && !replay.playing;
  });
  expect((await replay(page)).pieces).toEqual(positions.at(-1)!.pieces);
  await expect(page.locator('#replay-status')).toContainText('Replay complete');
  await expect(page.locator('#replay-next')).toBeDisabled();
  // Play again starts at the beginning; returning live cancels the scheduled next move.
  await page.getByRole('button', { name: 'Play replay' }).click();
  await page.getByRole('button', { name: 'Back to present' }).click();
  await page.waitForTimeout(1700);
  expect((await replay(page)).active).toBe(false);
  expect((await replay(page)).pieces).toEqual(positions.at(-1)!.pieces);
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBe(raw);
});

test('reduced motion, reload during replay, and reset safely exit playback', async ({ page }) => {
  const { raw, positions } = fixture();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, raw);
  await page.locator('#replay-start').click();
  await page.locator('#replay-next').click();
  expect((await replay(page)).animation.active).toBe(false);
  expect((await replay(page)).pieces).toEqual(positions[1].pieces);
  await page.reload();
  await page.waitForFunction(() => window.__cubical);
  expect((await replay(page)).active).toBe(false);
  expect((await replay(page)).pieces).toEqual(positions.at(-1)!.pieces);
  await page.locator('#replay-play').click();
  await page.locator('#reset-game').click();
  expect((await replay(page)).playing).toBe(false);
  await page.locator('#confirm-reset').click();
  await page.waitForTimeout(1700);
  expect((await replay(page)).active).toBe(false);
  expect((await live(page)).ply).toBe(0);
  await expect(page.locator('#replay-play')).toBeDisabled();
});

test('tablet controls and theme changes work in replay; loading another file cancels playback', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await load(page, fixture().raw);
  await page.locator('#game-panel-button').click();
  await page.locator('#replay-start').click();
  await expect(page.locator('#replay-play')).toBeInViewport();
  await expect(page.locator('#replay-present')).toBeInViewport();
  const before = await replay(page);
  await page.locator('#inspect-panel-button').click();
  await page.locator('#theme').selectOption('luminous');
  expect((await replay(page)).pieces).toEqual(before.pieces);
  await page.locator('#inspect-panel-button').click();
  await page.screenshot({ path: testInfo.outputPath('replay-tablet.png') });
  await page.locator('#game-panel-button').click();
  await page.locator('#replay-play').click();
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#import-game').click();
  const imported = fixture('promotion');
  await (await choosing).setFiles({ name: '20260919-123456.chess3.json', mimeType: 'application/json', buffer: Buffer.from(imported.raw) });
  await page.locator('#confirm-import').click();
  await page.waitForTimeout(1700);
  expect((await replay(page)).active).toBe(false);
  expect((await live(page)).pieces).toEqual(imported.positions.at(-1)!.pieces);
  await page.locator('#replay-start').click();
  expect((await replay(page)).pieces).toEqual(imported.positions[0].pieces);
});
