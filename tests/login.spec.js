const { test, expect } = require('@playwright/test');

test.describe('Login Flow', () => {
    test('should login successfully with correct credentials', async ({ page }) => {
        await page.goto('/');

        // Check if we are on the login page
        await expect(page).toHaveTitle(/Login/);

        // Fill out the form
        await page.fill('#username', 'admin');
        await page.fill('#password', 'password123');

        // Click sign in
        await page.click('#loginBtn');

        // Should redirect to dashboard
        await expect(page).toHaveURL(/.*dashboard.html/);
        await expect(page.locator('#welcomeUser')).toHaveText('admin');
    });

    test('should show error with incorrect credentials', async ({ page }) => {
        await page.goto('/');

        await page.fill('#username', 'wronguser');
        await page.fill('#password', 'wrongpass');
        await page.click('#loginBtn');

        // Should stay on login page and show error
        await expect(page.locator('#errorMessage')).toHaveText(/Invalid credentials/);
    });

    test('should logout successfully', async ({ page }) => {
        // First login
        await page.goto('/');
        await page.fill('#username', 'admin');
        await page.fill('#password', 'password123');
        await page.click('#loginBtn');
        await expect(page).toHaveURL(/.*dashboard.html/);

        // Click logout
        await page.click('#logoutBtn');

        // Should redirect back to login
        await expect(page).toHaveURL(/.*index.html/);
    });
});
