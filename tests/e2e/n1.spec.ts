import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('N1: import a pack, study flashcards, take a quiz, wrong-question bank', async ({ page }) => {
  await page.goto('/#/n1');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('n1-import').click()]);
  await chooser.setFiles(join(import.meta.dirname, 'fixtures', 'n1-test-pack.json'));
  await expect(page.getByTestId('n1-summary')).toContainText('1 / 6');
  await page.getByTestId('n1-confirm-import').click();
  await expect(page.getByTestId('n1-today')).toBeVisible();

  // flashcards
  await page.getByTestId('n1-today').click();
  for (let i = 0; i < 6; i++) {
    await page.getByTestId('n1-reveal').click();
    await expect(page.getByTestId('n1-meaning')).toContainText('nghĩa thử');
    await page.getByTestId('n1-rate-4').click();
  }
  await expect(page.getByTestId('n1-cards-done')).toBeVisible();

  // quiz: first answer wrong, rest right
  await page.goto('/#/n1');
  await page.getByRole('button', { name: 'Làm đề' }).click();
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId('n1-prompt')).toContainText(`Câu hỏi thử số ${i}`);
    await page.locator(`[data-testid^="n1-opt-"][data-correct="${i === 0 ? 'false' : 'true'}"]`).first().click();
    await page.getByTestId('n1-next').click();
  }
  await expect(page.getByTestId('n1-quiz-result')).toContainText('3/4');

  // wrong bank has exactly that question; answering it right empties the bank
  await page.goto('/#/n1/quiz/wrong');
  await expect(page.getByTestId('n1-prompt')).toContainText('Câu hỏi thử số 0');
  await page.locator('[data-testid^="n1-opt-"][data-correct="true"]').click();
  await page.getByTestId('n1-next').click();
  await page.goto('/#/n1');
  await expect(page.getByTestId('n1-wrong')).toContainText('0 câu');
});

test('N1 cards in games and on the floating card', async ({ page }) => {
  await page.goto('/#/n1');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('n1-import').click()]);
  await chooser.setFiles(join(import.meta.dirname, 'fixtures', 'n1-test-pack.json'));
  await page.getByTestId('n1-confirm-import').click();
  await page.getByTestId('n1-games').click();
  await expect(page.getByTestId('quiz-source')).toHaveValue('n1');
  await page.getByTestId('game-match').click();
  const left = page.locator('[data-testid^="match-ja-"]');
  await expect(left).toHaveCount(6, { timeout: 30_000 });
  await expect(left.first()).toContainText('試験語');
  for (const k of await left.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!))) {
    await page.getByTestId(k).click();
    await page.getByTestId(k.replace('match-ja-', 'match-vi-')).click();
  }
  await expect(page.getByTestId('quiz-result')).toContainText('6/6 đúng');

  await page.waitForTimeout(1500); // let the preview DB flush to IndexedDB
  await page.goto('/?window=card');
  await page.getByTestId('card-menu').click();
  await page.getByTestId('card-deck-n1').click();
  await expect(page.getByTestId('card-word')).toContainText('試験語', { timeout: 30_000 });
  await expect(page.getByTestId('card-fav')).toHaveCount(0);
  await page.getByTestId('card-reveal').click();
  await expect(page.getByTestId('card-meaning')).toContainText('nghĩa thử');
  await page.getByTestId('card-rate-3').click();
  await expect(page.getByTestId('card-word')).toContainText('試験語');
});
