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

    // Simplificamos: enviamos la lista de archivos y pedimos a la IA que deduzca la ruta pública.
    const prompt = `
    Eres un experto en desarrollo web y automatización con Playwright.
    
    Estructura del Proyecto:
    - /public/index.html: Página de Login.
    - /public/dashboard.html: Panel de control (Dashboard) - Requiere login previo.
    - /public/app.js: Lógica cliente y navegación.
    
    Archivos que han cambiado en este commit:
    ${changedFiles.join(', ')}
    
    Tu tarea es determinar qué rutas de la aplicación deben ser capturadas para mostrar los cambios. 
    Ten en cuenta que:
    1. Si cambia algo en 'dashboard.html', la ruta es '/dashboard.html'.
    2. Si cambia algo en 'index.html', la ruta es '/index.html'.
    3. Si cambian archivos de lógica (js), CSS o el servidor, asume que tanto '/index.html' como '/dashboard.html' podrían verse afectados.
    4. La URL base es ${BASE_URL}.
    
    Devuelve únicamente un JSON válido con este formato:
    {
      "routes": ["/ruta1", "/ruta2"]
    }
    
    No incluyas explicaciones, solo el JSON.

    Ten en cuenta que el texto desde presentarse a un cliente para informarle los cambios. Se profesional, breve y conciso
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "Eres un asistente técnico que solo responde en JSON." }, { role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        console.log('IA sugiere las rutas:', result.routes);
        return result.routes || [];
    } catch (err) {
        console.error('Error al consultar rutas a OpenAI:', err);
        return ['/index.html', '/dashboard.html']; // Fallback seguro
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

    console.log(`Iniciando captura de rutas: ${routes.join(', ')}`);

    for (const route of routes) {
        const url = `${BASE_URL}${route.startsWith('/') ? '' : '/'}${route}`;
        const timestamp = new Date().getTime();
        const safeRoute = route.replace(/\//g, '_').replace('.html', '') || 'home';
        const fileName = `${safeRoute}-${timestamp}.png`;
        const filePath = path.join(SCREENSHOT_DIR, fileName);

        try {
            console.log(`Visitando: ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle' });

            // Detectamos si estamos en la página de login (o redirigidos a ella)
            const isLoginPage = await page.$('#loginForm');

            if (isLoginPage) {
                console.log('Login detectado necesario para acceder a la ruta. Autenticando...');
                await page.fill('#username', 'admin');
                await page.fill('#password', 'password123');
                await page.click('#loginBtn');

                // Esperamos a que la navegación termine
                await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => { });

                // Si la ruta original no era el login, volvemos a ella ahora que ya estamos logueados
                if (route !== '/index.html' && route !== '/') {
                    console.log(`Volviendo a la ruta original después del login: ${url}`);
                    await page.goto(url, { waitUntil: 'networkidle' });
                }
            }

            // Pequeña espera extra para asegurar renderizado de animaciones o carga de datos
            await page.waitForTimeout(1000);

            await page.screenshot({ path: filePath, fullPage: true });

            capturedImages.push({
                route: route,
                path: `docs/images/${fileName}`,
                url: url
            });
            console.log(`Screenshot guardado: ${fileName}`);
        } catch (err) {
            console.error(`Error al capturar ${route}:`, err.message);
        }
    }

    await browser.close();
    return capturedImages;
}

async function run() {
    const changedFiles = await getChangedFiles();
    const routes = await getAutomatedRoutes(changedFiles);
    const images = await captureScreenshots(routes);

    fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(images, null, 2));
    console.log('Proceso de captura finalizado.');
}

run();
