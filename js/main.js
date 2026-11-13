'use strict';
/* Opstarten — wordt als laatste geladen, na app.js en song.js */
$('#mode-btn').onclick=()=>setMode(state.songMode?'loop':'song');
window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;const t=e.target;if(t&&t.closest&&t.closest('input:not([type=range]),select,textarea'))return;
 if(e.shiftKey&&e.code==='KeyS'){e.preventDefault();setMode(state.songMode?'loop':'song')}});

renderAll();loadSamples();renderConnect();

/* Offline-app (PWA). Niet in de claude.ai-weergave, niet via file:// (Electron). */
(function(){try{const inFrame=window.self!==window.top;
 if('serviceWorker' in navigator&&!inFrame&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{})}catch(e){}})();
