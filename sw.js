/* Service worker: maakt de app offline bruikbaar (PWA). Verhoog VERSION bij elke release. */
const VERSION='mpcts-v13';
const FILES=['./','./index.html','./css/app.css','./js/app.js','./js/sampler.js','./js/fx.js','./js/mixer.js','./js/song.js','./js/audio.js','./js/editor.js','./js/connect.js','./js/touchfx.js','./js/automation.js','./js/browser.js','./js/instruments.js','./js/theory.js','./js/keys.js','./js/proll.js','./js/plview.js','./js/fxrack.js','./js/aimix.js','./js/vst.js','./js/worklets.js','./js/main.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{const copy=res.clone();caches.open(VERSION).then(c=>c.put(e.request,copy));return res})))});
