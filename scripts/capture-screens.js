const { chromium } = require('playwright');
const { OpenAI } = require('openai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BASE_URL = process.env.CI ? 'http://localhost:3000' : 'https://test-project-actions.vercel.app';
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

async function getIssueContext() {
    console.log('Extracting issue context...');
    try {
        const commitMsg = execSync('git log -1 --pretty=%B').toString();
        const branchName = execSync('git rev-parse --abbrev-ref HEAD').toString();
        let issueId = null;
        const commitMatch = commitMsg.match(/#(\d+)/);
        if (commitMatch) {
            issueId = commitMatch[1];
        } else {
            const branchMatch = branchName.match(/(?:issue|#)?(\d+)/i);
            if (branchMatch) issueId = branchMatch[1];
        }

        if (issueId) {
            const issueData = execSync(`gh issue view ${issueId} --json title,body`).toString();
            const { title, body } = JSON.parse(issueData);
            return `Goal/Context: ${title} - ${body}`;
        }
    } catch (err) { }
    return '';
}

async function getAutomatedRoutes(changedFiles, issueContext) {
    console.log('Detecting routes affected by changes...');

    // Listar todos los archivos HTML disponibles para que la IA sepa qué existe
    const allFiles = fs.readdirSync(path.join(__dirname, '../public')).filter(f => f.endsWith('.html'));

    // Simplificamos: enviamos la lista de archivos y pedimos a la IA que deduzca la ruta pública.
    const prompt = `
    Eres un experto en desarrollo web y automatización con Playwright.
    
    Estructura del Proyecto:
    - /public/: Contiene todos los archivos estáticos HTML.
    
    Archivos HTML disponibles:
    ${allFiles.join(', ')}

    Contexto del Objetivo (Issue):
    ${issueContext || 'No context available'}
    
    Archivos que han cambiado en este commit:
    ${changedFiles.join(', ')}
    
    Tu tarea es determinar qué rutas de la aplicación deben ser capturadas para mostrar los cambios. 
    Ten en cuenta que:
    1. Si un archivo .html ha cambiado, su ruta es obligatoria.
    2. Si el cambio es en JS/Server o el Contexto de la Issue sugiere una funcionalidad (ej: Gestión de Usuarios), debes incluir las rutas relacionadas (ej: /users) incluso si el HTML no cambió en este commit específico.
    3. La URL base es ${BASE_URL}.
    
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

async function getDiff() {
    try {
        // Obtenemos un diff más amplio si es necesario, o al menos el del último commit
        return execSync('git diff HEAD~1 HEAD').toString();
    } catch (err) {
        return '';
    }
}

async function captureScreenshots(routes, diff, issueContext) {
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

            // === IA DINÁMICA DE INTERACCIÓN ===
            if (diff && diff.length > 5) {
                console.log('Analizando elementos interactivos con IA para buscar comportamientos añadidos...');

                const elements = await page.evaluate(() => {
                    const interactables = document.querySelectorAll('button, a, select, input[type="button"], input[type="submit"]');
                    const list = [];
                    let index = 0;
                    interactables.forEach(el => {
                        if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
                        const aiId = `ai-elem-${index++}`;
                        el.setAttribute('data-ai-id', aiId);
                        let label = el.innerText || el.value || el.name || el.id || el.placeholder || '';
                        label = label.trim().substring(0, 50);
                        if (label) list.push({ aiId, tag: el.tagName.toLowerCase(), label });
                    });
                    return list;
                });

                if (elements.length > 0) {
                    const prompt = `
                    Eres un experto QA automatizado.
                    Cambio en el código fuente:
                    ${diff.substring(0, 2000)}

                    Ruta actual web: ${route}
                    Elementos interactivos disponibles:
                    ${JSON.stringify(elements)}

                    Basado en el diff Y el contexto del Objetivo (Issue), ¿hay algún elemento con el que se deba interactuar para revelar visualmente la funcionalidad (ej: abrir modales, cambiar selects)?
                    
                    Contexto del Objetivo:
                    ${issueContext}

                    Cambio en el código (Diff):
                    ${diff.substring(0, 2000)}

                    `;

                    const aiRes = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [{ role: "system", content: "Solo produces JSON puro." }, { role: "user", content: prompt }],
                        response_format: { type: "json_object" }
                    });

                    const actions = JSON.parse(aiRes.choices[0].message.content).actions || [];

                    if (actions.length > 0) {
                        for (const action of actions) {
                            console.log(`Ejecutando acción de IA: ${action.action} sobre [data-ai-id="${action.targetId}"]`);
                            try {
                                const selector = `[data-ai-id="${action.targetId}"]`;
                                if (action.action === 'click') {
                                    await page.click(selector);
                                } else if (action.action === 'select') {
                                    await page.selectOption(selector, { index: 1 });
                                }
                                await page.waitForTimeout(600);
                            } catch (e) {
                                console.error('Fallo al ejecutar la acción AI:', e.message);
                            }
                        }

                        const interactionFileName = `${safeRoute}-interacted-${timestamp}.png`;
                        const interactionFilePath = path.join(SCREENSHOT_DIR, interactionFileName);
                        await page.screenshot({ path: interactionFilePath, fullPage: true });

                        capturedImages.push({
                            route: route,
                            path: `docs/images/${interactionFileName}`,
                            url: `${url} (Interacción AI)`
                        });
                        console.log(`Screenshot inteligente guardado: ${interactionFileName}`);
                    }
                }
            }

        } catch (err) {
            console.error(`Error al capturar ${route}:`, err.message);
        }
    }

    await browser.close();
    return capturedImages;
}

async function run() {
    const changedFiles = await getChangedFiles();
    const diff = await getDiff();
    const issueContext = await getIssueContext();
    const routes = await getAutomatedRoutes(changedFiles, issueContext);

    console.log('Iniciando captura dinámica...');
    const images = await captureScreenshots(routes, diff, issueContext);

    fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(images, null, 2));
    console.log('Proceso de captura finalizado.');
}

run();
