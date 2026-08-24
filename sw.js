// Este código básico le dice al navegador que la app es instalable
self.addEventListener('install', (e) => {
    console.log('Service Worker: Instalado');
});

self.addEventListener('fetch', (e) => {
    // Requisito mínimo para que Chrome ofrezca el botón de "Instalar"
});