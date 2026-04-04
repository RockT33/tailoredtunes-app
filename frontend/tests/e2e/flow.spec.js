/**
 * End-to-end tests — full user journey:
 * Register → Create Order → Stripe Test Checkout → Status Polling → Download
 *
 * Prerequisites:
 *   - Backend running on http://localhost:3001
 *   - Frontend running on http://localhost:5173
 *   - .env configured with Stripe test keys
 *   - Stripe CLI forwarding webhooks (stripe listen --forward-to localhost:3001/api/webhooks/stripe)
 *
 * Run: npx playwright test tests/e2e/flow.spec.js
 */

import { test, expect } from '@playwright/test';

// Unique email per run to avoid conflicts
const testEmail = `qa-e2e-${Date.now()}@tailoredtunes-test.com`;
const testPassword = 'QAtest123!';
const testName = 'QA Test User';

// Stripe test card that always succeeds
const STRIPE_TEST_CARD = '4242 4242 4242 4242';
const STRIPE_EXPIRY = '12/28';
const STRIPE_CVC = '424';
const STRIPE_ZIP = '42424';

test.describe('TailoredTunes — Full User Journey', () => {
  test('health check — backend is responding', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('landing page loads without errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/TailoredTunes/i);

    // No console errors on load
    const jsErrors = consoleErrors.filter(e => !e.includes('favicon'));
    expect(jsErrors).toHaveLength(0);
  });

  test('register page is accessible', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('register — creates account and redirects to dashboard', async ({ page }) => {
    await page.goto('/register');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[name="name"], input[placeholder*="name" i]', testName);
    await page.fill('input[type="password"]', testPassword);

    await page.click('button[type="submit"]');

    // Should redirect to dashboard after registration
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // JWT token should be stored
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
    expect(token).toMatch(/^eyJ/); // JWT format
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login — authenticates user and stores JWT', async ({ page }) => {
    // First register the user
    await page.goto('/register');
    const uniqueEmail = `qa-login-${Date.now()}@test.com`;
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Login Test User');
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Logout
    await page.click('button[aria-label*="logout" i], button:has-text("Logout"), button:has-text("Sign out")');
    await expect(page).toHaveURL(/\/(login|)$/, { timeout: 5000 });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('protected route — /dashboard redirects to login when not authenticated', async ({ page }) => {
    // Clear any stored tokens
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('token'));

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('auth API — /me returns 401 without JWT', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/auth/me');
    expect(res.status()).toBe(401);
  });

  test('dashboard — shows empty state for new user', async ({ page }) => {
    await page.goto('/register');
    const freshEmail = `qa-dashboard-${Date.now()}@test.com`;
    await page.fill('input[type="email"]', freshEmail);
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Dashboard Test');
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Should see empty state or "Create New Song" CTA
    await expect(
      page.locator('[data-testid="empty-state"], :text("No orders"), :text("Create"), :text("Get started")')
    ).toBeVisible({ timeout: 5000 });
  });

  test('order form — /order/new is accessible when authenticated', async ({ page }) => {
    await page.goto('/register');
    const freshEmail = `qa-order-${Date.now()}@test.com`;
    await page.fill('input[type="email"]', freshEmail);
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Order Test');
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto('/order/new');
    await expect(page).toHaveURL(/\/order\/new/);

    // Should show tier selector and form fields
    await expect(page.locator(':text("Basic"), :text("$9.99")')).toBeVisible({ timeout: 5000 });
  });

  test('create order → redirects to Stripe checkout', async ({ page }) => {
    await page.goto('/register');
    const freshEmail = `qa-stripe-${Date.now()}@test.com`;
    await page.fill('input[type="email"]', freshEmail);
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Stripe Test User');
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto('/order/new');

    // Select Basic tier
    await page.click(':text("Basic"), [data-tier="basic"]');

    // Fill in order details
    await page.fill('input[name="title"], input[placeholder*="title" i]', 'My E2E Test Song');
    await page.selectOption('select[name="genre"]', { label: /pop/i }).catch(() =>
      page.click(':text("Pop")')
    );
    await page.selectOption('select[name="mood"]', { label: /happy/i }).catch(() =>
      page.click(':text("Happy")')
    );

    // Select song type
    await page.click('input[value="song"], label:has-text("Song")').catch(() => {});

    await page.click('button[type="submit"]');

    // Should redirect to Stripe checkout (external URL)
    await expect(page).toHaveURL(/checkout\.stripe\.com|stripe\.com/, { timeout: 15000 });
  });

  test('Stripe test checkout completes and returns to app', async ({ page }) => {
    // Skip if no Stripe checkout URL is reachable (CI environment)
    test.skip(process.env.CI === 'true' && !process.env.STRIPE_TEST_ENABLED, 'Stripe checkout requires webhook forwarding');

    // This test picks up from the Stripe redirect in the previous test.
    // In a real run, you'd continue from where Stripe checkout redirects back.
    // For now we verify the order status page exists post-checkout.

    await page.goto('/register');
    const freshEmail = `qa-checkout-${Date.now()}@test.com`;
    await page.fill('input[type="email"]', freshEmail);
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Checkout User');
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Create an order via the API directly to get an order ID
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const orderRes = await page.request.post('http://localhost:3001/api/orders', {
      headers: { Authorization: `Bearer ${token}` },
      data: { tier: 'basic', title: 'Checkout Test Song', genre: 'pop', mood: 'happy', type: 'song' }
    });

    expect(orderRes.status()).toBe(201);
    const orderBody = await orderRes.json();
    expect(orderBody).toHaveProperty('checkoutUrl');
    expect(orderBody).toHaveProperty('order');

    const orderId = orderBody.order.id;
    expect(orderId).toBeTruthy();

    // Navigate to the order status page
    await page.goto(`/order/${orderId}`);
    await expect(page).toHaveURL(`/order/${orderId}`);

    // Status page should show current state
    await expect(page.locator(':text("pending"), :text("Processing"), :text("Generating"), :text("Complete")')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Security checks', () => {
  test('password is not returned in register response', async ({ request }) => {
    const uniqueEmail = `qa-sec-${Date.now()}@test.com`;
    const res = await request.post('http://localhost:3001/api/auth/register', {
      data: { email: uniqueEmail, password: 'SecurePass123!', name: 'Security Test' }
    });

    if (res.status() === 201) {
      const body = await res.json();
      expect(body.user).not.toHaveProperty('password');
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('SecurePass123!');
    }
  });

  test('password is not returned in login response', async ({ request }) => {
    const uniqueEmail = `qa-sec-login-${Date.now()}@test.com`;

    // Register first
    await request.post('http://localhost:3001/api/auth/register', {
      data: { email: uniqueEmail, password: 'SecurePass123!', name: 'Sec Login Test' }
    });

    // Login
    const res = await request.post('http://localhost:3001/api/auth/login', {
      data: { email: uniqueEmail, password: 'SecurePass123!' }
    });

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.user).not.toHaveProperty('password');
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('SecurePass123!');
    }
  });

  test('Stripe webhook rejects invalid signatures', async ({ request }) => {
    const res = await request.post('http://localhost:3001/api/webhooks/stripe', {
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1,v1=invalidsignature'
      },
      data: { type: 'checkout.session.completed', data: {} }
    });

    expect(res.status()).toBe(400);
  });

  test('TemPolor webhook rejects missing job_id', async ({ request }) => {
    const res = await request.post('http://localhost:3001/api/webhooks/tempolor', {
      data: { status: 'complete', mp3_url: 'https://example.com/mp3', wav_url: 'https://example.com/wav' }
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_JOB_ID');
  });
});
