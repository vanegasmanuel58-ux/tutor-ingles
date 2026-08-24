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
// 3. AUTENTICACIÓN CON GOOGLE Y DATOS PRIVADOS
// ==========================================
const provider = new firebase.auth.GoogleAuthProvider();
let usuarioActual = null; 
let nombreTutor = "Tutor IA"; // Nombre por defecto

// Botón de Login
document.getElementById('btn-login').addEventListener('click', () => {
    firebase.auth().signInWithPopup(provider).catch(error => {
        console.error("Error al iniciar sesión:", error);
    });
});

// Escuchar si alguien entra o sale
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        usuarioActual = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').classList.remove('hidden');

        // Buscar si este usuario ya le había puesto un nombre al tutor
        db.collection("usuarios").doc(user.uid).get().then((doc) => {
            if (doc.exists && doc.data().nombreTutor) {
                nombreTutor = doc.data().nombreTutor;
                document.getElementById('tutor-title').innerHTML = `${nombreTutor} <i class="fas fa-pen" id="btn-edit-name" style="font-size: 0.6em; cursor: pointer; margin-left: 5px; opacity: 0.7;"></i>`;
            }
        });

        // Cargar el vocabulario SOLO de este usuario
        db.collection("usuarios").doc(user.uid).collection("vocabulario")
          .orderBy("fecha", "desc")
          .onSnapshot((querySnapshot) => {
            const listaVocabulario = document.getElementById('lista-vocabulario');
            listaVocabulario.innerHTML = ""; 

            querySnapshot.forEach((doc) => {
                const palabra = doc.data();
                const li = document.createElement('li');
                li.innerHTML = `<strong>${palabra.ingles}:</strong> ${palabra.espanol}`;
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
            document.getElementById('tutor-title').innerHTML = `${nombreTutor} <i class="fas fa-pen" id="btn-edit-name" style="font-size: 0.6em; cursor: pointer; margin-left: 5px; opacity: 0.7;"></i>`;
            
            if (usuarioActual) {
                db.collection("usuarios").doc(usuarioActual.uid).set({
                    nombreTutor: nombreTutor
                }, { merge: true });
            }
        }
    }
});


// ==========================================
// 4. LÓGICA DEL MICRÓFONO Y LA INTELIGENCIA ARTIFICIAL
// ==========================================
let mediaRecorder;
let audioChunks = [];
const micBtn = document.getElementById('micBtn');

function agregarMensajeAlChat(texto, clase) {
    const chatArea = document.getElementById('chat-view');
    const div = document.createElement('div');
    div.className = `message ${clase}`;
    div.innerHTML = `<div class="bubble"><p>${texto.replace(/\n/g, '<br>')}</p></div>`;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            const formData = new FormData();
            formData.append('audio', audioBlob, 'grabacion.webm');
            
            // 🔴 Enviamos el nombre del tutor al servidor
            formData.append('nombreTutor', nombreTutor); 

            try {
                const respuesta = await fetch('/api/chat', {
                    method: 'POST',
                    body: formData
                });

                if (!respuesta.ok) throw new Error("Error en el servidor");
                
                const datos = await respuesta.json();
                
                const partesDelTexto = datos.texto_ia.split('---');
                const textoEspanol = partesDelTexto[0] ? partesDelTexto[0].trim() : "";
                const textoIngles = partesDelTexto[1] ? partesDelTexto[1].trim() : "";
                const vocabularioJSON = partesDelTexto[2] ? partesDelTexto[2].trim() : "[]";

                agregarMensajeAlChat(`Tú dijiste: ${datos.transcripcion_usuario}`, 'user-message');
                agregarMensajeAlChat(`${textoEspanol}\n\n${textoIngles}`, 'ai-message');

                try {
                    const jsonLimpio = vocabularioJSON.split("```json").join("").split("```").join("").trim();
                    const palabras = JSON.parse(jsonLimpio);
                    
                    if (usuarioActual) { // Solo guarda si hay usuario
                        palabras.forEach(async (item) => {
                            await db.collection("usuarios").doc(usuarioActual.uid).collection("vocabulario").add({
                                ingles: item.en,
                                espanol: item.es,
                                fecha: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        });
                    }
                } catch (error) {
                    console.error("No se pudo guardar el vocabulario:", error);
                }

                const vocesDisponibles = window.speechSynthesis.getVoices();

                if (textoEspanol) {
                    const vozEs = new SpeechSynthesisUtterance(textoEspanol);
                    vozEs.lang = 'es-ES';
                    const mejorVozEs = vocesDisponibles.find(v => v.lang.startsWith('es') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Helena')));
                    if (mejorVozEs) vozEs.voice = mejorVozEs;
                    window.speechSynthesis.speak(vozEs);
                }

                if (textoIngles) {
                    const vozEn = new SpeechSynthesisUtterance(textoIngles);
                    vozEn.lang = 'en-US';
                    vozEn.rate = 0.85; 
                    const mejorVozEn = vocesDisponibles.find(v => v.lang.startsWith('en') && (v.name.includes('Google US English') || v.name.includes('Zira')));
                    if (mejorVozEn) vozEn.voice = mejorVozEn;
                    window.speechSynthesis.speak(vozEn);
                }

            } catch (error) {
                console.error("Error al enviar el audio:", error);
                agregarMensajeAlChat("Error conectando con el servidor local.", 'ai-message');
            }
        };
    })
    .catch(error => {
        console.error("Error al acceder al micrófono:", error);
        alert("Debes permitir el uso del micrófono.");
    });

// ==========================================
// 5. BOTÓN DE GRABACIÓN
// ==========================================
micBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel(); 

    if (!mediaRecorder) {
        alert("El micrófono aún no está listo.");
        return;
    }

    if (mediaRecorder.state === 'inactive') {
        mediaRecorder.start();
        micBtn.classList.add('recording');
    } else {
        mediaRecorder.stop();
        micBtn.classList.remove('recording');
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