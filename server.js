require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Groq = require('groq-sdk');
const fs = require('fs'); // <-- ¡Esta es la que probablemente falta!

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(cors());
app.use(express.json());
// Le decimos a Node que sirva nuestros archivos HTML, CSS y JS
app.use(express.static(__dirname));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
const upload = multer({ dest: 'uploads/' });
// === CONEXIÓN A GROQ ===
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.get('/api/status', (req, res) => {
    res.json({ status: "Backend corriendo con Groq 🚀" });
});

app.post('/api/chat', upload.single('audio'), async (req, res) => {
    let tempFilePath = null;

    try {
        const body = req.body || {};
        const file = req.file;
        const textoEscrito = body.texto ? body.texto.trim() : "";

        if (!file && !textoEscrito) {
            return res.status(400).json({ error: "No se recibió audio ni texto" });
        }

        let transcripcion = textoEscrito;

        // --- FASE 1: WHISPER (Solo si llegó audio) ---
        if (file) {
            console.log(`\n🎙️ 1. Audio recibido (${file.size} bytes). Procesando...`);
            if (file.size < 1000) {
                return res.status(400).json({ error: "Audio demasiado corto o vacío" });
            }

            tempFilePath = `${file.path}.webm`;
            fs.renameSync(file.path, tempFilePath);
            const fileStream = fs.createReadStream(tempFilePath);

            transcripcion = await groq.audio.transcriptions.create({
                file: fileStream,
                model: "whisper-large-v3",
                response_format: "text",
                temperature: 0,
                prompt: "Bilingual English and Spanish practice. The student may mix Spanish words into English sentences."
            });

            if (!transcripcion || !transcripcion.trim()) {
                return res.status(400).json({ error: "No se detectó voz en el audio" });
            }
        }

        console.log("🗣️ Tú:", transcripcion);

        // --- FASE 2: GROQ (Tutor con memoria y niveles) ---
        const nombreDelTutor = body.nombreTutor || "Tutor";
        const nivel = body.nivel || "basico";
        const tema = body.tema || "charla libre";

        const guiaPorNivel = {
            basico: "Usa frases muy cortas, vocabulario cotidiano (A1-A2) y sé muy paciente.",
            intermedio: "Usa inglés natural conversacional (B1-B2) con expresiones comunes.",
            avanzado: "Usa inglés fluido y idiomático (C1), desafiando al estudiante con preguntas interesantes."
        };

        let historial = [];
        if (body.historial) {
            try {
                const parsed = typeof body.historial === "string"
                    ? JSON.parse(body.historial)
                    : body.historial;
                if (Array.isArray(parsed)) {
                    historial = parsed.slice(-8);
                }
            } catch (e) {
                historial = [];
            }
        }

        const systemPrompt = `
Eres ${nombreDelTutor}, un tutor de inglés súper amigable, cálido y con buen sentido del humor. Hablas como un amigo buena onda que enseña fácil, sin tecnicismos aburridos.
PROHIBIDO usar etiquetas <think> o mostrar tu proceso de razonamiento.
Nivel del estudiante: ${nivel.toUpperCase()} (${guiaPorNivel[nivel] || guiaPorNivel.basico}).
Tema actual de práctica: ${tema}.

Personalidad y reglas estrictas:
1. Sé breve, cercano y fácil de entender.
2. Si el estudiante mete una palabra en español porque no la sabe en inglés (o comete un error gracioso), suelta una risa amigable ("jajaja", "¡buen intento!") y explícale con cariño y de forma simple cómo se dice esa palabra y cómo queda la frase completa.
3. ESTRUCTURA TU RESPUESTA EXACTAMENTE EN 4 PARTES SEPARADAS POR "---":

[Parte 1: ÚNICAMENTE EN ESPAÑOL (prohibido escribir la traducción en inglés aquí).
Sigue exactamente este orden:
- "Dijiste: [qué entendiste en español hablando directo al usuario, ej. 'Hola, mucho gusto, me llamo Manuel']."
- Si hubo error o palabra en español: tu explicación sencilla y con humor ligero de cómo decir la palabra y la frase correcta en inglés. Si estuvo bien: un comentario breve y buena onda.
- "En español te digo: [TRADUCCIÓN REAL AL ESPAÑOL de tu Parte 2, NUNCA la dejes en inglés]."]
---
[Parte 2: ÚNICAMENTE EN INGLÉS. Tu respuesta amigable y UNA pregunta corta para seguir la charla.]
---
[Parte 3: ÚNICAMENTE un arreglo JSON con máximo 2 palabras útiles. Formato: [{"en": "palabra", "es": "traducción"}]]
---
[Parte 4: ÚNICAMENTE un número entero del 40 al 100 según qué tan bien estuvo la frase del estudiante.]
`;

        const mensajes = [
            { role: "system", content: systemPrompt },
            ...historial,
            { role: "user", content: transcripcion }
        ];

        let chatCompletion;
        try {
            chatCompletion = await groq.chat.completions.create({
                messages: mensajes,
                model: "qwen/qwen3.8-27b",
                temperature: 0.3,
                max_tokens: 4096
            });
        } catch (modelError) {
            if (modelError.status === 401) throw modelError;
            console.warn("⚠️ Modelo principal no disponible, usando openai/gpt-oss-120b:", modelError.message);
            chatCompletion = await groq.chat.completions.create({
                messages: mensajes,
                model: "openai/gpt-oss-120b",
                temperature: 0.3,
                max_tokens: 2048
            });
        }

        let respuestaIA = chatCompletion.choices[0].message.content || "";

        if (respuestaIA.includes("</think>")) {
            respuestaIA = respuestaIA.split("</think>")[1].trim();
        } else if (respuestaIA.includes("<think>")) {
            respuestaIA = "Entendí tu mensaje, pero me quedé pensando demasiado.---Could you say that again, please?---[]---75";
        }

        const partes = respuestaIA.split("---").map(p => p.trim());
        const espanol = partes[0] || "";
        const ingles = partes[1] || "";

        let vocabulario = [];
        try {
            const jsonLimpio = (partes[2] || "[]").replace(/```json|```/g, "").trim();
            const parsedVocab = JSON.parse(jsonLimpio);
            if (Array.isArray(parsedVocab)) vocabulario = parsedVocab;
        } catch (e) {
            vocabulario = [];
        }

        const numeroPrecision = parseInt((partes[3] || "80").replace(/\D/g, ""), 10);
        const precision = Number.isNaN(numeroPrecision) ? 80 : Math.min(100, Math.max(40, numeroPrecision));
        const xpGanados = precision >= 85 ? 20 : 10;

        console.log("🤖 Tutor:", ingles);

        // --- FASE 3: ENVIAR RESPUESTA AL NAVEGADOR ---
        res.json({
            transcripcion_usuario: transcripcion,
            texto_ia: `${espanol}\n---\n${ingles}\n---\n${JSON.stringify(vocabulario)}`,
            datos_estructurados: {
                espanol,
                ingles,
                vocabulario,
                precision,
                xp_ganados: xpGanados
            }
        });

    } catch (error) {
        console.error("❌ Error en el proceso:", error);
        res.status(500).json({ error: "Error procesando la solicitud" });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error("Error limpiando archivo:", err);
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});