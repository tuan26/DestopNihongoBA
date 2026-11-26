import { expect, test } from '@playwright/test';

test.describe('browser preview (sql.js adapter)', () => {
  test('first run seeds 1000 words, Quick 5 session updates progress, library search & add word', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('stat-total')).toContainText('1.000', { timeout: 30_000 });

    // Quick 5
    await page.getByTestId('quick5').click();
    for (let i = 0; i < 5; i++) {
      await expect(page.getByTestId('flashcard')).toBeVisible();
      await page.keyboard.press('Space');
      await expect(page.getByTestId('meaning')).toBeVisible();
      await page.getByTestId('rate-4').click(); // Easy graduates new cards (Good would re-queue them via FSRS learning steps)
    }
    await expect(page.getByTestId('session-done')).toBeVisible();

    // dashboard reflects reviews
    await page.goto('/#/');
    await expect(page.locator('.stat', { hasText: 'Đã ôn hôm nay' })).toContainText('5');

    // persists after reload (IndexedDB). Give the throttled writer (250 ms) time to flush, as a real user would.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.locator('.stat', { hasText: 'Đã ôn hôm nay' })).toContainText('5', { timeout: 30_000 });

    // library search by reading
    await page.goto('/#/library');
    await page.getByTestId('search').fill('にんしきあわせ');
    await expect(page.locator('.ja-word', { hasText: '認識合わせ' })).toBeVisible();

    // add a personal word
    await page.getByTestId('add-word').click();
    await page.locator('input[name=japanese]').fill('棚上げ案件');
    await page.locator('input[name=reading]').fill('たなあげあんけん');
    await page.locator('input[name=vietnamese]').fill('Hạng mục bị gác lại');
    await page.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect(page.getByTestId('detail')).toContainText('棚上げ案件');
    await page.getByTestId('search').fill('たなあげあんけん');
    await expect(page.getByTestId('result-count')).toContainText('1 từ');
  });

  test('floating card: reveal, favorite, rate, next', async ({ page }) => {
    await page.goto('/?window=card');
    const word = page.getByTestId('card-word');
    await expect(word).toBeVisible({ timeout: 30_000 });
    const first = await word.textContent();
    await page.getByTestId('card-reveal').click();
    await expect(page.getByTestId('card-meaning')).toBeVisible();
    await page.getByTestId('card-fav').click();
    await expect(page.getByTestId('card-fav')).toHaveText('★');
    await page.getByTestId('card-rate-3').click();
    await expect(word).not.toHaveText(first ?? '');
    await page.keyboard.press('ArrowLeft');
    await expect(word).toHaveText(first ?? '');
  });

  test('excel export downloads an xlsx', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.getByTestId('result-count')).toContainText('1.000', { timeout: 30_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-btn').click()]);
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
