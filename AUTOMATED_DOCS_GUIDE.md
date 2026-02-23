# 🤖 Guía: Documentación Técnica Automática con IA

Este proyecto utiliza un sistema de IA para generar documentación técnica automáticamente cada vez que se hace un `push` a las ramas principales.

Para que la documentación sea de alta calidad, la IA necesita conocer el contexto del problema que estás resolviendo. Los desarrolladores pueden proporcionar este contexto vinculando sus cambios con **GitHub Issues**.

## 🚀 Cómo vincular Contexto

Existen dos formas de hacer que la IA lea la descripción de tu tarea:

### 1. Usando el ID en el mensaje de Commit (Recomendado)
Incluye el ID del issue precedido por un `#` en tu mensaje de commit.
```bash
git commit -m "feat: implementa validación de seguridad en forms #78"
```

### 2. Usando el ID en el nombre de la Rama
Si el mensaje del commit no tiene ID, el script intentará extraerlo del nombre de la rama.
*   Nombres de rama válidos: `feature/issue78`, `bugfix/78`, `masterdev/issue-78`.

---

## ❓ ¿Qué pasa si no uso un ID?
*   El sistema **seguirá funcionando**.
*   La IA generará la documentación basándose **solo en los cambios de código** (`git diff`).
*   El "Resumen Ejecutivo" será más genérico ya que la IA no sabrá el "por qué" de negocio, solo el "qué" técnico.

## 📄 Resultado
La documentación se guarda automáticamente en la carpeta `/docs` con el formato `deploy-TIMESTAMP.md`. Incluirá:
1.  **Contexto del Issue**: Título y descripción original del ticket.
2.  **Análisis Técnico**: Cambios en Backend y Frontend.
3.  **Evidencia Visual**: Capturas de pantalla si el cambio afecta a la UI.
