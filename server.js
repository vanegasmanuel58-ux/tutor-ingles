const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk'); 

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Le decimos a Node que sirva nuestros archivos HTML, CSS y JS
app.use(express.static(__dirname));
const upload = multer({ dest: 'uploads/' });

// === PON TUS DOS LLAVES AQUÍ ===
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,    // ✅ Así le decimos que la lea de forma invisible
}); 

const genAI = new GoogleGenerativeAI(API_KEY_GEMINI);
const groq = new Groq({ apiKey: API_KEY_GROQ });

app.get('/api/status', (req, res) => {
    res.json({ status: "Backend corriendo con Whisper + Gemini 🚀" });
});

app.post('/api/chat', upload.single('audio'), async (req, res) => {
    try {
        const file = req.file; 
        if (!file) return res.status(400).json({ error: "No se recibió archivo" });

        console.log(`\n🎙️ 1. Audio recibido. Procesando...`);

        // --- FASE 1: WHISPER (Groq) ---
        const tempFilePath = `${file.path}.webm`;
        fs.renameSync(file.path, tempFilePath);
        const fileStream = fs.createReadStream(tempFilePath);
        
        const transcripcion = await groq.audio.transcriptions.create({
            file: fileStream,
            model: "whisper-large-v3", 
            response_format: "text" 
        });
        console.log("🗣️ Tú:", transcripcion);

        /// --- FASE 2: GROQ (El Nuevo Cerebro/Tutor) ---
        console.log("🧠 3. Generando respuesta con Qwen (Groq)...");
        
        // 🔴 NUEVO: Atrapamos el nombre del tutor que viene desde el frontend
        const nombreDelTutor = req.body.nombreTutor || "Tutor";

        const promptDelTutor = `
        Eres un tutor de inglés amigable llamado ${nombreDelTutor}. Eres EXTREMADAMENTE BREVE y directo.
        PROHIBIDO usar etiquetas <think> o mostrar tu proceso de razonamiento.
        El usuario dice: "${transcripcion}"
        
        Reglas estrictas:
        1. NO des explicaciones largas.
        2. ESTRUCTURA TU RESPUESTA EXACTAMENTE EN 3 PARTES SEPARADAS POR "---":
        
        [Parte 1: EN ESPAÑOL. Primero haz tu corrección breve si es necesaria. Luego, incluye SIEMPRE la traducción exacta de lo que dirás en la Parte 2. (Ej: "Tu frase es correcta. Te pregunto: ¿Qué haces para divertirte?")]
        ---
        [Parte 2: ÚNICAMENTE EN INGLÉS. Tu respuesta y UNA pregunta corta para continuar la charla. (Ej: "Nice to meet you! What do you do for fun?")]
        ---
        [Parte 3: ÚNICAMENTE un arreglo JSON con máximo 2 palabras. Formato: [{"en": "palabra", "es": "traducción"}]]
        `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptDelTutor }],
            model: "qwen/qwen3.6-27b", 
            temperature: 0.3,    // 👈 Más bajo = Más directo y menos pensativo
            max_tokens: 4096     // 👈 ¡Muchísimo más espacio para que no se corte!
        });

        let respuestaIA = chatCompletion.choices[0].message.content;

        // ✂️ FILTRO INFALIBLE DE TITANIO:
        if (respuestaIA.includes("</think>")) {
            // Parte el texto en dos usando la etiqueta final, y se queda solo con la segunda mitad
            respuestaIA = respuestaIA.split("</think>")[1].trim();
        } else if (respuestaIA.includes("<think>")) {
            // Si empezó a pensar pero se cortó, borramos todo
            respuestaIA = "¡Ups! Me quedé pensando demasiado. ¿Podrías repetirlo?";
        }

        console.log("🤖 Tutor:", respuestaIA);

        // (NOTA: Nos aseguramos de NO poner fs.unlink aquí si ya lo tienes en la Fase 1)

        // 🧹 LIMPIEZA: Borramos el archivo de audio temporal 
        fs.unlink(tempFilePath, (err) => { 
            if (err) console.error("Error limpiando archivo:", err); 
        });

        // --- FASE 3: ENVIAR RESPUESTA AL NAVEGADOR ---
        res.json({
            transcripcion_usuario: transcripcion,
            texto_ia: respuestaIA
        });

    } catch (error) {
        console.error("❌ Error en el proceso:", error);
        res.status(500).json({ error: "Error procesando el audio" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});