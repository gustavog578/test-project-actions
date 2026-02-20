const { chromium } = require('playwright');
const { OpenAI } = require('openai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BASE_URL = 'https://test-project-actions.vercel.app';
const SCREENSHOT_DIR = path.join(__dirname, '../docs/images');

async function getChangedFiles() {
    try {
        // Get changed files between last two commits
        const output = execSync('git diff --name-only HEAD~1 HEAD').toString();
        return output.split('\n').filter(f => f.trim() !== '');
    } catch (err) {
        console.log('Error getting changed files, defaulting to all relevant files');
        return ['public/index.html', 'public/dashboard.html', 'public/app.js'];
    }
}

async function getFileContent(filePath) {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
    }
    return '';
}

async function getAutomatedRoutes(changedFiles) {
    console.log('Detecting routes affected by changes...');

    // In a real Angular project, we would read app-routing.module.ts
    // For now, we'll provide the context of our current structure
    const context = `
    Project Structure:
    - /public/index.html: Login page
    - /public/dashboard.html: Main dashboard (protected)
    - /public/app.js: Routing logic (handles / and /dashboard.html)
    
    Changed Files: ${changedFiles.join(', ')}
    `;

    const prompt = `
    Eres experto en desarrollo web.
    Dado el siguiente contexto de archivos modificados y la estructura del proyecto, determina qué rutas públicas se ven afectadas y deben ser testeadas/capturadas.
    
    Contexto:
    ${context}
    
    Devuelve únicamente JSON válido con el formato:
    {
      "routes": ["/index.html", "/dashboard.html"]
    }
    
    No agregues texto adicional. No expliques nada. No incluyas markdown.
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result.routes || [];
    } catch (err) {
        console.error('Error calling OpenAI for routes:', err);
        return ['/index.html']; // Fallback
    }
}

async function captureScreenshots(routes) {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const capturedImages = [];

    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    console.log(`Starting capture for routes: ${routes.join(', ')}`);

    for (const route of routes) {
        const url = `${BASE_URL}${route.startsWith('/') ? '' : '/'}${route}`;
        const timestamp = new Date().getTime();
        const safeRoute = route.replace(/\//g, '_') || 'home';
        const fileName = `${safeRoute}-${timestamp}.png`;
        const filePath = path.join(SCREENSHOT_DIR, fileName);

        try {
            console.log(`Navigating to ${url}...`);
            await page.goto(url);

            // Handle login if we are redirected to index.html/login
            if (page.url().includes('index.html') || page.url() === `${BASE_URL}/`) {
                console.log('Login required, authenticating...');
                await page.fill('#username', 'testuser');
                await page.fill('#password', 'testpassword');
                await page.click('#loginBtn');
                await page.waitForURL(/dashboard.html/, { timeout: 5000 }).catch(() => { });

                // Re-navigate to the original route if it wasn't the login page
                if (!route.includes('index.html') && route !== '/') {
                    await page.goto(url);
                }
            }

            await page.waitForLoadState('networkidle');
            await page.screenshot({ path: filePath, fullPage: true });

            capturedImages.push({
                route: route,
                path: `docs/images/${fileName}`,
                url: url
            });
            console.log(`Screenshot saved: ${fileName}`);
        } catch (err) {
            console.error(`Failed to capture ${route}:`, err.message);
        }
    }

    await browser.close();
    return capturedImages;
}

async function run() {
    const changedFiles = await getChangedFiles();
    const routes = await getAutomatedRoutes(changedFiles);
    const images = await captureScreenshots(routes);

    // Save the list of images for the next script
    fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(images, null, 2));
    console.log('Capture process finished.');
}

run();
