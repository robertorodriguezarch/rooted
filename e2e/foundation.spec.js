import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { categories, events } from '../src/data/events.js'

const creekEvent = events.find((event) => event.id === 'creekside-cleanup')
const trailEvent = events.find((event) => event.id === 'sunday-trail-care')
const browserErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'Pages should not produce browser errors').toEqual([])
})

async function expectEventCards(page, expectedEvents) {
  await expect(page.getByTestId('event-card')).toHaveCount(expectedEvents.length)
  for (const event of expectedEvents) {
    await expect(page.getByTestId('event-card').getByRole('link', {
      name: `View details: ${event.title}`,
      exact: true,
    })).toHaveAttribute('href', `/events/${event.id}`)
  }
}

test('home introduces the sample preview and leads to event discovery', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Small acts. Stronger roots.' })).toBeVisible()
  await expect(page.getByText('Sample events', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Explore events', exact: true }).first().click()
  await expect(page).toHaveURL(/\/explore$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Find your next good thing.' })).toBeVisible()
  await expectEventCards(page, events)
})

test('search, category and location work together, with empty results and reset', async ({ page }) => {
  await page.goto('/explore')
  await page.getByRole('searchbox', { name: 'Search events', exact: true }).fill('creek')
  await page.getByRole('button', { name: 'Cleanups', exact: true }).click()
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption('Chapel Hill')
  await expectEventCards(page, [creekEvent])

  await page.getByRole('searchbox', { name: 'Search events', exact: true }).fill('there-is-no-such-rooted-event')
  await expectEventCards(page, [])
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search events', exact: true })).toHaveValue('')
  await expectEventCards(page, events)
  const params = new URL(page.url()).searchParams
  expect(params.get('q')).toBeNull()
  expect(params.get('category')).toBeNull()
  expect(params.get('location')).toBeNull()
})

test('filter URLs can be shared and retain their selection on reload', async ({ page }) => {
  await page.goto('/explore?q=trail&category=cleanup&location=Carrboro')
  await expect(page.getByRole('searchbox', { name: 'Search events', exact: true })).toHaveValue('trail')
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).toHaveValue('Carrboro')
  await expectEventCards(page, [trailEvent])
  await page.reload()
  await expectEventCards(page, [trailEvent])
  await expect(page.getByRole('searchbox', { name: 'Search events', exact: true })).toHaveValue('trail')
  await page.getByRole('searchbox', { name: 'Search events', exact: true }).fill('creek')
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption('Chapel Hill')
  await expectEventCards(page, [creekEvent])
  await expect.poll(() => {
    const params = new URL(page.url()).searchParams
    return [params.get('q'), params.get('category'), params.get('location')]
  }).toEqual(['creek', 'cleanup', 'Chapel Hill'])
})

test('each category displays only its matching sample events', async ({ page }) => {
  await page.goto('/explore')
  for (const category of categories) {
    await page.getByRole('button', { name: category.label, exact: true }).click()
    const expectedEvents = category.id === 'all'
      ? events
      : events.filter((event) => event.category === category.id)
    await expectEventCards(page, expectedEvents)
  }
})

test('event cards, direct detail URLs and missing events have usable navigation', async ({ page }) => {
  await page.goto('/explore')
  await page.getByRole('link', { name: `View details: ${creekEvent.title}`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${creekEvent.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: creekEvent.title })).toBeVisible()
  await expect(page.getByText('Sample events', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Sample preview — registration unavailable', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to events', exact: true }).click()
  await expect(page).toHaveURL(/\/explore$/)

  await page.goto(`/events/${trailEvent.id}`)
  await expect(page.getByRole('heading', { level: 1, name: trailEvent.title })).toBeVisible()
  await page.goto('/events/not-a-real-event')
  await expect(page.getByRole('heading', { level: 1, name: 'This event hasn’t taken root.' })).toBeVisible()
  await page.getByRole('link', { name: 'Explore events', exact: true }).click()
  await expect(page).toHaveURL(/\/explore$/)
})

test('the sample event link is copied to the real browser clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await page.goto(`/events/${creekEvent.id}`)
  await page.getByRole('button', { name: 'Copy sample event link', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Event link copied.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
})

test('mobile navigation reaches events, account gates and clearly planned features', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Primary navigation', exact: true })
  await expect(navigation).toBeVisible()
  for (const [label, route] of [
    ['Explore', '/explore'],
    ['Create', '/create'],
    ['Community', '/community'],
    ['Profile', '/profile'],
    ['Home', '/'],
  ]) {
    await navigation.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(`http://127.0.0.1:4173${route}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (route === '/community') {
      await expect(page.getByText(/Phase [2-6]|coming soon|planned/i).first()).toBeVisible()
    }
    if (route === '/create') await expect(page.getByRole('heading', { name: 'Accounts need a little setup.', exact: true })).toBeVisible()
    if (route === '/profile') await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
  }
  await page.goto('/grow-neighbor')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Good things start with a question.', exact: true })).toBeVisible()
  await expect(page.getByText('Accounts aren’t connected in this environment yet. Grow Neighbor will be available once Supabase is configured.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask Grow Neighbor', exact: true })).toHaveCount(0)
})

test('unconfigured account pages explain setup and cannot submit invented accounts', async ({ page }) => {
  for (const [route, heading, button] of [
    ['/login', 'Good to see you again.', 'Log in'],
    ['/signup', 'Put down your roots.', 'Create account'],
    ['/forgot-password', 'A fresh start.', 'Send reset link'],
    ['/reset-password', 'Choose a new password.', 'Save new password'],
  ]) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
    await expect(page.getByText('Accounts are waiting to be connected.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: button, exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Keep exploring events', exact: true })).toHaveAttribute('href', '/explore')
  }
})

test('every displayed local photograph loads successfully', async ({ page }) => {
  for (const route of ['/', '/explore', `/events/${creekEvent.id}`]) {
    await page.goto(route)
    const photos = page.locator('img[src^="/images/"]')
    expect(await photos.count()).toBeGreaterThan(0)
    for (const photo of await photos.all()) {
      await photo.scrollIntoViewIfNeeded()
      await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true)
      const isDecorative = await photo.evaluate((img) => img.closest('[aria-hidden="true"]') !== null)
      await expect(photo).toHaveAttribute('alt', isDecorative ? '' : /.+/)
    }
  }
})

for (const width of [375, 430, 1440]) {
  test(`pages fit a ${width}px viewport without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 })
    for (const route of ['/', '/explore', `/events/${creekEvent.id}`, '/create', '/community', '/profile', '/grow-neighbor', '/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }))
      expect(dimensions.content, `${route} should fit within the viewport`).toBeLessThanOrEqual(dimensions.viewport + 1)
    }
  })
}

for (const width of [390, 1440]) {
  test(`pages meet WCAG A and AA accessibility checks at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 })
    const failures = []
    for (const route of ['/', '/explore', `/events/${creekEvent.id}`, '/create', '/community', '/profile', '/grow-neighbor', '/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      if (result.violations.length) failures.push({ route, violations: result.violations })
    }
    if (failures.length) {
      await testInfo.attach(`accessibility-${width}.json`, {
        body: JSON.stringify(failures, null, 2),
        contentType: 'application/json',
      })
    }
    const summary = failures.map(({ route, violations }) => ({
      route,
      violations: violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
        example: nodes[0].failureSummary,
      })),
    }))
    expect(summary, 'All routes should have no WCAG A/AA violations; full details are attached on failure').toEqual([])
  })
}
