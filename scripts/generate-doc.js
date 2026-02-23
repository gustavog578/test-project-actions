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

async function getIssueContext() {
    console.log('Extracting issue context...');
    try {
        // 1. Intentar obtener el ID del mensaje del último commit
        const commitMsg = execSync('git log -1 --pretty=%B').toString();
        const branchName = execSync('git rev-parse --abbrev-ref HEAD').toString();

        let issueId = null;

        // Buscar #ID en el commit
        const commitMatch = commitMsg.match(/#(\d+)/);
        if (commitMatch) {
            issueId = commitMatch[1];
            console.log(`Issue ID found in commit message: #${issueId}`);
        } else {
            // Fallback: Buscar issue o ID en el nombre de la rama (ej: issue78 o feature/78)
            const branchMatch = branchName.match(/(?:issue|#)?(\d+)/i);
            if (branchMatch) {
                issueId = branchMatch[1];
                console.log(`Issue ID found in branch name: #${issueId}`);
            }
        }

        if (issueId) {
            console.log(`Fetching details for issue #${issueId}...`);
            const issueData = execSync(`gh issue view ${issueId} --json title,body`).toString();
            const { title, body } = JSON.parse(issueData);
            return `\n---\n**Contexto del Issue #${issueId}**\n**Título:** ${title}\n**Descripción:** ${body}\n---\n`;
        }
    } catch (err) {
        console.log('Could not fetch issue context:', err.message);
    }
    return '';
}

async function generateTechnicalDoc(diff, changedFiles, issueContext) {
    console.log('Generating technical documentation with OpenAI...');

    const prompt = `
    Eres un arquitecto de software experto. Genera un documento técnico detallado basado en los siguientes cambios de código y el contexto del issue vinculado.
    
    ${issueContext ? `CONTECTO DEL ISSUE:\n${issueContext}\n` : ''}

    Archivos modificados:
    ${changedFiles.join(', ')}
    
    Diff de cambios:
    ${diff}
    
    Sigue estrictamente esta estructura Markdown:
    # Documento Técnico - Deploy
    1. Resumen Ejecutivo (Basado en el contexto del issue si existe y los cambios)
    2. Cambios Backend (express) - Analiza si hay cambios en server.js o lógica de servidor
    3. Cambios Frontend (carpeta /public) - Analiza cambios en HTML/JS/CSS client-side
    4. Impacto Técnico (Cómo afecta esto al sistema)
    5. Riesgos (Qué podría fallar)
    6. Consideraciones de Deploy (Configuraciones necesarias)
    7. Evidencia Visual (Deja un marcador [EVIDENCIA_VISUAL] aquí)
    8. Centrate en los cambios relacionados a la issue, no en todo el codigo.
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
    const issueContext = await getIssueContext();

    let markdown = await generateTechnicalDoc(diff, changedFiles, issueContext);
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
