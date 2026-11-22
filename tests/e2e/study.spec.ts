import { expect, type Page, test } from '@playwright/test';

/** Fail the test if the app ever tries to reach anything but itself (offline guarantee). */
function trackExternalRequests(page: Page) {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) &&
      !url.protocol.startsWith('data') &&
      !url.protocol.startsWith('blob')
    ) {
      external.push(req.url());
    }
  });
  return external;
}

async function createSetByImport(page: Page, title: string, text: string) {
  await page.goto('/import/');
  await page.getByLabel(/Your data/i).fill(text);
  await page.getByLabel('New set title').fill(title);
  await page.getByRole('button', { name: /^Import \d+ cards?$/ }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return new URL(page.url()).searchParams.get('id') as string;
}

test('create a set, add cards in the editor, and see them persist', async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Create a study set/i }).click();
  await page.getByLabel('Title').fill('E2E Biology');
  await page.getByRole('button', { name: /Create & add cards/i }).click();

  await page.getByLabel('Card 1 term').fill('cell');
  await page.getByLabel('Card 1 definition').fill('basic unit of life');
  await page.getByLabel('Card 2 term').fill('atom');
  await page.getByLabel('Card 2 definition').fill('smallest unit of an element');
  // Tab from the last definition creates a new card and moves into it.
  await page.getByLabel('Card 2 definition').press('Tab');
  await expect(page.getByLabel('Card 3 term')).toBeFocused();
  await page.keyboard.type('gene');
  await page.keyboard.press('Tab');
  await page.keyboard.type('unit of heredity');
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('heading', { name: 'E2E Biology' })).toBeVisible();
  await expect(page.getByText('Terms in this set (3)')).toBeVisible();
  await page.reload();
  await expect(page.getByText('unit of heredity')).toBeVisible();
  expect(external).toEqual([]);
});

test('import pasted text with custom separators', async ({ page }) => {
  await page.goto('/import/');
  await page
    .getByLabel(/Your data/i)
    .fill('H = Hydrogen | He = Helium | Li = Lithium | He = Helium');
  await page.getByLabel('Between term and definition: custom separator').fill(' = ');
  await page.getByLabel('Between cards: custom separator').fill(' | ');
  await expect(page.getByText('3 cards to import')).toBeVisible();
  await expect(page.getByText('1 duplicate')).toBeVisible();
  await page.getByLabel('New set title').fill('Elements');
  await page.getByRole('button', { name: 'Import 3 cards' }).click();
  await expect(page.getByText('Terms in this set (3)')).toBeVisible();
});

test('flashcards: flip with Space, sort with keys, finish the deck', async ({ page }) => {
  const external = trackExternalRequests(page);
  const id = await createSetByImport(page, 'Flash', 'uno\tone\ndos\ttwo\ntres\tthree');
  await page.goto(`/study/flashcards/?set=${id}`);
  const card = page.getByRole('button', { name: /Flip to/ });
  await expect(card).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /Showing answer/ })).toBeVisible();
  await page.keyboard.press('2');
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.getByText('You went through all 3 cards')).toBeVisible();
  await expect(page.getByRole('button', { name: /Study 1 card still learning/ })).toBeVisible();
  expect(external).toEqual([]);
});

test('learn mode grades written answers and resumes after reload', async ({ page }) => {
  const id = await createSetByImport(
    page,
    'Capitals',
    'France\tParis\nItaly\tRome\nSpain\tMadrid\nPeru\tLima',
  );
  await page.goto(`/study/learn/?set=${id}`);
  // Written answers only, so we can type them.
  await page.getByRole('checkbox', { name: /Multiple choice/ }).click();
  await page.getByRole('button', { name: 'Start learning' }).click();
  const answers: Record<string, string> = {
    France: 'Paris',
    Italy: 'Rome',
    Spain: 'Madrid',
    Peru: 'Lima',
  };

  await expect(page.getByLabel('Your answer')).toBeVisible();
  await page.getByLabel('Your answer').fill('Nowhere');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Not quite')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();

  const prompt = await page.locator('text=/^(France|Italy|Spain|Peru)$/').first().textContent();
  await page.getByLabel('Your answer').fill(answers[prompt as string]);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Correct!')).toBeVisible();

  // Interrupt and come back: the session resumes instead of restarting.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByLabel('Your answer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start learning' })).toHaveCount(0);
});

test('practice test and match game', async ({ page }) => {
  const id = await createSetByImport(
    page,
    'Numbers',
    'one\tuno\ntwo\tdos\nthree\ttres\nfour\tcuatro',
  );
  await page.goto(`/study/test/?set=${id}`);
  await page.getByRole('button', { name: 'Start test' }).click();
  await page.getByRole('button', { name: 'Submit test' }).click();
  await expect(page.getByText(/^\d+%$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry missed questions/ })).toBeVisible();

  await page.goto(`/study/match/?set=${id}`);
  await page.getByRole('button', { name: 'Start game' }).click();
  const pairs: [string, string][] = [
    ['one', 'uno'],
    ['two', 'dos'],
    ['three', 'tres'],
    ['four', 'cuatro'],
  ];
  for (const [a, b] of pairs) {
    await page.getByRole('button', { name: a, exact: true }).click();
    await page.getByRole('button', { name: b, exact: true }).click();
  }
  await expect(page.getByText(/New personal best!|Board cleared!/)).toBeVisible();
});

test('global search finds cards', async ({ page }) => {
  await createSetByImport(page, 'Searchable', 'photosynthesis\tlight to sugar');
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder(/Search sets/).fill('photosyn');
  await expect(page.getByRole('option', { name: /photosynthesis/ })).toBeVisible();
});
