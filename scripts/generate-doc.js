const { OpenAI } = require('openai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DOCS_DIR = path.join(__dirname, '../docs');

async function getDiff() {
    try {
        return execSync('git diff HEAD~1 HEAD').toString();
    } catch (err) {
        console.log('Error getting git diff, using empty diff');
        return 'No changes detected or not a git repository.';
    }
}

async function getChangedFiles() {
    try {
        const output = execSync('git diff --name-only HEAD~1 HEAD').toString();
        return output.split('\n').filter(f => f.trim() !== '');
    } catch (err) {
        return [];
    }
}

async function generateTechnicalDoc(diff, changedFiles) {
    console.log('Generating technical documentation with OpenAI...');

    const prompt = `
    Eres un arquitecto de software experto. Genera un documento técnico detallado basado en los siguientes cambios de código.
    
    Archivos modificados:
    ${changedFiles.join(', ')}
    
    Diff de cambios:
    ${diff}
    
    Sigue estrictamente esta estructura Markdown:
    # Documento Técnico - Deploy
    1. Resumen Ejecutivo (Breve descripción de lo que se hizo)
    2. Cambios Backend (express) - Analiza si hay cambios en server.js o lógica de servidor
    3. Cambios Frontend (carpeta /public) - Analiza cambios en HTML/JS/CSS client-side
    4. Impacto Técnico (Cómo afecta esto al sistema)
    5. Riesgos (Qué podría fallar)
    6. Consideraciones de Deploy (Configuraciones necesarias)
    7. Evidencia Visual (Deja un marcador [EVIDENCIA_VISUAL] aquí)
    
    No incluyas explicaciones fuera del markdown. Sé profesional y técnico.
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }]
        });

        return response.choices[0].message.content;
    } catch (err) {
        console.error('Error calling OpenAI for documentation:', err);
        return '# Error al generar documentación\nNo se pudo obtener respuesta de la IA.';
    }
}

function insertEvidence(markdown) {
    const evidencePath = path.join(__dirname, 'evidence.json');
    if (!fs.existsSync(evidencePath)) return markdown;

    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    let imagesMarkdown = '\n\n';

    if (evidence.length === 0) {
        imagesMarkdown += '*No se capturaron evidencias visuales para este deploy.*';
    } else {
        evidence.forEach(img => {
            imagesMarkdown += `### Ruta: ${img.route}\n![Screenshot](${img.path})\n\n`;
        });
    }

    return markdown.replace('[EVIDENCIA_VISUAL]', imagesMarkdown);
}

async function run() {
    const diff = await getDiff();
    const changedFiles = await getChangedFiles();

    let markdown = await generateTechnicalDoc(diff, changedFiles);
    markdown = insertEvidence(markdown);

    if (!fs.existsSync(DOCS_DIR)) {
        fs.mkdirSync(DOCS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `deploy-${timestamp}.md`;
    const filePath = path.join(DOCS_DIR, fileName);

    fs.writeFileSync(filePath, markdown);
    console.log(`Document saved: ${fileName}`);
}

run();
