import { expect, test } from '@playwright/test';
import { answer, playTwenty } from './helpers';

test('home → Train → Start reaches the first problem, with the number pad', async ({ page }) => {
  await page.goto('/?e2e=1#/');
  await page.getByTestId('home-train').tap();
  await page.getByTestId('start-train').tap();
  await expect(page.getByTestId('problem')).toHaveText(/\d/);
  await expect(page.getByTestId('answer')).toBeFocused();
  // Touch screen: the on-screen pad replaces the system keyboard.
  await expect(page.getByTestId('keypad')).toBeVisible();
  await expect(page.getByTestId('answer')).toHaveAttribute('inputmode', 'none');
});

test('answers can be typed on the number pad', async ({ page }) => {
  await page.goto('/?e2e=1#/drill?k=technique&ids=mul-2x1&l=1&m=training');
  const value = await page.evaluate(() => (window as unknown as { __mm: { answer(): string } }).__mm.answer());
  await page.locator('[data-key="9"]').tap();
  await page.locator('[data-key="back"]').tap();
  for (const d of value) await page.locator(`[data-key="${d}"]`).tap();
  await expect(page.getByTestId('answer')).toHaveValue(value);
  await page.locator('[data-key="enter"]').tap();
  await expect(page.getByTestId('feedback')).toHaveText(/✓/);
  await expect(page.getByTestId('stat')).toHaveText('✓1 ✗0');
});

test('completes a 20-problem run and records it', async ({ page }) => {
  await playTwenty(page);
  // Every problem gets solved (the miss was retried), so the score is the time.
  await expect(page.getByTestId('score')).toHaveText(/^\d+\.\d$/);
  await expect(page.locator('.score-caption')).toHaveText('for 20/20 problems');
  await expect(page.getByTestId('leaderboard').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Personal best')).toBeVisible();
  // First time: add a name to the leaderboard; the run picks it up.
  await page.getByTestId('nickname').fill('Rey');
  await page.getByTestId('nickname').press('Enter');
  await expect(page.getByTestId('leaderboard').locator('td.who').first()).toHaveText('Rey');
  await expect(page.getByTestId('nickname')).toHaveCount(0);
  // The run shows up in Stats.
  await page.getByTestId('top-stats').tap();
  await expect(page.getByTestId('totals')).toContainText('20');
});

test('training: a miss keeps the problem to retry; Show answer gives the full solution', async ({ page }) => {
  await page.goto('/?e2e=1#/drill?k=technique&ids=complements&l=2&m=training');
  await page.getByTestId('hint').tap();
  await expect(page.getByTestId('hint-steps').locator('.step')).toHaveCount(2);
  const problem = await page.getByTestId('problem').textContent();
  await answer(page, false);
  // Same problem, a nudge, and one more line of the method.
  await expect(page.getByTestId('feedback')).toHaveText(/try again/i);
  await expect(page.getByTestId('problem')).toHaveText(problem!);
  await expect(page.getByTestId('hint-steps').locator('.step')).toHaveCount(3);
  await expect(page.getByTestId('keypad')).toBeVisible();
  await page.getByTestId('reveal').tap();
  const solution = page.getByTestId('solution');
  await expect(solution).toBeVisible();
  // Level II was chosen, but drills start at Level I: 100 − a 2-digit number.
  await expect(solution.locator('.steps .step').first()).toHaveText(/^100\s*−\s*\d+$/);
  await page.getByTestId('next').tap();
  await expect(solution).toBeHidden();
  await answer(page, true);
  await expect(page.getByTestId('stat')).toHaveText('✓1 ✗1');
});

test('sprint: a wrong answer is retried and costs time; the combo pays out at 5', async ({ page }) => {
  await page.goto('/?e2e=1#/drill?k=technique&ids=times-11&l=1&m=sprint');
  const problem = await page.getByTestId('problem').textContent();
  await answer(page, false);
  await expect(page.getByTestId('problem')).toHaveText(problem!);
  await expect(page.locator('.bonus')).toHaveText('−5 s');
  // Solved after a miss: no combo yet.
  await answer(page, true);
  await expect(page.getByTestId('streak')).toBeHidden();
  await answer(page, true);
  await answer(page, true);
  await answer(page, true);
  await expect(page.getByTestId('streak')).toHaveText('combo 3/5');
  await answer(page, true);
  await answer(page, true);
  // Combo 5 pays 3 s on top of the usual 1 s.
  await expect(page.locator('.bonus')).toHaveText('+4 s');
});

test('timed: pause stops the clock, skip counts as a miss', async ({ page }) => {
  await page.goto('/?e2e=1#/drill?k=technique&ids=times-11&l=1&m=sprint');
  await page.getByTestId('pause').tap();
  await expect(page.getByTestId('resume')).toBeVisible();
  const before = await page.getByTestId('stat').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('stat')).toHaveText(before!);
  await page.getByTestId('resume').tap();
  await page.getByTestId('skip').tap();
  await expect(page.getByTestId('feedback')).toHaveText(/=/);
  const log = await page.evaluate(() => (window as unknown as { __mm: { session: { log: { skipped?: boolean }[] } } }).__mm.session.log);
  expect(log).toHaveLength(1);
  expect(log[0].skipped).toBe(true);
});

test('chains show the whole expression with brackets and take the final answer', async ({ page }) => {
  await page.goto('/?e2e=1#/chain');
  // No tutorial on the page: straight to the ladder and Start.
  await expect(page.locator('.stepper')).toHaveCount(0);
  // No level to pick: the ladder shows the highest level reached, and every run starts at I.
  await expect(page.getByTestId('chain-ladder')).toContainText('I of X');
  await page.getByTestId('start-chain').click();
  await expect(page.getByTestId('level')).toHaveText(/Level I$/);
  await expect(page.getByTestId('problem')).toHaveText(/[×÷²]/);
  await expect(page.getByTestId('problem')).toHaveText(/[+−]/);
  await answer(page, true);
  await expect(page.getByTestId('feedback')).toHaveText(/✓/);
});

test('train and challenge pages start drills from the ticked techniques', async ({ page }) => {
  await page.goto('/?e2e=1#/');
  await page.getByTestId('tab-train').tap();
  await page.getByTestId('start-train').tap();
  await expect(page.getByTestId('done')).toBeVisible();
  await page.goto('/?e2e=1#/challenge');
  await page.getByRole('group', { name: 'Clock' }).getByRole('button', { name: '20 problems' }).tap();
  await page.getByTestId('start-challenge').tap();
  await expect(page.getByTestId('stat')).toHaveText(/^1\/20/);
});

test('sections: Learn groups, Stats, Settings', async ({ page }) => {
  await page.goto('/?e2e=1#/');
  await page.getByTestId('tab-learn').tap();
  await page.getByRole('tab', { name: /Divide/ }).tap();
  await expect(page).toHaveURL(/#\/learn\/div/);
  await page.getByTestId('open-short-division').tap();
  await expect(page.getByTestId('open-short-division')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('drill-this')).toBeVisible();
  await expect(page).toHaveURL(/#\/learn\/div\/short-division/);
  await page.getByTestId('top-stats').tap();
  await expect(page.getByText('No runs yet.')).toBeVisible();
  await page.getByTestId('top-settings').tap();
  await page.getByRole('group', { name: 'Number pad' }).getByRole('button', { name: 'Off' }).tap();
  await page.goto('/?e2e=1#/drill?k=technique&ids=mul-2x1&l=1&m=training');
  await expect(page.getByTestId('keypad')).toHaveCount(0);
  await expect(page.getByTestId('answer')).toHaveAttribute('inputmode', 'decimal');
});

test('technique card: the worked example reveals one step at a time', async ({ page }) => {
  await page.goto('/?e2e=1#/t/mul-2x1');
  const lines = page.locator('.stepper-lines .step');
  await expect(lines).toHaveCount(4);
  await expect(page.locator('.stepper-lines .step:not(.future)')).toHaveCount(2);
  await expect(page.locator('.stepper-lines .step.current .nt')).toHaveText('tens first');
  await page.getByTestId('next-step').tap();
  await page.getByTestId('next-step').tap();
  await expect(page.locator('.stepper-lines .step:not(.future)')).toHaveCount(4);
  await expect(page.locator('.stepper-lines .step.current .ex').last()).toHaveText('282');
  await expect(page.getByTestId('next-step')).toBeDisabled();
});

test('learn teaches; train picks techniques and starts', async ({ page }) => {
  await page.goto('/?e2e=1#/');
  await page.getByTestId('home-learn').tap();
  await expect(page.locator('input[type=checkbox]')).toHaveCount(0);
  await page.getByRole('tab', { name: /Add & subtract/ }).tap();
  await page.getByTestId('open-complements').tap();
  await expect(page.locator('.tech.open .stepper-problem')).toContainText('= ?');
  await page.getByTestId('tab-train').tap();
  await page.getByRole('button', { name: 'None' }).tap();
  await expect(page.getByTestId('start-train')).toHaveText(/Tick a technique/);
  await page.getByTestId('pick-complements').check();
  await page.getByTestId('pick-lr-addition').check();
  await expect(page.getByTestId('start-train')).toHaveText(/Start · 2/);
  await page.getByTestId('start-train').tap();
  await expect(page.getByTestId('problem')).toHaveText(/[+−]/);
});

test('home: the name, one line, the five sections; nothing to scroll for', async ({ page }) => {
  await page.goto('/?e2e=1#/');
  const viewport = page.viewportSize()!;
  for (const id of ['home-learn', 'home-train', 'home-challenge', 'home-chains', 'home-play']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.y + box.height).toBeLessThan(viewport.height);
  }
  await expect(page.locator('h1')).toHaveText('Secrets of Mental Math');
});

test('trig drills add a minus key; negative answers can be typed on the pad', async ({ page }) => {
  await page.goto('/?e2e=1#/drill?k=technique&ids=mul-2x1&l=1&m=training');
  await expect(page.locator('[data-key="neg"]')).toHaveCount(0);
  await page.goto('/?e2e=1#/drill?k=technique&ids=trig-special&l=4&m=training');
  // Answer the easy problems until the drill climbs to Level IV, where signs come in; type a negative one.
  for (let i = 0; i < 40; i++) {
    const answer = await page.evaluate(() => (window as unknown as { __mm: { answer(): string } }).__mm.answer());
    if (answer.startsWith('-')) {
      await page.locator('[data-key="neg"]').tap();
      for (const d of answer.slice(1)) await page.locator(`[data-key="${d}"]`).tap();
      await expect(page.getByTestId('answer')).toHaveValue(`−${answer.slice(1)}`);
      await page.locator('[data-key="enter"]').tap();
      await expect(page.getByTestId('feedback')).toHaveText(/✓ −/);
      return;
    }
    await page.getByTestId('answer').fill(answer);
    await page.getByTestId('answer').press('Enter');
  }
  throw new Error('no negative answer came up');
});

test('learn: techniques only, each with its worked steps and picture', async ({ page }) => {
  await page.goto('/?e2e=1#/learn');
  await expect(page.getByTestId('lessons')).toHaveCount(0);
  await page.getByRole('tab', { name: /Higher math/ }).tap();
  await page.getByTestId('open-trig-special').tap();
  await expect(page.locator('.tech.open .figure-problem')).toHaveText('cos 120° = ?');
});

test('endless: lives go down on misses and the run ends on the last one', async ({ page }) => {
  await page.goto('/?e2e=1#/drill?k=technique&ids=times-11&l=1&m=endless');
  await expect(page.getByTestId('stat')).toHaveText('Lives 3 · ✓0');
  await answer(page, true);
  await answer(page, false);
  await expect(page.getByTestId('stat')).toHaveText('Lives 2 · ✓1');
  await answer(page, false);
  await answer(page, false);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('1');
});

test('about: credit on the About page', async ({ page }) => {
  await page.goto('/?e2e=1#/settings');
  await page.getByTestId('about-link').tap();
  await expect(page.getByText(/Benjamin/)).toBeVisible();
});

test('featured techniques lead Learn and Train; chains can start at a picked level', async ({ page }) => {
  await page.goto('/?e2e=1#/learn');
  await expect(page.getByRole('tab', { name: /Featured/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('featured-list').locator('li')).toHaveCount(10);
  await page.goto('/?e2e=1#/train');
  await expect(page.getByTestId('feat-times-11')).toBeChecked();
  await page.goto('/?e2e=1#/chain');
  await page.locator('.ladder .rung[data-level="4"]').click();
  await page.getByTestId('start-chain').click();
  await expect(page.getByTestId('level')).toHaveText(/Level IV$/);
});

test('the Train Start button is not hidden behind the tab bar', async ({ page }) => {
  await page.goto('/?e2e=1#/train');
  const start = await page.getByTestId('start-train').boundingBox();
  const tabs = await page.locator('.tabbar').boundingBox();
  expect(start!.y + start!.height).toBeLessThanOrEqual(tabs!.y + 1);
  await page.getByTestId('start-train').tap();
  await expect(page.getByTestId('problem')).toBeVisible();
});

test('120 seconds: each answer is taken the moment it is right, on the pad', async ({ page }) => {
  await page.goto('/?e2e=1#/');
  await page.getByTestId('tab-play').tap();
  await page.getByTestId('play-solo').tap();
  const mm = () => page.evaluate(() => (window as unknown as { __mm: { answer(): number } }).__mm.answer());
  for (let i = 0; i < 3; i++) {
    for (const d of String(await mm())) await page.locator(`[data-key="${d}"]`).tap();
  }
  await expect(page.getByTestId('stat')).toHaveText(/· 3$/);
  // A wrong digit waits for a fix: nothing is counted.
  await page.locator('[data-key="0"]').tap();
  await expect(page.getByTestId('stat')).toHaveText(/· 3$/);
  await page.evaluate(() => (window as unknown as { __mm: { finish(): void } }).__mm.finish());
  await expect(page.getByTestId('score')).toHaveText('3');
  await page.getByTestId('again').tap();
  await expect(page.getByTestId('stat')).toHaveText(/· 0$/);
});
