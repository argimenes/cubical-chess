import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY } from '../../src/app/saved-game';

async function game(page: Page) {
  return page.evaluate(() => {
    const { board, pieces, ply, side, history } = window.__cubical.snapshot();
    return { board, pieces, ply, side, history };
  });
}
const stored = (page: Page) => page.evaluate(key => localStorage.getItem(key), SAVE_KEY);

async function chooseFile(page: Page, contents: string, name = '20260919-123456.chess3.json') {
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#import-game').click();
  await (await choosing).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(contents) });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__cubical);
});

for (const setup of ['spatial-study', 'promotion']) {
  test(`game file round-trip retains ${setup} capture, history, profile and undo`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('#setup').selectOption(setup);
    await page.locator('#profile').selectOption('prototype-1-three');
    await page.locator('#new-game').click();
    const initial = await game(page);
    const target = setup === 'promotion' ? '(4, 3, 7)' : '(4, 3, 5)';
    await page.getByRole('button', { name: 'Move to ' + target, exact: true }).click();
    if (setup === 'promotion') await page.locator('[data-promote="knight"]').click();
    const played = await game(page);
    expect(played.ply).toBe(1);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^\d{8}-\d{6}\.chess3\.json$/);
    const raw = await readFile((await download.path())!, 'utf8');
    expect(JSON.parse(raw)).toEqual(JSON.parse((await stored(page))!));

    // Loading over a played game can be cancelled by button or Escape.
    for (const cancel of ['button', 'escape']) {
      await chooseFile(page, raw);
      await expect(page.locator('#import-dialog')).toBeVisible();
      if (cancel === 'button') await page.locator('#cancel-import').click();
      else await page.keyboard.press('Escape');
      await expect(page.locator('#import-dialog')).not.toBeVisible();
      expect(await game(page)).toEqual(played);
      expect(JSON.parse((await stored(page))!)).toEqual(JSON.parse(raw));
    }

    // Replace it with a different position, then import through confirmation.
    await page.locator('#setup').selectOption('outer-planes');
    await page.locator('#profile').selectOption('prototype-1');
    await page.locator('#new-game').click();
    await page.locator('#confirm-reset').click();
    await page.locator('#piece-navigator').selectOption('11');
    await page.getByRole('button', { name: 'Move to (3, 2, 1)', exact: true }).click();
    await chooseFile(page, raw);
    await page.locator('#confirm-import').click();
    await expect(page.locator('#file-status')).toContainText('Loaded');
    expect(await game(page)).toEqual(played);
    await expect(page.locator('#setup')).toHaveValue(setup);
    await expect(page.locator('#profile')).toHaveValue('prototype-1-three');
    await page.reload();
    await page.waitForFunction(() => window.__cubical);
    expect(await game(page)).toEqual(played);
    await page.locator('#undo').click();
    expect(await game(page)).toEqual(initial);
    expect(errors).toEqual([]);
  });
}

test('invalid files leave the game and autosave intact; file picker can retry', async ({ page }) => {
  await page.locator('#piece-navigator').selectOption('11');
  await page.getByRole('button', { name: 'Move to (3, 2, 1)', exact: true }).click();
  const before = await game(page);
  const saved = (await stored(page))!;
  const data = JSON.parse(saved);
  for (const raw of ['{', JSON.stringify({ ...data, rulesVersion: 999 }),
    JSON.stringify({ ...data, moves: [...data.moves, { from: 11, to: 12 }] })]) {
    await chooseFile(page, raw);
    await expect(page.locator('#file-status')).toContainText('Could not load');
    await expect(page.locator('#import-dialog')).not.toBeVisible();
    expect(await game(page)).toEqual(before);
    expect(await stored(page)).toBe(saved);
  }
  await chooseFile(page, saved);
  await page.locator('#confirm-import').click();
  await expect(page.locator('#file-status')).toContainText('Loaded');
  expect(await game(page)).toEqual(before);
});

test('file save and load work without localStorage, including a fresh game', async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  const before = await game(page);
  const downloading = page.waitForEvent('download');
  await page.locator('#export-game').click();
  const raw = await readFile((await (await downloading).path())!, 'utf8');
  await chooseFile(page, raw);
  await expect(page.locator('#file-status')).toContainText('Loaded');
  await expect(page.locator('#save-status')).toContainText('Could not save');
  expect(await game(page)).toEqual(before);
  await page.locator('#piece-navigator').selectOption('11');
  await page.getByRole('button', { name: 'Move to (3, 2, 1)', exact: true }).click();
  const nextDownload = page.waitForEvent('download');
  await page.locator('#export-game').click();
  const played = JSON.parse(await readFile((await (await nextDownload).path())!, 'utf8'));
  expect(played.moves).toEqual([{ from: 19, to: 83 }]);
});
