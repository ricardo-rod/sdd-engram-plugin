// @ts-nocheck
// Browser evidence for the assembled file:// artifact. No screenshots, traces, or videos are emitted.
import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactUrl = pathToFileURL(path.join(projectRoot, 'Task-Manager-Portable.html')).href;
const viewports = [
  { width: 320, height: 568 }, { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 414, height: 896 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
  { width: 1280, height: 720 }, { width: 1440, height: 1000 }, { width: 1920, height: 1080 },
];

test.use({ serviceWorkers: 'block', screenshot: 'off', trace: 'off', video: 'off' });

test.beforeEach(async ({ page }) => {
  await page.context().route('**/*', async (route) => {
    const url = route.request().url();
    if (url === artifactUrl || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    await route.abort('blockedbyclient');
  });
});

test('fixed offline artifact preserves boundaries and browser behavior', async ({ page }) => {
  const blockedUrls = [];
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize(viewports[0]);
  await page.goto(artifactUrl, { waitUntil: 'load' });
  await expect(page).toHaveURL(artifactUrl);
  const islandBefore = await page.locator('#tm-state').textContent();

  page.on('request', (request) => { if (/^https?:/i.test(request.url())) blockedUrls.push(request.url()); });
  await page.goto('https://example.invalid/', { waitUntil: 'commit' }).catch(() => {});
  await expect(page).toHaveURL(/^(chrome-error:|file:)/);
  await page.goto(artifactUrl, { waitUntil: 'load' });
  await expect(page).toHaveURL(artifactUrl);
  assert.deepEqual(blockedUrls, ['https://example.invalid/']);

  const welcomeDialog = page.locator('#welcome-dialog');
  if (await welcomeDialog.isVisible()) {
    await expect(page.locator('#welcome-dialog-title')).toBeVisible();
    await expect(page.locator('[data-welcome-prompt]')).toBeVisible();
    await page.locator('[data-welcome-close]').first().click();
    await expect(welcomeDialog).not.toBeVisible();
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${viewport.width} has document horizontal overflow`);
  }
  await page.keyboard.press('2');
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 812 });
    const metadata = await page.locator('.task-footer-row').first().boundingBox();
    assert.ok(metadata && metadata.x >= 0 && metadata.x + metadata.width <= width, `${width} task metadata is clipped`);
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('#task-filter-reset')).toBeVisible();
  await expect(page.locator('#filter-result-count')).toBeVisible();
  for (const control of await page.locator('#task-filter-text:visible, #task-filter-status:visible, #task-filter-owner:visible, #task-filter-tag:visible, #task-filter-phase:visible, #task-filter-reset:visible, #btn-filter-all:visible, #btn-filter-active:visible').all()) {
    const box = await control.boundingBox();
    if (box) assert.ok(box.width >= 44 && box.height >= 44, `${await control.getAttribute('id')} is ${box.width}×${box.height}`);
  }

  for (const index of [0, 1, 2, 3, 4, 5, 6]) {
    await page.locator('.tab-btn[data-target-view]').nth(index).click();
    await expect(page.locator('.tab-btn[aria-selected="true"]')).toHaveCount(1);
    await page.keyboard.press(String(index + 1));
  }
  await page.keyboard.press('2');
  const editable = page.locator('#task-filter-text');
  await editable.fill('phase');
  await editable.press('7');
  await expect(editable).toHaveValue(/phase7/);
  await page.keyboard.press('Escape');

  await page.keyboard.press('2');
  await page.keyboard.press('E');
  await page.keyboard.press('E');
  await page.keyboard.press('/');
  await expect(editable).toBeFocused();
  await editable.fill('nonexistent-xyz');
  await expect(page.locator('#filter-result-count')).toContainText(/0|No se encontraron/i);
  await page.locator('#task-filter-reset').click();
  await expect(page.locator('#filter-result-count')).not.toContainText(/0 visibles/i);

  await page.keyboard.press('7');
  const prompt = page.locator('[data-help-prompt]');
  await expect(prompt).toBeVisible();
  await expect(page.locator('[data-copy-prompt-feedback]')).toHaveAttribute('role', 'status');
  await page.locator('[data-copy-prompt]').click();
  await expect(page.locator('[data-copy-prompt-feedback]')).toContainText(/Copiado|Selecciona/i);
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
    return ids.length - new Set(ids).size;
  });
  assert.equal(duplicateIds, 0);

  await page.locator('.tab-btn[data-target-view="view-codegraph"]').click();
  const node = page.locator('#full-codegraph-mount [role="button"]').first();
  await expect(node).toBeVisible();
  await node.click();
  const dialog = page.locator('#codegraph-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-labelledby');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.id), 'codegraph-dialog');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.id), 'codegraph-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(node).toBeFocused();
  await node.press('Enter');
  await expect(dialog).toBeVisible();
  await page.locator('[data-codegraph-close]').click();
  await node.press(' ');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const zoomGeometry = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(zoomGeometry.scrollWidth <= zoomGeometry.clientWidth, '200% text zoom has document horizontal overflow');
  assert.equal(await page.locator('#tm-state').textContent(), islandBefore);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys.filter((key) => key !== 'tm-ui-preferences'), []);
  assert.equal(keys.includes('tm-ui-preferences'), false, 'file:// uses in-memory preferences to avoid opaque-origin storage access');
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.evaluate(() => localStorage.getItem('tm-ui-preferences')), null);
  if (await welcomeDialog.isVisible()) {
    await page.locator('[data-welcome-close]').first().click();
    await expect(welcomeDialog).not.toBeVisible();
  }
  await page.locator('#tab-btn-overview').click();
  const clock = page.locator('#tm-digital-clock');
  await expect(clock).toBeVisible();
  await expect(page.locator('#clock-hours')).toHaveText(/^\d{2}$/);
  await expect(page.locator('#clock-minutes')).toHaveText(/^\d{2}$/);
  await expect(page.locator('#clock-seconds')).toHaveText(/^\d{2}$/);
  await expect(page.locator('#tm-last-update')).toBeVisible();
  await expect(page.locator('#tm-harness-card')).toBeVisible();
  await expect(page.locator('#harness-name')).toHaveText('OpenCode');
  await expect(page.locator('#project-logo-icon svg')).toBeVisible();

  // Test 12h/24h toggle
  const clockToggleBtn = page.locator('#btn-clock-toggle-format');
  await expect(clockToggleBtn).toBeVisible();
  await clockToggleBtn.click();
  await expect(clock).toHaveAttribute('data-clock-format', '24h');
  await expect(page.locator('#clock-format-tag')).toHaveText('24H');
  await clockToggleBtn.click();
  await expect(clock).toHaveAttribute('data-clock-format', '12h');
  await expect(page.locator('#clock-format-tag')).toHaveText('12H');

  // Test Señal de Atención (Todo) Dialog
  const todoItem = page.locator('#todo-items-container .todo-item').first();
  await todoItem.click();
  const todoDialog = page.locator('#todo-detail-dialog');
  await expect(todoDialog).toBeVisible();
  await expect(page.locator('#todo-detail-desc')).toBeVisible();
  await page.locator('[data-todo-close]').first().click();
  await expect(todoDialog).not.toBeVisible();

  // Test Task Detail Dialog in Phases
  await page.keyboard.press('2');
  const taskCard = page.locator('#phases-list .task-item').first();
  await taskCard.click();
  const taskDialog = page.locator('#task-detail-dialog');
  await expect(taskDialog).toBeVisible();
  await expect(page.locator('#task-detail-owner')).toHaveText(/sdd|Ana|Elena|Carlos|Luis/i);
  await page.locator('[data-task-close]').first().click();
  await expect(taskDialog).not.toBeVisible();

  // Test Task Detail Dialog in Kanban
  await page.keyboard.press('3');
  const kanbanTask = page.locator('#kanban-board-mount .task-item').first();
  await kanbanTask.click();
  await expect(taskDialog).toBeVisible();
  await page.locator('[data-task-close]').first().click();
  await expect(taskDialog).not.toBeVisible();

  // Test Git Detail Dialog
  await page.keyboard.press('6');
  const gitCard = page.locator('#full-git-mount .git-event-card').first();
  await gitCard.click();
  const gitDialog = page.locator('#git-detail-dialog');
  await expect(gitDialog).toBeVisible();
  await page.locator('[data-git-close]').first().click();
  await expect(gitDialog).not.toBeVisible();

  await page.keyboard.press('1');
  const metricIds = await page.locator('#metrics-overview > .metric-card').evaluateAll((cards) => cards.map((card) => card.id));
  assert.deepEqual(metricIds, ['metric-overview-risk', 'metric-overall-card', 'metric-current-focus', 'metric-distribution', 'metric-git', 'metric-phase-coverage', 'metric-active-workload', 'metric-data-coverage', 'metric-insights']);
  const metric = page.locator('#metric-overall-card');
  await metric.focus();
  await metric.press('Enter');
  const overviewDialog = page.locator('#overview-detail-dialog');
  await expect(overviewDialog).toBeVisible();
  await expect(overviewDialog).toContainText('Progreso Global');
  const dialogBox = await overviewDialog.boundingBox();
  assert.ok(dialogBox && Math.abs((dialogBox.x + dialogBox.width / 2) - (page.viewportSize().width / 2)) < 4, 'metric dialog is not horizontally centered');
  await page.keyboard.press('Escape');
  await expect(metric).toBeFocused();
  await page.locator('#tab-btn-help').click();
  await expect(page.locator('.state-health-card')).toBeVisible();
  await expect(page.locator('.state-tools-advanced')).not.toHaveAttribute('open', '');
  assert.deepEqual(errors, []);
});
