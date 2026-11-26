import { expect, test } from '@playwright/test';

test.describe('quiz & games', () => {
  test('multiple choice: answer 10 questions (one wrong on purpose), save result, requeue wrong word', async ({ page }) => {
    await page.goto('/#/quiz');
    await page.getByTestId('game-choice').click();
    for (let i = 0; i < 10; i++) {
      await expect(page.getByTestId('quiz-prompt')).toBeVisible({ timeout: 30_000 });
      const sel = i === 0 ? '[data-correct="false"]' : '[data-correct="true"]';
      await page.locator(`.quiz-option${sel}`).first().click();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByTestId('quiz-result')).toBeVisible();
    await expect(page.getByTestId('quiz-result')).toContainText('9/10 đúng');
    await page.getByTestId('requeue').click();
    await expect(page.getByTestId('requeue')).toContainText('Đã đưa vào ôn lại');
    await page.goto('/#/quiz');
    await expect(page.getByTestId('game-choice')).toContainText('🏆');
  });

  test('matching game: pair all cards', async ({ page }) => {
    await page.goto('/#/quiz/match?source=all');
    const left = page.locator('[data-testid^="match-ja-"]');
    await expect(left).toHaveCount(6, { timeout: 30_000 });
    const keys = await left.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
    for (const k of keys) {
      await page.getByTestId(k).click();
      await page.getByTestId(k.replace('match-ja-', 'match-vi-')).click();
    }
    await expect(page.getByTestId('quiz-result')).toBeVisible();
    await expect(page.getByTestId('quiz-result')).toContainText('6/6 đúng');
  });

  test('true/false: keyboard answers update the score', async ({ page }) => {
    await page.goto('/#/quiz/truefalse?source=all');
    await expect(page.getByTestId('tf-meaning')).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 6; i++) await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await expect(page.getByTestId('tf-score')).not.toHaveText('⭐ 0');
  });
});
