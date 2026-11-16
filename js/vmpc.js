'use strict';
/* 🎛️ VMPC2000XL — de echte open-source MPC2000XL-emulator (Izmar, GPL-3.0), per platform:
   Windows/Mac-app: zit erin en start met één tik · Android: aparte app, start vanuit hier ·
   iPhone/iPad: installeren met Sideloadly/AltStore · browser: downloadlinks. */
const VMPC_TAG='vmpc-0.9.21',VMPC_REL='https://github.com/LOBBZ/mpc-touch-studio/releases',VMPC_DL=f=>`${VMPC_REL}/download/${VMPC_TAG}/${f}`;
const VMPC_ANDROID_ID='nl.izmar.vmpc2000xl';
function vmpcPlatform(){if(window.mpcNative)return'desktop-app';const ua=navigator.userAgent;if(typeof isNativeApp==='function'&&isNativeApp())return(Capacitor.getPlatform&&Capacitor.getPlatform())==='ios'?'ios':'android-app';
 if(/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return'ios';if(/Android/.test(ua))return'android-web';if(/Mac/.test(ua))return'mac-web';return'windows-web'}
async function openExternal(url){try{const AL=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.AppLauncher;if(AL&&isNativeApp()){await AL.openUrl({url});return}}catch(e){}window.open(url,'_blank','noopener')}
async function renderVmpc(){const box=$('#vmpc-body');if(!box)return;const pf=vmpcPlatform();let h='';
 const midiWin=`<details><summary>Spelen vanuit MPC Touch Studio (MIDI)</summary><ol><li>Installeer <b>loopMIDI</b> en maak een poort aan (bijv. "MPC Touch Studio").</li><li>In VMPC2000XL: <b>Options › Audio/MIDI Settings</b> → zet die poort aan als MIDI-input.</li><li>Hier in de app: tab <b>DAW / MIDI</b> → MIDI-uitgang = die poort. Je pads en klavier spelen nu VMPC2000XL.</li></ol></details>`;
 const midiMac=`<details><summary>Spelen vanuit MPC Touch Studio (MIDI)</summary><ol><li>Open <b>Audio-MIDI-configuratie</b> › Venster › MIDI-studio › dubbelklik <b>IAC-stuurprogramma</b> → <b>Apparaat is online</b>.</li><li>In VMPC2000XL: <b>Options › Audio/MIDI Settings</b> → MIDI-input = IAC.</li><li>Hier in de app: <b>DAW / MIDI</b> → uitgang = IAC. Je pads en klavier spelen VMPC2000XL.</li></ol></details>`;
 if(pf==='desktop-app'){let info={installed:false};try{info=await window.mpcNative.vmpcInfo()}catch(e){}
  if(info.installed)h=`<p>VMPC2000XL zit in deze app. Hij opent in een eigen venster met het echte MPC2000XL-scherm en alle menu's.</p>
   <div class="btn-row"><button class="btn good big" id="vmpc-start">▶ Start MPC2000XL</button><button class="btn" id="vmpc-files">📁 Mijn MPC-bestanden</button>${info.vst3?'<button class="btn" id="vmpc-vst">🔌 VST3 voor FL Studio</button>':''}</div>
   ${info.vst3?'<p class="hint">VST3 in FL Studio: kopieer <b>VMPC2000XL.vst3</b> uit de map die opent naar <code>'+(info.platform==='darwin'?'~/Library/Audio/Plug-Ins/VST3':'C:\\Program Files\\Common Files\\VST3')+'</code> en laat FL opnieuw zoeken (Plugin manager › Find plugins).</p>':''}
   ${info.platform==='darwin'?midiMac:midiWin}`;
  else h=`<p>Deze installatie heeft VMPC2000XL nog niet. Download de nieuwste MPC Touch Studio, of VMPC2000XL los:</p><div class="btn-row"><a class="btn" href="${VMPC_DL(info.platform==='darwin'?'VMPC2000XL-macos-universal.zip':'VMPC2000XL-windows-x64.zip')}">↓ VMPC2000XL</a></div>`}
 else if(pf==='android-app'||pf==='android-web'){let has=false;try{const AL=Capacitor.Plugins.AppLauncher;has=AL&&(await AL.canOpenUrl({url:VMPC_ANDROID_ID})).value}catch(e){}
  h=`<p>Op Android is VMPC2000XL een eigen app naast MPC Touch Studio.</p><div class="btn-row">${has?'<button class="btn good big" id="vmpc-start-android">▶ Start MPC2000XL</button>':''}<button class="btn${has?'':' good'}" id="vmpc-get-android">${has?'↻ Nieuwste versie':'↓ VMPC2000XL-app downloaden (APK)'}</button></div>
   ${has?'':'<ol class="hint"><li>Download de APK en tik hem open → <b>Installeren</b> (zoals bij MPC Touch Studio).</li><li>Kom terug en tik <b>▶ Start MPC2000XL</b>.</li></ol>'}
   <p class="hint">Tip: in VMPC2000XL kun je je MPC (USB) als MIDI-keyboard gebruiken; Android regelt dat zelf.</p>`}
 else if(pf==='ios'){h=`<p>Apple laat apps buiten de App Store alleen toe via <b>sideloaden</b> met je eigen Apple ID. Zo zet je VMPC2000XL op je iPhone/iPad:</p>
   <ol><li>Download op je pc/Mac <a href="${VMPC_DL('VMPC2000XL-ios-unsigned.ipa')}">VMPC2000XL-ios-unsigned.ipa</a> en <b>Sideloadly</b> (sideloadly.io).</li><li>Sluit je iPhone met de kabel aan, sleep de IPA in Sideloadly, vul je Apple ID in en klik <b>Start</b>.</li><li>Op de iPhone: <b>Instellingen › Algemeen › VPN en apparaatbeheer</b> → je Apple ID vertrouwen. Bij iOS 16+ ook <b>Ontwikkelaarsmodus</b> aanzetten.</li></ol>
   <p class="hint">Met een gratis Apple ID moet je dit elke 7 dagen herhalen (Sideloadly kan dat automatisch). Met een betaald ontwikkelaarsaccount is het een jaar. MPC Touch Studio zelf werkt gewoon in Safari (Deel › Zet op beginscherm).</p>`}
 else{const mac=pf==='mac-web';h=`<p>VMPC2000XL draait als echte app op je computer. Het makkelijkst: installeer MPC Touch Studio voor ${mac?'Mac':'Windows'} — VMPC2000XL zit erin en start met één klik.</p>
   <div class="btn-row"><a class="btn good" href="${VMPC_REL}" target="_blank" rel="noopener">↓ MPC Touch Studio voor ${mac?'Mac':'Windows'}</a><a class="btn" href="${VMPC_DL(mac?'VMPC2000XL-macos-universal.zip':'VMPC2000XL-windows-x64.zip')}">↓ Alleen VMPC2000XL</a></div>${mac?midiMac:midiWin}`}
 h+=`<p class="hint vmpc-lic">VMPC2000XL is vrije software van Izmar (izzyreal) onder de GNU GPL v3 — <a href="https://github.com/izzyreal/vmpc-juce" target="_blank" rel="noopener">broncode</a>. Geen officiële Akai-software.</p>`;
 box.innerHTML=h;
 const b=(id,fn)=>{const el=$('#'+id);if(el)el.onclick=fn};
 b('vmpc-start',async()=>{const r=await window.mpcNative.launchVmpc();toast(r.ok?'MPC2000XL wordt gestart…':'Starten mislukt: '+r.error,null,3000)});
 b('vmpc-files',()=>window.mpcNative.openVmpcFolder('docs'));b('vmpc-vst',()=>window.mpcNative.openVmpcFolder('vst3'));
 b('vmpc-start-android',async()=>{try{await Capacitor.Plugins.AppLauncher.openUrl({url:VMPC_ANDROID_ID})}catch(e){toast('Kon VMPC2000XL niet openen')}});
 b('vmpc-get-android',()=>openExternal(VMPC_DL('VMPC2000XL-android-arm64.apk')))}
function vmpcToggle(on){const d=$('#vmpc');const show=on??d.hidden;d.hidden=!show;if(show)renderVmpc()}
$('#vmpc-btn').onclick=()=>vmpcToggle();$('#vmpc-close').onclick=()=>vmpcToggle(false);
$('#vmpc').addEventListener('click',e=>{if(e.target.id==='vmpc')vmpcToggle(false)});
