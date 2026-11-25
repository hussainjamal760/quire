import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * End-to-end flows against the production build. Run `npm run build` first;
 * `npm run test:e2e` starts its own server on a fresh database.
 */

async function signedIn(browser: Browser, name: 'Alice Moreno' | 'Bob Okafor' | 'Carol Singh') {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.locator('.home-intro h1')).toContainText(name.split(' ')[0]!);
  return { page, errors };
}

const body = (page: Page) => page.locator('.page .prose');
const saved = (page: Page) => expect(page.locator('.save')).toHaveText('Saved', { timeout: 5000 });

async function newDocument(page: Page, title: string) {
  await page.getByRole('button', { name: /New document/ }).click();
  await expect(body(page)).toBeVisible();
  await page.getByLabel('Document title').fill(title);
  await saved(page);
}

const openShare = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Share' }).click();

async function closeDialog(page: Page) {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function shareWith(page: Page, email: string, access: 'Can edit' | 'Can view') {
  await openShare(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Access', { exact: true }).selectOption({ label: access });
  await page.locator('.share-form').getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('.share-row', { hasText: email })).toBeVisible();
  await closeDialog(page);
}

async function openFromHome(page: Page, title: string) {
  await page.goto('/');
  await page.locator('.card', { hasText: title }).first().click();
  await expect(body(page)).toBeVisible();
}

test('write, format, rename and get it all back after a reload', async ({ browser }) => {
  const { page, errors } = await signedIn(browser, 'Alice Moreno');
  await newDocument(page, 'Design review');

  await body(page).click();
  await page.getByLabel('Text style').selectOption({ label: 'Heading' });
  await page.keyboard.type('Agenda');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type('Pick a launch date');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bulleted list' }).click();
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Underline' }).click();
  await page.keyboard.type('Second');
  await saved(page);

  await page.reload();
  await expect(body(page).locator('h2')).toHaveText('Agenda');
  await expect(body(page).locator('strong')).toHaveText('Pick a launch date');
  await expect(body(page).locator('ul li')).toHaveCount(2);
  await expect(body(page).locator('u')).toHaveText('Second');
  await expect(page.getByLabel('Document title')).toHaveValue('Design review');

  await page.goto('/');
  await expect(page.locator('section[aria-label="Your documents"] .card', { hasText: 'Design review' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a viewer can read, cannot edit, and sees changes arrive live', async ({ browser }) => {
  const alice = await signedIn(browser, 'Alice Moreno');
  await newDocument(alice.page, 'Live notes');
  await shareWith(alice.page, 'carol@ajaia.dev', 'Can view');

  const carol = await signedIn(browser, 'Carol Singh');
  const card = carol.page.locator('section[aria-label="Shared with you"] .card', { hasText: 'Live notes' });
  await expect(card).toContainText('Can view');
  await card.click();
  await expect(body(carol.page)).toHaveAttribute('contenteditable', 'false');
  await expect(carol.page.getByRole('toolbar')).toHaveCount(0);
  await expect(carol.page.getByText('view-only')).toBeVisible();

  // Both are in the document now, so each sees the other.
  await expect(alice.page.getByRole('img', { name: /Carol Singh/ })).toBeVisible();

  await body(alice.page).click();
  await alice.page.keyboard.type('Typed by Alice, watched by Carol');
  await saved(alice.page);
  await expect(body(carol.page)).toContainText('Typed by Alice, watched by Carol');

  expect([...alice.errors, ...carol.errors]).toEqual([]);
});

test('unknown emails are explained, and removing access closes the document', async ({ browser }) => {
  const alice = await signedIn(browser, 'Alice Moreno');
  await newDocument(alice.page, 'Short-lived share');

  await openShare(alice.page);
  await alice.page.getByLabel('Email address').fill('nobody@ajaia.dev');
  await alice.page.locator('.share-form').getByRole('button', { name: 'Share' }).click();
  await expect(alice.page.getByRole('alert')).toHaveText('No account found for nobody@ajaia.dev.');
  await closeDialog(alice.page);
  await shareWith(alice.page, 'bob@ajaia.dev', 'Can edit');

  const bob = await signedIn(browser, 'Bob Okafor');
  await openFromHome(bob.page, 'Short-lived share');

  await openShare(alice.page);
  await alice.page.locator('.share-row', { hasText: 'bob@ajaia.dev' }).getByRole('button', { name: 'Remove' }).click();

  await expect(bob.page.getByText('Your access to this document was removed.')).toBeVisible();
  await expect(bob.page.locator('.home-intro')).toBeVisible();
});

test('two editors saving at once: nothing is overwritten silently', async ({ browser }) => {
  const alice = await signedIn(browser, 'Alice Moreno');
  await newDocument(alice.page, 'Contested');
  await shareWith(alice.page, 'bob@ajaia.dev', 'Can edit');

  const bob = await signedIn(browser, 'Bob Okafor');
  await openFromHome(bob.page, 'Contested');

  // Hold Alice's next save in the network until Bob's has landed, forcing the race.
  let releaseAlice!: () => void;
  const bobHasSaved = new Promise<void>((resolve) => (releaseAlice = resolve));
  await alice.page.route('**/api/documents/*', async (route) => {
    if (route.request().method() === 'PATCH') await bobHasSaved;
    await route.continue();
  });

  await body(alice.page).click();
  await alice.page.keyboard.type('Alice was here');
  await expect(alice.page.locator('.save')).toHaveText('Saving', { timeout: 5000 });

  await body(bob.page).click();
  await bob.page.keyboard.type('Bob was here');
  await saved(bob.page);
  releaseAlice();

  await expect(alice.page.getByText('saved a newer version while you were typing')).toBeVisible();
  await alice.page.unroute('**/api/documents/*');
  await alice.page.getByRole('button', { name: 'Use their version' }).click();
  await expect(body(alice.page)).toContainText('Bob was here');
  await expect(body(alice.page)).not.toContainText('Alice was here');
});

test('import a Markdown file as a new document', async ({ browser }) => {
  const { page } = await signedIn(browser, 'Bob Okafor');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quire-')), 'retro_notes.md');
  fs.writeFileSync(file, '# Retro notes\n\nWhat went **well** and *what didn’t*.\n\n1. Ship\n2. Learn\n');

  await page.locator('input[type=file]').setInputFiles(file);
  await expect(body(page).locator('h1')).toHaveText('Retro notes');
  await expect(body(page).locator('ol li')).toHaveCount(2);
  await expect(page.getByLabel('Document title')).toHaveValue('retro notes');
});

test('restore an earlier version from history, and download as Markdown', async ({ browser }) => {
  const alice = await signedIn(browser, 'Alice Moreno');
  await newDocument(alice.page, 'Versioned');
  await body(alice.page).click();
  await alice.page.keyboard.type('The original wording');
  await saved(alice.page);
  await shareWith(alice.page, 'bob@ajaia.dev', 'Can edit');

  // A different author starts a new version.
  const bob = await signedIn(browser, 'Bob Okafor');
  await openFromHome(bob.page, 'Versioned');
  await body(bob.page).click();
  await bob.page.keyboard.press('ControlOrMeta+a');
  await bob.page.keyboard.type('Bob rewrote everything');
  await saved(bob.page);
  await expect(body(alice.page)).toContainText('Bob rewrote everything');

  await alice.page.getByRole('button', { name: 'Version history' }).click();
  await alice.page.locator('.version', { hasText: 'Alice' }).click();
  await expect(alice.page.locator('.page .prose')).toContainText('The original wording');
  await alice.page.getByRole('button', { name: 'Restore this version' }).click();
  await expect(alice.page.getByText('Version restored.')).toBeVisible();
  await expect(body(alice.page)).toContainText('The original wording');
  await expect(body(bob.page)).toContainText('The original wording');

  await alice.page.getByRole('button', { name: 'More actions' }).click();
  const [download] = await Promise.all([
    alice.page.waitForEvent('download'),
    alice.page.getByRole('menuitem', { name: 'Download as Markdown' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Versioned.md');
  const markdown = fs.readFileSync((await download.path())!, 'utf8');
  expect(markdown).toContain('# Versioned');
  expect(markdown).toContain('The original wording');
});
