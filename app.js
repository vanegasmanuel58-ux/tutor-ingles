// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAIjQbebG8fogKBHkz7ao70W6jNFL_LY5I",
  authDomain: "profe-de-ingles-e6a70.firebaseapp.com",
  projectId: "profe-de-ingles-e6a70",
  storageBucket: "profe-de-ingles-e6a70.firebasestorage.app",
  messagingSenderId: "100750956966",
  appId: "1:100750956966:web:ce6622e893af400199d767",
  measurementId: "G-N40JSRRPV8"
};

// Inicializamos Firebase y Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==========================================
// 2. CONTROL DE VISTAS (CHAT vs DASHBOARD)
// ==========================================
const chatView = document.getElementById('chat-view');
const dashboardView = document.getElementById('dashboard-view');
const btnChat = document.getElementById('btn-chat');
const btnDashboard = document.getElementById('btn-dashboard');
const selectNivel = document.getElementById('select-nivel');
const selectTema = document.getElementById('select-tema');

btnChat.addEventListener('click', () => {
    chatView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    btnChat.classList.add('active');
    btnDashboard.classList.remove('active');
});

btnDashboard.addEventListener('click', () => {
    dashboardView.classList.remove('hidden');
    chatView.classList.add('hidden');
    btnDashboard.classList.add('active');
    btnChat.classList.remove('active');
});
btnChat.classList.add('active');


// ==========================================
// 3. AUTENTICACIÓN, MONEDAS, DESCANSOS Y METAS
// ==========================================
const provider = new firebase.auth.GoogleAuthProvider();
let usuarioActual = null;
let nombreTutor = "Tutor IA";
let unsubscribeUsuario = null;
let unsubscribeVocab = null;
let diasDescansoUsuario = [];
let penalizacionVerificadaHoy = false;
let ultimaActividadMs = 0;
let timerPractica = null;
let toastTimeout = null;

function formatearFechaLocal(fecha = new Date()) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function obtenerFechaHoy() {
    return formatearFechaLocal(new Date());
}

function mostrarToastBono(mensaje, esPenalizacion = false) {
    const toast = document.getElementById('toast-bono');
    if (!toast) return;
    toast.textContent = mensaje;
    toast.classList.remove('hidden', 'penalty');
    if (esPenalizacion) toast.classList.add('penalty');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 4500);
}

function obtenerInfoRango(monedas) {
    if (monedas >= 1000) return { nombre: "Ejecutivo · Nv. 5", min: 1000, max: 1000, siguiente: null };
    if (monedas >= 500) return { nombre: "Oro · Nv. 4", min: 500, max: 1000, siguiente: "Ejecutivo" };
    if (monedas >= 250) return { nombre: "Plata · Nv. 3", min: 250, max: 500, siguiente: "Oro" };
    if (monedas >= 100) return { nombre: "Bronce · Nv. 2", min: 100, max: 250, siguiente: "Plata" };
    return { nombre: "Aprendiz · Nv. 1", min: 0, max: 100, siguiente: "Bronce" };
}

function renderizarTituloTutor(nombre) {
    const titulo = document.getElementById('tutor-title');
    titulo.innerHTML = '';
    titulo.appendChild(document.createTextNode(`${nombre} `));
    const icono = document.createElement('i');
    icono.className = 'fas fa-pen';
    icono.id = 'btn-edit-name';
    icono.style.cssText = 'font-size: 0.7em; cursor: pointer; margin-left: 6px; opacity: 0.7;';
    titulo.appendChild(icono);
}

function pronunciarPalabra(texto) {
    window.speechSynthesis.cancel();
    const voces = window.speechSynthesis.getVoices();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = 'en-US';
    utter.rate = 0.88;
    const vozEn = voces.find(v => v.lang.startsWith('en') && (v.name.includes('Google US English') || v.name.includes('Zira')));
    if (vozEn) utter.voice = vozEn;
    window.speechSynthesis.speak(utter);
}

function renderizarDiasDescanso(dias) {
    diasDescansoUsuario = Array.isArray(dias) ? dias : [];
    const botones = document.querySelectorAll('#dias-descanso-grid .rest-day-btn');
    botones.forEach(btn => {
        const dia = parseInt(btn.dataset.day, 10);
        btn.classList.toggle('active', diasDescansoUsuario.includes(dia));
    });
}

function actualizarPanelProgreso(data) {
    const monedas = data.monedas !== undefined ? data.monedas : (data.xp || 0);
    const racha = data.racha || 0;
    const hoy = obtenerFechaHoy();
    const esMismoDia = data.fechaHoy === hoy;
    const frasesHoy = esMismoDia ? (data.frasesHoy || 0) : 0;
    const sumaPrecision = esMismoDia ? (data.sumaPrecision || 0) : 0;
    const segundosHoy = esMismoDia ? (data.segundosHoy || 0) : 0;
    const metaCumplidaHoy = esMismoDia ? Boolean(data.metaCumplidaHoy) : false;
    const promedio = frasesHoy > 0 ? Math.round(sumaPrecision / frasesHoy) : 0;

    // Monedas y Racha
    document.getElementById('xp-total').textContent = `${monedas} 🪙`;
    document.getElementById('racha-dias').textContent = `${racha} ${racha === 1 ? 'día' : 'días'}`;

    // Rango y barra de progreso de nivel
    const rango = obtenerInfoRango(monedas);
    document.getElementById('nivel-rango').textContent = rango.nombre;
    if (rango.siguiente) {
        const avance = Math.min(100, Math.round(((monedas - rango.min) / (rango.max - rango.min)) * 100));
        document.getElementById('nivel-progreso-texto').textContent = `${monedas} / ${rango.max} monedas para ${rango.siguiente}`;
        document.getElementById('nivel-barra').style.width = `${avance}%`;
    } else {
        document.getElementById('nivel-progreso-texto').textContent = `¡Rango máximo alcanzado! (${monedas} 🪙)`;
        document.getElementById('nivel-barra').style.width = '100%';
    }

    // Días de descanso
    renderizarDiasDescanso(data.diasDescanso || []);

    // Metas diarias (Precisión y 15 minutos)
    const minutosHoy = Math.min(15, Math.floor(segundosHoy / 60));
    const porcentajeTiempo = Math.min(100, Math.round((segundosHoy / 900) * 100));

    document.getElementById('precision-texto').textContent = frasesHoy > 0
        ? `Precisión promedio: ${promedio}%`
        : 'Precisión promedio: --%';
    document.getElementById('precision-barra').style.width = `${promedio}%`;

    document.getElementById('practica-texto').textContent = `Tiempo practicado hoy: ${minutosHoy} / 15 min`;
    document.getElementById('practica-barra').style.width = `${porcentajeTiempo}%`;

    // Medallas
    const medallas = [
        { icon: 'fa-award', label: 'Inicio', ok: monedas >= 10 || frasesHoy >= 1, title: 'Completa tu primera frase' },
        { icon: 'fa-bullseye', label: 'Precisión', ok: Boolean(data.medallaPrecision), title: 'Saca 90%+ en una frase (+10 🪙)' },
        { icon: 'fa-trophy', label: 'Meta 15m', ok: metaCumplidaHoy || Boolean(data.medallaMeta15), title: 'Cumple 15 min diarios (+50 🪙)' },
        { icon: 'fa-coins', label: '100 🪙', ok: monedas >= 100, title: 'Alcanza 100 monedas' },
        { icon: 'fa-fire', label: '3 Días', ok: racha >= 3, title: 'Racha de 3 días' }
    ];
    const contMedallas = document.getElementById('medallas-container');
    contMedallas.innerHTML = '';
    medallas.forEach(m => {
        const span = document.createElement('span');
        span.className = `medal ${m.ok ? '' : 'locked'}`;
        span.title = m.title;
        span.innerHTML = `<i class="fas ${m.icon}"></i> ${m.label}`;
        contMedallas.appendChild(span);
    });
}

async function verificarPenalizacionDias(user, data) {
    const hoy = obtenerFechaHoy();
    if (penalizacionVerificadaHoy) return;
    penalizacionVerificadaHoy = true;

    const ultimaPractica = data.ultimaFechaPractica;
    if (!ultimaPractica || ultimaPractica >= hoy || data.ultimaPenalizacionFecha === hoy) return;

    const [y, m, d] = ultimaPractica.split('-').map(Number);
    const cursor = new Date(y, m - 1, d);
    const descansos = Array.isArray(data.diasDescanso) ? data.diasDescanso : [];
    let diasFaltados = 0;

    cursor.setDate(cursor.getDate() + 1);
    while (formatearFechaLocal(cursor) < hoy) {
        if (!descansos.includes(cursor.getDay())) {
            diasFaltados++;
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    if (diasFaltados > 0) {
        const monedasActuales = data.monedas !== undefined ? data.monedas : (data.xp || 0);
        const descuento = diasFaltados * 15;
        const nuevasMonedas = Math.max(0, monedasActuales - descuento);

        await db.collection("usuarios").doc(user.uid).set({
            monedas: nuevasMonedas,
            racha: 0,
            ultimaPenalizacionFecha: hoy
        }, { merge: true });

        mostrarToastBono(`Faltaste ${diasFaltados} día(s) sin descanso programado: -${descuento} 🪙`, true);
    }
}

// Botón de Login
document.getElementById('btn-login').addEventListener('click', () => {
    firebase.auth().signInWithPopup(provider).catch(error => {
        console.error("Error al iniciar sesión:", error);
    });
});

// Botón de Cerrar Sesión
document.getElementById('btn-logout').addEventListener('click', () => {
    window.speechSynthesis.cancel();
    if (typeof historialChat !== 'undefined') historialChat = [];
    ultimaActividadMs = 0;
    penalizacionVerificadaHoy = false;
    chatView.innerHTML = `
        <div class="message ai-message">
            <div class="avatar"><i class="fas fa-graduation-cap"></i></div>
            <div class="bubble"><p>Hello! I'm ready when you are. Toca el micrófono o escribe abajo para empezar a practicar.</p></div>
        </div>
    `;
    firebase.auth().signOut();
});

// Clic en botones de días de descanso
document.getElementById('dias-descanso-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.rest-day-btn');
    if (!btn || !usuarioActual) return;

    const dia = parseInt(btn.dataset.day, 10);
    let nuevosDias = [...diasDescansoUsuario];
    if (nuevosDias.includes(dia)) {
        nuevosDias = nuevosDias.filter(d => d !== dia);
    } else {
        nuevosDias.push(dia);
    }

    renderizarDiasDescanso(nuevosDias);
    db.collection("usuarios").doc(usuarioActual.uid).set({
        diasDescanso: nuevosDias
    }, { merge: true });
});

// Guardar Nivel y Tema cuando cambien
selectNivel.addEventListener('change', () => {
    if (usuarioActual) {
        db.collection("usuarios").doc(usuarioActual.uid).set({
            nivelPreferido: selectNivel.value
        }, { merge: true });
    }
});

selectTema.addEventListener('change', () => {
    if (usuarioActual) {
        db.collection("usuarios").doc(usuarioActual.uid).set({
            temaPreferido: selectTema.value
        }, { merge: true });
    }
});

// Escuchar estado de sesión
firebase.auth().onAuthStateChanged((user) => {
    if (unsubscribeUsuario) { unsubscribeUsuario(); unsubscribeUsuario = null; }
    if (unsubscribeVocab) { unsubscribeVocab(); unsubscribeVocab = null; }
    if (timerPractica) { clearInterval(timerPractica); timerPractica = null; }

    if (user) {
        usuarioActual = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').classList.remove('hidden');

        // Escuchar perfil, monedas y metas en tiempo real
        unsubscribeUsuario = db.collection("usuarios").doc(user.uid).onSnapshot((doc) => {
            const data = doc.exists ? doc.data() : {};
            if (data.nombreTutor) {
                nombreTutor = data.nombreTutor;
                renderizarTituloTutor(nombreTutor);
            }
            if (data.nivelPreferido) selectNivel.value = data.nivelPreferido;
            if (data.temaPreferido) selectTema.value = data.temaPreferido;
            actualizarPanelProgreso(data);
            verificarPenalizacionDias(user, data);
        });

        // Ticker cada 30s mientras practicas activamente para sumar tiempo real
        timerPractica = setInterval(() => {
            if (usuarioActual && ultimaActividadMs > 0 && (Date.now() - ultimaActividadMs) < 120000) {
                if (typeof registrarProgresoEnFirebase === 'function') {
                    registrarProgresoEnFirebase(null, 0, [], 30);
                }
            }
        }, 30000);

        // Cargar el vocabulario del usuario
        unsubscribeVocab = db.collection("usuarios").doc(user.uid).collection("vocabulario")
            .orderBy("fecha", "desc")
            .onSnapshot((querySnapshot) => {
                const listaVocabulario = document.getElementById('lista-vocabulario');
                listaVocabulario.innerHTML = "";

                if (querySnapshot.empty) {
                    const li = document.createElement('li');
                    li.className = 'vocab-empty';
                    li.textContent = 'Tu vocabulario nuevo aparecerá aquí mientras practicas.';
                    listaVocabulario.appendChild(li);
                    return;
                }

                querySnapshot.forEach((doc) => {
                    const palabra = doc.data();
                    const li = document.createElement('li');

                    const textoSpan = document.createElement('span');
                    const strong = document.createElement('strong');
                    strong.textContent = palabra.ingles || '';
                    textoSpan.appendChild(strong);
                    textoSpan.appendChild(document.createTextNode(` — ${palabra.espanol || ''}`));

                    const acciones = document.createElement('div');
                    acciones.className = 'vocab-actions';

                    const btnAudio = document.createElement('button');
                    btnAudio.className = 'btn-vocab-audio';
                    btnAudio.title = 'Escuchar pronunciación';
                    btnAudio.innerHTML = '<i class="fas fa-volume-up"></i>';
                    btnAudio.onclick = () => pronunciarPalabra(palabra.ingles || '');

                    const btnBorrar = document.createElement('button');
                    btnBorrar.className = 'btn-delete-vocab';
                    btnBorrar.title = 'Eliminar palabra';
                    btnBorrar.innerHTML = '<i class="fas fa-trash-alt"></i>';
                    btnBorrar.onclick = () => doc.ref.delete();

                    acciones.appendChild(btnAudio);
                    acciones.appendChild(btnBorrar);
                    li.appendChild(textoSpan);
                    li.appendChild(acciones);
                    listaVocabulario.appendChild(li);
                });
            });

    } else {
        usuarioActual = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('main-app').classList.add('hidden');
    }
});

// ==========================================
// CAMBIAR EL NOMBRE DEL TUTOR
// ==========================================
document.getElementById('tutor-title').addEventListener('click', (e) => {
    if (e.target.id === 'btn-edit-name' || e.target.closest('#btn-edit-name')) {
        const nuevoNombre = prompt("¿Cómo quieres llamar a tu tutor de inglés?", nombreTutor);
        if (nuevoNombre && nuevoNombre.trim() !== "") {
            nombreTutor = nuevoNombre.trim();
            renderizarTituloTutor(nombreTutor);

            if (usuarioActual) {
                db.collection("usuarios").doc(usuarioActual.uid).set({
                    nombreTutor: nombreTutor
                }, { merge: true });
            }
        }
    }
});


// ==========================================
// 4 y 5. CHAT POR VOZ/TEXTO, MEMORIA Y RECOMPENSAS
// ==========================================
let mediaRecorder;
let audioChunks = [];
let streamActivo;
let historialChat = [];
let estaProcesando = false;

const micBtn = document.getElementById('micBtn');
const textoInput = document.getElementById('texto-input');
const btnEnviarTexto = document.getElementById('btn-enviar-texto');

function obtenerFechaAyer() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function escaparHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
}

function reproducirVozSecuencial(textoEspanol, textoIngles) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const voces = window.speechSynthesis.getVoices();
    const mejorVozEs = voces.find(v => v.lang.startsWith('es') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Helena')));
    const mejorVozEn = voces.find(v => v.lang.startsWith('en') && (v.name.includes('Google US English') || v.name.includes('Zira')));

    const hablarIngles = () => {
        if (!textoIngles) return;
        const vozEn = new SpeechSynthesisUtterance(textoIngles);
        vozEn.lang = 'en-US';
        vozEn.rate = 0.88;
        if (mejorVozEn) vozEn.voice = mejorVozEn;
        window.speechSynthesis.speak(vozEn);
    };

    if (textoEspanol) {
        const vozEs = new SpeechSynthesisUtterance(textoEspanol);
        vozEs.lang = 'es-ES';
        if (mejorVozEs) vozEs.voice = mejorVozEs;
        vozEs.onend = hablarIngles;
        window.speechSynthesis.speak(vozEs);
    } else {
        hablarIngles();
    }
}

function agregarMensajeAlChat(texto, clase, textoInglesParaAudio = "") {
    const chatArea = document.getElementById('chat-view');
    const div = document.createElement('div');
    div.className = `message ${clase}`;

    const contenidoSeguro = escaparHTML(texto).replace(/\n/g, '<br>');

    if (clase.includes('ai-message')) {
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = '<i class="fas fa-graduation-cap"></i>';
        div.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `<p>${contenidoSeguro}</p>`;

    if (textoInglesParaAudio) {
        const actions = document.createElement('div');
        actions.className = 'bubble-actions';
        const btnSpeak = document.createElement('button');
        btnSpeak.className = 'btn-speak';
        btnSpeak.innerHTML = '<i class="fas fa-volume-up"></i> Escuchar inglés';
        btnSpeak.onclick = () => pronunciarPalabra(textoInglesParaAudio);
        actions.appendChild(btnSpeak);
        bubble.appendChild(actions);
    }

    div.appendChild(bubble);
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

function mostrarIndicadorCargando() {
    const chatArea = document.getElementById('chat-view');
    const div = document.createElement('div');
    div.className = 'message ai-message';
    div.id = 'typing-indicator';
    div.innerHTML = `
        <div class="avatar"><i class="fas fa-graduation-cap"></i></div>
        <div class="bubble typing-bubble"><p>Analizando tu respuesta...</p></div>
    `;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function quitarIndicadorCargando() {
    const indicador = document.getElementById('typing-indicator');
    if (indicador) indicador.remove();
}

function lanzarConfeti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2000;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const colores = ['#F59E0B', '#10B981', '#0F172A', '#3B82F6', '#EF4444'];
    const particulas = Array.from({ length: 140 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.4 - canvas.height * 0.2,
        vx: (Math.random() - 0.5) * 7,
        vy: Math.random() * 4 + 3,
        size: Math.random() * 7 + 4,
        color: colores[Math.floor(Math.random() * colores.length)],
        rot: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 10
    }));

    let frame = 0;
    function animar() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particulas.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;
            p.rot += p.vRot;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        });
        frame++;
        if (frame < 190) {
            requestAnimationFrame(animar);
        } else {
            canvas.remove();
        }
    }
    requestAnimationFrame(animar);
}

async function registrarProgresoEnFirebase(precision, monedasBase, vocabulario, segundosExtra = 0) {
    if (!usuarioActual) return;

    const userRef = db.collection("usuarios").doc(usuarioActual.uid);
    const hoy = obtenerFechaHoy();
    const esTurnoChat = precision !== null;

    try {
        const doc = await userRef.get();
        const data = doc.exists ? doc.data() : {};
        const monedasActuales = data.monedas !== undefined ? data.monedas : (data.xp || 0);
        const mismoDia = data.fechaHoy === hoy;

        // Calcular tiempo activo
        const ahora = Date.now();
        let segundosASumar = segundosExtra;
        if (esTurnoChat) {
            const delta = ultimaActividadMs > 0 ? Math.round((ahora - ultimaActividadMs) / 1000) : 45;
            segundosASumar = Math.min(120, Math.max(30, delta));
            ultimaActividadMs = ahora;
        }

        const segundosHoy = (mismoDia ? (data.segundosHoy || 0) : 0) + segundosASumar;
        const frasesHoy = (mismoDia ? (data.frasesHoy || 0) : 0) + (esTurnoChat ? 1 : 0);
        const sumaPrecision = (mismoDia ? (data.sumaPrecision || 0) : 0) + (esTurnoChat ? precision : 0);
        let metaCumplidaHoy = mismoDia ? Boolean(data.metaCumplidaHoy) : false;

        // Calcular monedas y bonos
        let monedasGanadas = esTurnoChat ? monedasBase : 0;
        let mensajeToast = esTurnoChat ? `+${monedasBase} 🪙 por practicar` : "";
        let medallaPrecision = Boolean(data.medallaPrecision);
        let medallaMeta15 = Boolean(data.medallaMeta15);

        if (esTurnoChat && precision >= 90) {
            monedasGanadas += 10;
            medallaPrecision = true;
            mensajeToast = `+${monedasGanadas} 🪙 · ¡Excelente precisión (${precision}%)!`;
        }

        // Calcular racha y bono de 15 minutos
        let nuevaRacha = data.racha || 0;
        if (esTurnoChat && nuevaRacha === 0) {
            nuevaRacha = 1;
        }

        let celebroMeta = false;
        if (!metaCumplidaHoy && segundosHoy >= 900) {
            metaCumplidaHoy = true;
            medallaMeta15 = true;
            monedasGanadas += 50;
            celebroMeta = true;

            const ayerDate = new Date();
            ayerDate.setDate(ayerDate.getDate() - 1);
            const ayer = formatearFechaLocal(ayerDate);

            if (data.ultimaFechaPractica === hoy) {
                nuevaRacha = Math.max(1, nuevaRacha);
            } else if (data.ultimaFechaPractica === ayer) {
                nuevaRacha = (data.racha || 0) + 1;
            } else {
                nuevaRacha = Math.max(1, nuevaRacha);
            }
        }

        await userRef.set({
            monedas: monedasActuales + monedasGanadas,
            racha: nuevaRacha,
            ultimaFechaPractica: hoy,
            fechaHoy: hoy,
            frasesHoy: frasesHoy,
            sumaPrecision: sumaPrecision,
            segundosHoy: segundosHoy,
            metaCumplidaHoy: metaCumplidaHoy,
            medallaPrecision: medallaPrecision,
            medallaMeta15: medallaMeta15
        }, { merge: true });

        if (celebroMeta) {
            lanzarConfeti();
            mostrarToastBono("🎉 ¡Meta de 15 minutos cumplida! +50 🪙 y racha protegida");
        } else if (esTurnoChat && mensajeToast) {
            mostrarToastBono(mensajeToast);
        }

        if (esTurnoChat && Array.isArray(vocabulario)) {
            vocabulario.forEach(async (item) => {
                if (item && item.en && item.es) {
                    await userRef.collection("vocabulario").add({
                        ingles: item.en,
                        espanol: item.es,
                        fecha: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            });
        }
    } catch (error) {
        console.error("Error guardando progreso:", error);
    }
}

async function procesarRespuestaTutor(datos) {
    const estructurado = datos.datos_estructurados;
    let textoEspanol = "";
    let textoIngles = "";
    let vocabulario = [];
    let precision = 80;
    let monedasBase = 10;

    if (estructurado) {
        textoEspanol = estructurado.espanol || "";
        textoIngles = estructurado.ingles || "";
        vocabulario = estructurado.vocabulario || [];
        precision = estructurado.precision || 80;
        monedasBase = estructurado.xp_ganados || 10;
    } else {
        const partes = (datos.texto_ia || "").split('---');
        textoEspanol = partes[0] ? partes[0].trim() : "";
        textoIngles = partes[1] ? partes[1].trim() : "";
    }

    agregarMensajeAlChat(datos.transcripcion_usuario, 'user-message');
    agregarMensajeAlChat(`${textoEspanol}\n\n${textoIngles}`, 'ai-message', textoIngles);

    historialChat.push({ role: 'user', content: datos.transcripcion_usuario });
    historialChat.push({ role: 'assistant', content: textoIngles || textoEspanol });
    if (historialChat.length > 10) {
        historialChat = historialChat.slice(-10);
    }

    await registrarProgresoEnFirebase(precision, monedasBase, vocabulario);
    reproducirVozSecuencial(textoEspanol, textoIngles);
}

async function enviarTextoEscrito() {
    const texto = textoInput.value.trim();
    if (!texto || estaProcesando) return;

    window.speechSynthesis.cancel();
    textoInput.value = "";
    estaProcesando = true;
    btnEnviarTexto.disabled = true;
    mostrarIndicadorCargando();

    try {
        const respuesta = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texto: texto,
                nombreTutor: nombreTutor,
                nivel: selectNivel.value,
                tema: selectTema.value,
                historial: historialChat
            })
        });

        if (!respuesta.ok) throw new Error("Error en el servidor");
        const datos = await respuesta.json();
        quitarIndicadorCargando();
        await procesarRespuestaTutor(datos);
    } catch (error) {
        quitarIndicadorCargando();
        console.error("Error enviando texto:", error);
        agregarMensajeAlChat("No pude conectarme con el servidor. Revisa si Node está corriendo o si Render está despertando.", 'ai-message');
    } finally {
        estaProcesando = false;
        btnEnviarTexto.disabled = false;
        textoInput.focus();
    }
}

btnEnviarTexto.addEventListener('click', enviarTextoEscrito);
textoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        enviarTextoEscrito();
    }
});

micBtn.addEventListener('click', async () => {
    if (estaProcesando) return;
    window.speechSynthesis.cancel();

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        micBtn.classList.remove('recording');
        return;
    }

    try {
        streamActivo = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        const audioTrack = streamActivo.getAudioTracks()[0];
        const nombreMicro = audioTrack ? audioTrack.label : 'Micrófono desconocido';
        console.log("🎤 Micrófono activo:", nombreMicro);

        let nivelPico = 0;
        let audioCtx = null;
        let intervaloVolumen = null;

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioCtx();
            const source = audioCtx.createMediaStreamSource(streamActivo);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            intervaloVolumen = setInterval(() => {
                analyser.getByteTimeDomainData(dataArray);
                for (let i = 0; i < dataArray.length; i++) {
                    const desv = Math.abs(dataArray[i] - 128);
                    if (desv > nivelPico) nivelPico = desv;
                }
            }, 100);
        } catch (e) {
            nivelPico = 10; // Si el navegador bloquea AudioContext, permitimos continuar
        }

        mediaRecorder = new MediaRecorder(streamActivo);
        audioChunks = [];
        const placeholderOriginal = textoInput.placeholder;
        textoInput.placeholder = "🎙️ Escuchando... habla ahora y vuelve a tocar el micro al terminar";

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            textoInput.placeholder = placeholderOriginal;
            if (intervaloVolumen) clearInterval(intervaloVolumen);
            if (audioCtx) audioCtx.close().catch(() => {});
            streamActivo.getTracks().forEach(track => track.stop());

            console.log("🔊 Nivel máximo de voz captado:", nivelPico);
            if (nivelPico < 4) {
                agregarMensajeAlChat(`No detecté sonido en tu micrófono (${nombreMicro}). Revisa si está silenciado en Windows o en el ícono de candado/micrófono de Chrome.`, 'ai-message');
                return;
            }

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', audioBlob, 'grabacion.webm');
            formData.append('nombreTutor', nombreTutor);
            formData.append('nivel', selectNivel.value);
            formData.append('tema', selectTema.value);
            formData.append('historial', JSON.stringify(historialChat));

            estaProcesando = true;
            mostrarIndicadorCargando();

            try {
                const respuesta = await fetch('/api/chat', {
                    method: 'POST',
                    body: formData
                });

                if (!respuesta.ok) throw new Error("Error en el servidor");
                const datos = await respuesta.json();
                quitarIndicadorCargando();
                await procesarRespuestaTutor(datos);
            } catch (error) {
                quitarIndicadorCargando();
                console.error("Error al enviar el audio:", error);
                agregarMensajeAlChat("No pude procesar el audio. Revisa la consola del servidor.", 'ai-message');
            } finally {
                estaProcesando = false;
            }
        };

        mediaRecorder.start(250);
        micBtn.classList.add('recording');
    } catch (error) {
        console.error("Error al acceder al micrófono:", error);
        alert("Debes permitir el uso del micrófono para hablar.");
    }
});

// ==========================================
// REGISTRO DE SERVICE WORKER PARA PWA
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA lista para instalarse'))
            .catch(err => console.error('Error en PWA:', err));
    });
}