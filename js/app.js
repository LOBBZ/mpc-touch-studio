'use strict';
const $=s=>document.querySelector(s);const $$=s=>Array.from(document.querySelectorAll(s));
const storeGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};const storeSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const UA=navigator.userAgent||'',PLAT=navigator.platform||'';
const IS_IOS=/iPhone|iPad|iPod/.test(UA)||(PLAT==='MacIntel'&&navigator.maxTouchPoints>1);
const IS_IPHONE=/iPhone|iPod/.test(UA);
const IS_MAC=/Mac/.test(PLAT)&&!IS_IOS;
const clamp=(n,l,h)=>Math.min(h,Math.max(l,n));

const BANKS=['A','B','C','D'];
const SOUNDS=[
[{name:'Deep Kick',type:'kick'},{name:'Warm Snare',type:'snare'},{name:'Closed Hat',type:'hat'},{name:'Open Hat',type:'openhat'},{name:'Clap',type:'clap'},{name:'Rim',type:'rim'},{name:'Low Tom',type:'tom'},{name:'High Tom',type:'tomhi'},{name:'Crash',type:'crash'},{name:'Shaker',type:'shaker'},{name:'Cowbell',type:'cowbell'},{name:'Perc 1',type:'perc'},{name:'Kick 2',type:'kick2'},{name:'Snare 2',type:'snare2'},{name:'Ride',type:'ride'},{name:'Snap',type:'snap'}],
[{name:'808 Kick',type:'kick2'},{name:'808 Snare',type:'snare2'},{name:'808 Hat',type:'hat'},{name:'808 Open',type:'openhat'},{name:'808 Clap',type:'clap'},{name:'808 Rim',type:'rim'},{name:'Sub Bass C',type:'sub'},{name:'Sub Bass G',type:'subg'},{name:'Trap Tick',type:'tick'},{name:'Trap Hat',type:'hat'},{name:'Laser',type:'laser'},{name:'808 Tom',type:'tom'},{name:'Perc 2',type:'perc'},{name:'Snap',type:'snap'},{name:'Cowbell',type:'cowbell'},{name:'Fx Sweep',type:'sweep'}],
[{name:'Wood Block',type:'block'},{name:'Bongo Low',type:'bongo'},{name:'Bongo High',type:'bongohi'},{name:'Congas',type:'conga'},{name:'Tambourine',type:'tamb'},{name:'Shaker',type:'shaker'},{name:'Claves',type:'clave'},{name:'Agogo',type:'agogo'},{name:'Rim',type:'rim'},{name:'Crash',type:'crash'},{name:'Ride',type:'ride'},{name:'Cowbell',type:'cowbell'},{name:'Low Tom',type:'tom'},{name:'High Tom',type:'tomhi'},{name:'Snap',type:'snap'},{name:'Tambo Fill',type:'tamb'}],
[{name:'Bass C',type:'sub'},{name:'Bass D',type:'subd'},{name:'Bass E',type:'sube'},{name:'Bass F',type:'subf'},{name:'Bass G',type:'subg'},{name:'Bass A',type:'suba'},{name:'Bass B',type:'subb'},{name:'Bass C5',type:'subhigh'},{name:'Neo Stab',type:'stab'},{name:'Soul Stab',type:'stab2'},{name:'Piano Hit',type:'piano'},{name:'EP Hit',type:'ep'},{name:'Guitar Hit',type:'pluck'},{name:'Synth Pluck',type:'synthpluck'},{name:'Pad Sweep',type:'pad'},{name:'FX Bell',type:'bell'}]
];
const NR_RATES={'1/4':1,'1/4T':2/3,'1/8':.5,'1/8T':1/3,'1/16':.25,'1/16T':1/6,'1/32':.125,'1/32T':1/12};
/* Stapwaarde: 0 = uit, 1 = standaard (vel 105), 2–127 = velocity, ≥1000 = velocity + toonhoogte */
function encodeStep(vel,tune=0){vel=clamp(Math.round(vel),1,127);tune=clamp(Math.round(tune),-12,12);if(tune===0&&vel===105)return 1;if(tune===0&&vel>1)return vel;return 1000+(tune+12)*128+vel}
function decodeStep(v){if(!v)return null;if(v===1||v===true)return{vel:105,tune:0};if(v>=1000){const n=v-1000;return{vel:clamp(n%128,1,127),tune:Math.floor(n/128)-12}}return{vel:clamp(v|0,1,127),tune:0}}
const swingOffset=(step,sd)=>step%2?sd*(2*state.swing/100-1):0; // MPC-swing: 50% = recht, 66% ≈ triool
const NAME_TO_NOTE=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const noteLabel=n=>NAME_TO_NOTE[n%12]+(Math.floor(n/12)-1);

/* ---------- Status & opslag ---------- */
const fresh=()=>({bpm:100,swing:50,swingMpc:true,stepLength:16,activeBank:0,pattern:0,patterns:Array.from({length:4},()=>({})),patNames:{},names:{},vols:{},pans:{},mutes:{},tunes:{},trims:{},wavFmt:'24-44100',master:85,octave:3,instrument:'piano',velMode:'fixed',daw:'fl',midiRoute:'auto',padCh:9,keyCh:0,padBase:36,clockOut:false,clockFollow:false,songMode:false,songPattern:false,songZoom:28,tfxMode:'filter',tfxCC:{x:null,y:null},plSrc:'p0',plSnap:'beat',recLatency:-1,edZoom:160,edGrid:'1/16',metro:false,full:false,nr:false,nrRate:'1/16',lev:'off',levSrc:null,thRoot:0,thScale:'major',chGroup:'std',chVoicing:'close',chDur:'1/2',chType:'maj7',stepIns:false,kbKeyW:44,kbShowScale:true,kbLock:false,kbChordMode:false,edTool:'draw',edScaleHi:true,edStamp:'c:maj7',edVelLane:true,edRowH:null,edQStr:100,edQEnds:false,edArp:'up',plFull:null,aiTarget:'stream',aiGenre:'balanced'});
function sanitize(src){const f=fresh();src=src||{};let s={...f,...src};
 if(src.swingMpc!==true){s.swing=Math.round(50+clamp(+src.swing||0,0,65)*.325);s.swingMpc=true} // oude 0–65 → MPC 50–75%
 if(s.velMode==='full'){s.velMode='fixed';s.full=true}
 s.swing=clamp(Math.round(+s.swing)||50,50,75);s.full=!!s.full;s.nr=!!s.nr;if(!NR_RATES[s.nrRate])s.nrRate='1/16';
 if(!['off','vel','tune'].includes(s.lev)||!Array.isArray(s.levSrc))s.lev='off';
 if(s.lev==='off')s.levSrc=null;else s.levSrc=[clamp(s.levSrc[0]|0,0,3),clamp(s.levSrc[1]|0,0,15)];
 if(!Array.isArray(s.patterns)||s.patterns.length<1||s.patterns.length>999)s.patterns=f.patterns;if(!s.patNames||typeof s.patNames!=='object'||Array.isArray(s.patNames))s.patNames={};
 s.patterns=s.patterns.map(p=>(p&&typeof p==='object'&&!Array.isArray(p))?p:{});
 for(const k of ['names','vols','pans','mutes','tunes','trims'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))s[k]={};
 s.bpm=clamp(parseInt(s.bpm,10)||100,45,240);s.stepLength=s.stepLength===32?32:16;
 s.activeBank=clamp(s.activeBank|0,0,3);s.pattern=clamp(s.pattern|0,0,s.patterns.length-1);s.master=clamp(+s.master||0,0,100);s.octave=clamp(s.octave|0,0,7);s.thRoot=clamp(s.thRoot|0,0,11);s.edRowH=s.edRowH==null?null:clamp(+s.edRowH||14,8,40);s.edQStr=clamp(+s.edQStr||100,0,100);s.edVelLane=s.edVelLane!==false;if(!/^[cs]:\w+$/.test(s.edStamp||''))s.edStamp='c:maj7';s.kbKeyW=clamp(+s.kbKeyW||44,24,90);for(const k of ['stepIns','kbShowScale','kbLock','kbChordMode','edScaleHi'])s[k]=!!s[k];if(!['std','jazz','key','prog'].includes(s.chGroup))s.chGroup='std';
 if(!INST_IDS.includes(s.instrument)&&!/^u:\w+$/.test(s.instrument))s.instrument='piano';if(!['16-44100','24-44100','24-48000'].includes(s.wavFmt))s.wavFmt='24-44100';if(!['fixed','pos'].includes(s.velMode))s.velMode='fixed';s.metro=!!s.metro;s.songMode=!!s.songMode;s.padCh=clamp(Number(s.padCh??9)|0,0,15);s.keyCh=clamp(Number(s.keyCh??0)|0,0,15);s.padBase=clamp(Number(s.padBase??36)|0,0,64);s.clockOut=!!s.clockOut;s.clockFollow=!!s.clockFollow&&!s.clockOut;s.songPattern=s.songPattern!==false;s.songZoom=clamp(+s.songZoom||28,6,240);if(!['filter','stutter','delay','reverb','gate','lofi','flanger'].includes(s.tfxMode))s.tfxMode='filter';if(!s.tfxCC||typeof s.tfxCC!=='object')s.tfxCC={x:null,y:null};for(const k of ['x','y'])s.tfxCC[k]=Number.isInteger(s.tfxCC[k])&&s.tfxCC[k]>=0&&s.tfxCC[k]<128?s.tfxCC[k]:null;if(!/^(p\d{1,3}|n|a)$/.test(s.plSrc||''))s.plSrc='p0';if(!['bar','beat','1/16','off'].includes(s.plSnap))s.plSnap='beat';s.recLatency=clamp(Math.round(Number(s.recLatency??-1)),-1,400);s.edZoom=clamp(+s.edZoom||160,40,1200);if(!['1/4','1/8','1/8T','1/16','1/16T','1/32','off'].includes(s.edGrid))s.edGrid='1/16';if(!['fl','ableton','logic'].includes(s.daw))s.daw='fl';if(!['auto','pads','keys'].includes(s.midiRoute))s.midiRoute='auto';return s}
let state=fresh();try{const raw=storeGet('mpcts-v2');if(raw)state=sanitize(JSON.parse(raw))}catch(e){state=fresh()}
let saveTimer=null;function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{storeSet('mpcts-v2',JSON.stringify(state));if(typeof songPatternsChanged==='function')songPatternsChanged()},120)}
const slotKey=(b,i)=>`${b}:${i}`;
const sampleBuffers=new Map(),sampleNames=new Map();let db=null;
const nameFor=(b,i)=>state.names[slotKey(b,i)]||sampleNames.get(slotKey(b,i))||SOUNDS[b][i].name;
/* Patronen 1–999 (zoals FL Studio) */
const MAX_PATS=999;
function ensurePattern(i){i=clamp(i|0,0,MAX_PATS-1);while(state.patterns.length<=i)state.patterns.push({});return i}
const patName=i=>(state.patNames&&state.patNames[i])||`Pattern ${i+1}`;
const patHasNotes=i=>Object.values(state.patterns[i]||{}).some(a=>Array.isArray(a)&&a.some(Boolean));
const getPattern=()=>state.patterns[ensurePattern(state.pattern)];
function trackPattern(b,i){const k=slotKey(b,i),p=getPattern();if(!Array.isArray(p[k]))p[k]=Array(32).fill(0);while(p[k].length<32)p[k].push(0);return p[k]}

let selectedPad=0,currentTab='pads',toastTimer=null;

/* ---------- Melding ---------- */
function toast(msg,action=null,ms=3000){const el=$('#toast');el.textContent='';const s=document.createElement('span');s.textContent=msg;el.append(s);
 if(action){const b=document.createElement('button');b.className='btn small primary';b.textContent=action.label;b.onclick=()=>{el.classList.remove('show');action.fn()};el.append(b)}
 el.classList.toggle('actionable',!!action);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),action?Math.max(ms,8000):ms)}

/* ---------- Audio (met iOS-ontgrendeling) ---------- */
let ctx=null,masterNode=null,audioUnlocked=false;
function setAudioSession(){try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}} // iOS 17+: speelt ook met stil-schakelaar aan
function ensureAudio(){
 if(!ctx){setAudioSession();const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast('Deze browser ondersteunt geen Web Audio');return null}
  try{ctx=new AC({latencyHint:'interactive'})}catch(e){ctx=new AC()}
  masterNode=ctx.createGain();masterNode.gain.value=state.master/100;
  const lim=ctx.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=7;lim.ratio.value=7;lim.attack.value=.005;lim.release.value=.12;
  window.legacyLim=lim;const tfxIn=typeof setupTouchFx==='function'?setupTouchFx(ctx,lim):lim;masterNode.connect(typeof setupMasterChain==='function'?setupMasterChain(ctx,tfxIn):tfxIn);lim.connect(ctx.destination);if(typeof syncLegacyLimiter==='function')syncLegacyLimiter()}
 if(ctx.state!=='running')ctx.resume().catch(()=>{});
 return ctx}
function unlockAudio(){if(audioUnlocked&&ctx&&ctx.state==='running')return;const c=ensureAudio();if(!c)return;
 try{const b=c.createBuffer(1,1,22050),s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start(0)}catch(e){}
 if(c.state==='running')audioUnlocked=true}
['pointerdown','touchend','keydown'].forEach(ev=>window.addEventListener(ev,unlockAudio,{capture:true,passive:true}));

const noiseCache=new WeakMap();
function makeNoise(c){let b=noiseCache.get(c);if(b)return b;const n=Math.round(c.sampleRate*2);b=c.createBuffer(1,n,c.sampleRate);const d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;noiseCache.set(c,b);return b}
function env(g,t,a,peak,dec){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0001,peak),t+Math.max(.002,a));g.gain.exponentialRampToValueAtTime(.0001,t+Math.max(a+.015,dec))}
function synthDrum(c,type,t,dest,velocity=1,r=1){const out=c.createGain();out.gain.value=clamp(velocity,0,1.2);out.connect(dest);
 const osc=(wave,start,end,dur,amp=1)=>{start*=r;end*=r;const o=c.createOscillator(),g=c.createGain();o.type=wave;o.frequency.setValueAtTime(Math.max(10,start),t);if(end!==start)o.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+dur);env(g,t,.003,amp,dur);o.connect(g);g.connect(out);o.onended=()=>{o.disconnect();g.disconnect()};o.start(t);o.stop(t+dur+.03)};
 const nz=(dur,amount=1,hp=0,lp=0)=>{hp=hp&&Math.min(18000,hp*r);lp=lp&&Math.min(20000,lp*r);const s=c.createBufferSource(),g=c.createGain();s.buffer=makeNoise(c);let node=s;
  if(hp){const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=hp;node.connect(f);node=f}
  if(lp){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=lp;node.connect(f);node=f}
  env(g,t,.002,amount,dur);node.connect(g);g.connect(out);s.onended=()=>{s.disconnect();node.disconnect();g.disconnect()};s.start(t,Math.random()*1.2);s.stop(t+dur+.02)};
 switch(type){
 case 'kick':osc('sine',145,45,.47,1.15);osc('triangle',320,60,.035,.11);break;
 case 'kick2':osc('sine',105,37,.86,1.25);osc('triangle',220,44,.058,.13);break;
 case 'snare':nz(.18,.85,1000,11000);osc('triangle',184,115,.14,.24);break;
 case 'snare2':nz(.28,.6,1200);osc('triangle',165,92,.17,.2);break;
 case 'clap':nz(.24,.75,950,9000);break;
 case 'hat':case 'tick':nz(type==='tick'?.055:.085,.34,6300);break;
 case 'openhat':nz(.44,.43,5100);break;
 case 'ride':nz(.76,.25,3800);osc('square',1300,1290,.25,.018);break;
 case 'crash':nz(1.38,.49,2400);break;
 case 'shaker':nz(.09,.24,3700);break;
 case 'tamb':nz(.22,.4,3500);osc('square',1900,1800,.1,.034);break;
 case 'rim':case 'clave':case 'block':osc('square',type==='block'?960:1400,620,.065,.18);break;
 case 'cowbell':case 'agogo':osc('square',720,715,.2,.14);osc('square',1050,1047,.16,.10);break;
 case 'tom':osc('sine',195,86,.38,.64);break;
 case 'tomhi':osc('sine',310,150,.29,.51);break;
 case 'conga':osc('sine',355,185,.24,.52);break;
 case 'bongo':osc('sine',260,160,.26,.51);break;
 case 'bongohi':osc('sine',420,280,.18,.46);break;
 case 'perc':osc('triangle',630,290,.14,.33);break;
 case 'snap':nz(.055,.55,1500);break;
 case 'laser':osc('sawtooth',1200,105,.33,.28);break;
 case 'sweep':nz(.88,.28,1900);break;
 case 'sub':case 'subd':case 'sube':case 'subf':case 'subg':case 'suba':case 'subb':case 'subhigh':{
  const fr={sub:130.81,subd:146.83,sube:164.81,subf:174.61,subg:196,suba:220,subb:246.94,subhigh:261.63}[type];osc('sine',fr,fr*.998,.7,.65);break}
 case 'piano':case 'ep':case 'pluck':case 'synthpluck':case 'bell':{
  const f=type==='bell'?783.99:261.63;osc(type==='piano'?'triangle':type==='ep'?'sine':'sawtooth',f,f,.5,.35);osc('sine',f*2,f*2,.3,.12);break}
 case 'stab':case 'stab2':case 'pad':osc('sawtooth',261.63,261.63,type==='pad'?1.4:.52,.13);osc('triangle',329.63,329.63,.5,.18);osc('sine',392,392,.5,.18);break;
 default:osc('sine',440,440,.2,.15)}}
function click(t,accent){const o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.value=accent?1760:1175;env(g,t,.001,accent?.22:.12,.045);o.connect(g);g.connect(masterNode);o.start(t);o.stop(t+.07)}
/* Sample afspelen met trim (start/eind, 0–1) en fade-in/-out (ms) */
function playSample(c,buf,t,dest,vol=1,tune=0,tr=null){const s=c.createBufferSource(),g=c.createGain(),rate=2**(tune/12);s.buffer=buf;s.playbackRate.value=rate;
 const D=buf.duration,st=tr?clamp(+tr.s||0,0,.999):0,en=tr?clamp(+tr.e||1,st+.001,1):1,off=st*D,len=(en-st)*D,real=len/rate;
 const fi=tr?Math.min((+tr.fi||0)/1000,real/2):0,fo=tr?Math.min((+tr.fo||0)/1000||(en<1?.004:0),real/2):0;
 if(fi>0){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+fi)}else g.gain.setValueAtTime(vol,t);
 if(fo>0){g.gain.setValueAtTime(vol,t+real-fo);g.gain.linearRampToValueAtTime(0,t+real)}
 s.connect(g);g.connect(dest);s.onended=()=>{s.disconnect();g.disconnect()};s.start(t,off,len)}
function trackOutput(c,b,i,master){const k=slotKey(b,i),g=c.createGain();g.gain.value=clamp(Number(state.vols[k]??90)/100,0,1.2);let end=g;
 if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=clamp(Number(state.pans[k]??0)/100,-1,1);g.connect(p);end=p}end.connect(master);return g}
function soundAt(c,b,i,t,vel,master,tune=0){const k=slotKey(b,i);if(state.mutes[k])return;const out=trackOutput(c,b,i,master);const s=sampleBuffers.get(k);
 if(s)playSample(c,s,t,out,vel,Number(state.tunes[k]??0)+tune,state.trims[k]);else synthDrum(c,SOUNDS[b][i].type,t,out,vel,2**(tune/12))}

/* ---------- MIDI: Web MIDI (Mac) + netwerk-bridge (Windows) ---------- */
const midi={ws:null,paired:false,wsPort:'',access:null,out:null,in:null};
function midiSend(m){if(typeof midiLed==='function'&&(midi.out||(midi.paired&&midi.wsPort)))midiLed('out');
 if(midi.ws&&midi.ws.readyState===WebSocket.OPEN&&midi.paired&&midi.wsPort){try{midi.ws.send(JSON.stringify(m))}catch(e){}}
 const o=midi.out;if(!o)return;const now=performance.now();
 try{switch(m.type){
  case 'note':{const at=now+(m.delay_ms||0);o.send([0x90|m.channel,m.note,m.velocity],at);o.send([0x80|m.channel,m.note,0],at+(m.duration_ms||100));break}
  case 'noteon':o.send([0x90|m.channel,m.note,clamp(m.velocity|0,1,127)]);break;
  case 'noteoff':o.send([0x80|m.channel,m.note,0]);break;
  case 'cc':o.send([0xB0|m.channel,m.cc,m.value]);break;
  case 'alloff':if(o.clear)o.clear();for(let ch=0;ch<16;ch++){o.send([0xB0|ch,123,0]);o.send([0xB0|ch,120,0])}break}}catch(e){}}
const drumNote=(b,i)=>Math.min(127,state.padBase+b*16+i);
function updateStatus(){const label=$('#status-label'),led=$('#led');
 if(midi.out){label.textContent='Web MIDI · '+midi.out.name;led.classList.add('online')}
 else if(midi.paired&&midi.wsPort){label.textContent='Bridge MIDI · '+midi.wsPort;led.classList.add('online')}
 else{label.textContent=midi.paired?'Bridge gekoppeld · kies MIDI-poort':'Standalone · geluid op dit apparaat';led.classList.remove('online')}}

async function enableWebMIDI(){
 if(!navigator.requestMIDIAccess){toast(IS_IOS?'iPhone/iPad ondersteunen geen Web MIDI — gebruik de bridge of export':'Deze browser ondersteunt geen Web MIDI. Open de app in Chrome of Edge.',null,4500);return}
 try{midi.access=await navigator.requestMIDIAccess({sysex:false});midi.access.onstatechange=fillWebMidiPorts;fillWebMidiPorts();storeSet('mpcts-webmidi','1');toast('Web MIDI actief')}
 catch(e){toast('Web MIDI geweigerd: '+(e.message||e.name))}}
function fillWebMidiPorts(){if(!midi.access)return;const outSel=$('#wm-out'),inSel=$('#wm-in');
 const outs=[...midi.access.outputs.values()],ins=[...midi.access.inputs.values()];
 outSel.innerHTML='';inSel.innerHTML='';
 const add=(sel,v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o)};
 add(outSel,'','Geen (alleen lokaal geluid)');outs.forEach(p=>add(outSel,p.id,p.name));
 add(inSel,'','Geen');ins.forEach(p=>add(inSel,p.id,p.name));
 let outId=midi.out?.id||storeGet('mpcts-wm-out')||'';
 if(!outs.some(p=>p.id===outId)){const m=outs.find(p=>/iac|mpc touch|loopmidi/i.test(p.name));outId=m?m.id:''}
 outSel.value=outId;selectWebOut(outId,true);if(typeof fillSyncIn==='function')fillSyncIn();
 let inId=midi.in?.id||storeGet('mpcts-wm-in')||'';if(!ins.some(p=>p.id===inId))inId='';inSel.value=inId;selectWebIn(inId,true);
 $('#webmidi-btn').textContent=outs.length?'↻ Poorten vernieuwen':'↻ Geen poorten — vernieuwen';
 $('#webmidi-status').textContent=midi.out?'Verbonden met '+midi.out.name:(outs.length?'Web MIDI aan — kies een uitgang':'Web MIDI aan, maar geen poorten. Zet de IAC-driver online.');
 $('#webmidi-status').classList.toggle('ok',!!midi.out)}
function selectWebOut(id,quiet){midi.out=id&&midi.access?midi.access.outputs.get(id)||null:null;
 if(midi.out&&midi.in&&midi.in.name===midi.out.name){selectWebIn('');$('#wm-in').value='';toast('Ingang uitgezet: zelfde poort als uitgang geeft dubbele noten')}
 storeSet('mpcts-wm-out',midi.out?midi.out.id:'');updateStatus();
 $('#webmidi-status').textContent=midi.out?'Verbonden met '+midi.out.name:'Geen uitgang gekozen';$('#webmidi-status').classList.toggle('ok',!!midi.out);
 if(!quiet&&midi.out)toast('MIDI klaar: '+midi.out.name)}
function selectWebIn(id){if(midi.in)midi.in.onmidimessage=null;midi.in=id&&midi.access?midi.access.inputs.get(id)||null:null;
 if(midi.in&&midi.out&&midi.in.name===midi.out.name){midi.in=null;$('#wm-in').value='';toast('Kies een andere poort dan de uitgang');return}
 if(midi.in)midi.in.onmidimessage=onMidiIn;storeSet('mpcts-wm-in',midi.in?midi.in.id:'')}
function onMidiIn(e){const [st,d1,d2]=e.data;if(st>=0xF0)return;if(typeof midiLed==='function')midiLed('in');const cmd=st&0xf0,ch=st&0x0f;
 if(cmd===0xB0){if(typeof tfxMidiCC==='function')tfxMidiCC(ch,d1,d2);return}
 const route=state.midiRoute,toPads=route==='pads'||(route==='auto'&&ch===state.padCh);
 if(cmd===0x90&&d2>0){if(toPads){if(route==='pads'){const idx=((d1-state.padBase)%16+16)%16;nrStop('m'+d1);padDown('m'+d1,idx,state.full?127:d2)}else{const n=d1-state.padBase;if(n>=0&&n<64)triggerPad(n>>4,n&15,d2,null,{midiIn:true})}}else instNoteOn(d1,d2,true)}
 else if(cmd===0x80||(cmd===0x90&&d2===0)){if(toPads)nrStop('m'+d1);else instNoteOff(d1,true)}}

function setConnStatus(msg,ok=false){const el=$('#connection-status');el.textContent=msg;el.classList.toggle('ok',ok);updateStatus()}
function autoURL(){if(location.protocol==='http:'&&location.host)return'ws://'+location.host+'/ws';return storeGet('mpcts-server')||''}
function connect(){const url=$('#server-url').value.trim(),pin=$('#pin').value.trim();
 if(!/^(ws|wss):\/\//i.test(url)){toast('Vul een adres in dat begint met ws://');return}
 if(!/^\d{6}$/.test(pin)){toast('Vul de 6-cijferige koppelcode in');return}
 if(location.protocol==='https:'&&/^ws:/i.test(url))toast('Let op: deze https-pagina mag mogelijk geen ws:// openen. Open de app via het http-adres van de bridge.',null,5000);
 if(midi.ws)midi.ws.close();midi.paired=false;midi.wsPort='';setConnStatus('Verbinden met de bridge...');
 try{const ws=new WebSocket(url);midi.ws=ws;
  ws.onopen=()=>ws.send(JSON.stringify({type:'pair',pin}));
  ws.onmessage=e=>{let d;try{d=JSON.parse(e.data)}catch(x){return}
   if(d.type==='paired'){midi.paired=true;midi.wsFeatures=Array.isArray(d.features)?d.features:[];storeSet('mpcts-server',url);setConnStatus('Gekoppeld — kies een MIDI-uitgang');setPorts(d.ports,d.selected);toast(midi.wsFeatures.length?'Bridge verbonden!':'Windows verbonden!')}
   else if(d.type==='ports')setPorts(d.ports,d.selected);
   else if(d.type==='port_selected'){midi.wsPort=d.name;setConnStatus('Verbonden met '+d.name,true);toast('MIDI klaar: '+d.name)}
   else if(d.type==='error'){setConnStatus(d.message);toast(d.message)}};
  ws.onclose=()=>{if(midi.ws!==ws)return;midi.paired=false;midi.wsPort='';setConnStatus('Verbinding verbroken');$('#midi-output').innerHTML='<option value="">Niet verbonden</option>'};
  ws.onerror=()=>toast('Kan de bridge niet bereiken. Controleer adres, wifi en firewall.')}
 catch(e){toast('Verbinding mislukt: '+e.message)}}
function setPorts(ports,selected){ports=ports||[];const el=$('#midi-output');el.innerHTML='';
 const h=document.createElement('option');h.value='';h.textContent='Kies een MIDI-poort';el.append(h);
 for(const p of ports){const o=document.createElement('option');o.value=p;o.textContent=p;el.append(o)}
 if(selected&&ports.includes(selected)){el.value=selected;midi.wsPort=selected;setConnStatus('Verbonden met '+selected,true)}
 else if(!ports.length){setConnStatus('Gekoppeld, maar geen MIDI-poorten gevonden');toast('Maak eerst een poort met loopMIDI')}
 else{const m=ports.find(x=>x.toLowerCase().includes('mpc touch studio'));if(m){el.value=m;midi.ws.send(JSON.stringify({type:'select_port',name:m}))}}}

/* ---------- Pads ---------- */
let lastHit={b:0,i:0,vel:105};
function flashEl(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),cls==='hit'?120:150)}
function flashPhys(idx,cls='hit'){if(currentTab==='pads')flashEl($(`#pad-grid .pad[data-index="${idx}"]`),cls)}
function flashPad(b,i,cls='hit'){if(state.lev!=='off'||b!==state.activeBank)return;flashPhys(i,cls)}
/* o: {seq, midiIn, tune, flash} */
function triggerPad(b,i,velocity=105,when=null,o={}){
 if(state.mutes[slotKey(b,i)])return;const ac=ensureAudio();if(!ac)return;
 const time=when==null?ac.currentTime:Math.max(when,ac.currentTime),tune=o.tune||0;
 soundAt(ac,b,i,time,velocity/127,o.dest||(typeof liveDrumDest==='function'?liveDrumDest():masterNode),tune);
 if(!o.songPlay&&state.songMode&&recording&&playing)songRecPad(b,i,time,velocity,tune,o.seq);
 if(!o.midiIn)midiSend({type:'note',note:drumNote(b,i),velocity:clamp(Math.round(velocity),1,127),channel:state.padCh,delay_ms:clamp(Math.round((time-ac.currentTime)*1000),0,2000),duration_ms:110});
 if(!o.seq){if(recording&&playing&&!state.songMode)recordHit(b,i,time,velocity,tune);lastHit={b,i,vel:Math.round(velocity),tune};updateLCDPad();if(o.flash!==false)flashPad(b,i)}}
function padVelocity(e,el){
 if(state.full)return 127;
 if(e.pointerType==='pen'&&e.pressure>0)return clamp(Math.round(e.pressure*100+27),20,127);
 if(state.velMode==='pos'){const r=el.getBoundingClientRect();return Math.round(127-clamp((e.clientY-r.top)/r.height,0,1)*90)}
 if(e.pointerType==='touch'&&e.pressure>0&&e.pressure<1&&e.pressure!==.5)return clamp(Math.round(e.pressure*110+25),40,127);
 return 105}
/* 16 Levels: pad 1 = zachtst/laagst, pad 16 = hardst/hoogst */
const levVel=idx=>Math.round(8+idx*119/15);
const levTune=idx=>idx-8;
function padTarget(idx,vel){if(state.lev!=='off'&&state.levSrc){const [b,i]=state.levSrc;return state.lev==='vel'?{b,i,vel:state.full?127:levVel(idx),tune:0}:{b,i,vel,tune:levTune(idx)}}
 return{b:state.activeBank,i:idx,vel,tune:0}}
function playPhysical(idx,vel,time=null){const t=padTarget(idx,vel);triggerPad(t.b,t.i,t.vel,time,{tune:t.tune,flash:false});
 if(time==null||!ctx)flashPhys(idx);else setTimeout(()=>flashPhys(idx),Math.max(0,(time-ctx.currentTime)*1000))}
function selectPhysical(idx){if(state.lev==='off'&&idx!==selectedPad){selectedPad=idx;highlightSelected();updateSelected()}}

/* Note Repeat — herhaalt een vastgehouden pad op het tempo, op het raster als de sequencer loopt */
const repeaters=new Map();let nrTimer=null,barRef=null,gridRef=null;
const nrInterval=()=>60/state.bpm*NR_RATES[state.nrRate];
function nrStart(id,idx,vel){const ac=ensureAudio();if(!ac)return;playPhysical(idx,vel);const now=ac.currentTime,iv=nrInterval();let next=now+iv;
 if(playing&&barRef){next=barRef.t+Math.ceil((now-barRef.t)/iv+1e-6)*iv;if(next-now<iv*.35)next+=iv}
 repeaters.set(id,{idx,vel,next});if(!nrTimer)nrTimer=setInterval(nrTick,20)}
function nrTick(){if(!ctx||!repeaters.size){clearInterval(nrTimer);nrTimer=null;return}const horizon=ctx.currentTime+.1,iv=nrInterval();
 for(const r of repeaters.values()){if(r.next<ctx.currentTime-.2)r.next=ctx.currentTime+.01;while(r.next<horizon){playPhysical(r.idx,r.vel,r.next);r.next+=iv}}}
function nrStop(id){repeaters.delete(id)}
function padDown(id,idx,vel){selectPhysical(idx);if(state.nr)nrStart(id,idx,vel);else playPhysical(idx,vel)}

function buildBanks(){for(const cont of $$('.bank-picks')){cont.innerHTML='';BANKS.forEach((b,i)=>{const btn=document.createElement('button');btn.className='chip'+(i===state.activeBank?' active':'');btn.textContent='BANK '+b;btn.onclick=()=>setBank(i);cont.append(btn)})}}
function setBank(i){state.activeBank=i;buildBanks();drawPads();updateSelected();drawSequencer();drawMixer();save()}
function drawPads(){const root=$('#pad-grid');root.innerHTML='';const lev=state.lev!=='off'&&state.levSrc;
 for(let i=0;i<16;i++){const b=document.createElement('button');const k=slotKey(state.activeBank,i);
  b.className='pad'+(lev?' lev':'')+(!lev&&i===selectedPad?' selected-pad':'');b.type='button';b.dataset.index=i;
  if(lev){const [sb,si]=state.levSrc;b.innerHTML=`<em>${BANKS[state.activeBank]}${String(i+1).padStart(2,'0')}</em><b>${state.lev==='vel'?'VEL '+levVel(i):'TUNE '+(levTune(i)>0?'+':'')+levTune(i)}</b><small></small>`;b.querySelector('small').textContent=nameFor(sb,si)}
  else{b.innerHTML=`<em>${BANKS[state.activeBank]}${String(i+1).padStart(2,'0')}</em>${sampleBuffers.has(k)?'<i class="smp" title="Eigen sample"></i>':''}<b>${i+1}</b><small></small>`;b.querySelector('small').textContent=nameFor(state.activeBank,i)}
  root.append(b)}}
const padGrid=$('#pad-grid');
padGrid.addEventListener('pointerdown',e=>{const el=e.target.closest('.pad');if(!el)return;e.preventDefault();try{el.setPointerCapture(e.pointerId)}catch(x){}
 padDown('p'+e.pointerId,+el.dataset.index,padVelocity(e,el))});
padGrid.addEventListener('pointermove',e=>{const r=repeaters.get('p'+e.pointerId);if(r&&e.pointerType==='pen'&&e.pressure>0&&!state.full)r.vel=clamp(Math.round(e.pressure*100+27),20,127)});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>padGrid.addEventListener(ev,e=>nrStop('p'+e.pointerId)));
padGrid.addEventListener('contextmenu',e=>e.preventDefault());
function highlightSelected(){$$('#pad-grid .pad').forEach(p=>p.classList.toggle('selected-pad',state.lev==='off'&&+p.dataset.index===selectedPad))}
function updateSelected(){if(typeof renderTrim==='function')setTimeout(renderTrim,0);const b=state.activeBank,i=selectedPad,k=slotKey(b,i);$('#selected-badge').textContent=`PAD ${BANKS[b]}${String(i+1).padStart(2,'0')}`;
 $('#sound-type').textContent=sampleBuffers.has(k)?'Eigen sample':SOUNDS[b][i].name;$('#pad-name').value=nameFor(b,i);$('#sample-tune').value=state.tunes[k]??0;$('#tune-val').textContent=$('#sample-tune').value+' semitonen'}
function updateVelUI(){$$('#vel-picks .chip').forEach(c=>c.classList.toggle('active',c.dataset.vel===state.velMode));
 $('#vel-hint').textContent=(state.full?'FULL LEVEL staat aan: elke tik op 127. ':'')+{fixed:'Elke tik op 105.',pos:'Bovenaan de pad = hard, onderaan = zacht.'}[state.velMode]+(IS_IOS&&!IS_IPHONE?' Apple Pencil gebruikt druk.':'')}

/* MPC-knoppen */
function setNR(on){state.nr=on;if(!on)repeaters.clear();updateMPC();save()}
function setFull(on){state.full=on;updateMPC();updateVelUI();save()}
function setLev(mode){if(mode!=='off'){if(state.lev==='off'||!state.levSrc)state.levSrc=[state.activeBank,selectedPad]}else state.levSrc=null;state.lev=mode;drawPads();updateMPC();save();
 if(mode!=='off'){const [b,i]=state.levSrc;toast(`16 Levels (${mode==='vel'?'velocity':'tune'}): ${nameFor(b,i)} op alle pads`)}}
function updateMPC(){$('#nr-btn').classList.toggle('on',state.nr);$('#nr-btn').setAttribute('aria-pressed',state.nr);$('#nr-rate').value=state.nrRate;
 $('#full-btn').classList.toggle('on',state.full);$('#full-btn').setAttribute('aria-pressed',state.full);
 $$('#lev-picks .chip').forEach(c=>c.classList.toggle('active',c.dataset.lev===state.lev));updateLCD()}

/* MPC LCD */
const pad3=n=>String(n).padStart(3,'0'),pad2=n=>String(n).padStart(2,'0');
function lcdNow(step){if(step<0)return'001.01.00';return`${pad3(Math.floor(step/16)+1)}.${pad2(Math.floor(step%16/4)+1)}.${pad2(step%4*24)}`}
function updateLCDPad(){const {b,i,vel,tune}=lastHit;$('#lcd-pad').textContent=BANKS[b]+pad2(i+1);$('#lcd-name').textContent=nameFor(b,i)+(tune?` ${tune>0?'+':''}${tune}st`:'');$('#lcd-vel').textContent=pad3(vel)}
function updateLCD(){$('#lcd-seq').textContent=state.songMode?'SONG      ':`${pad3(state.pattern+1)}-${patName(state.pattern).slice(0,12)}`;$('#lcd-bars').textContent=state.stepLength/16;$('#lcd-bpm').textContent=state.bpm.toFixed(1);$('#lcd-swing').textContent=state.swing+'%';
 const st=$('#lcd-state');st.textContent=playing?(recording?'●REC':'▶PLAY'):paused?'❚❚PAUSE':(recording?'REC RDY':'■STOP');st.classList.toggle('blink',recording&&!playing);
 $('#lcd-nr').textContent=state.nr?state.nrRate:'OFF';$('#lcd-lev').textContent=state.lev==='off'?'OFF':state.lev==='vel'?'VELO':'TUNE';$('#lcd-full').textContent=state.full?'ON':'OFF';updateLCDPad()}

/* ---------- Sequencer & transport ---------- */
let playing=false,paused=false,recording=false,playCounter=0,nextTime=0,schedulerTimer=null,playhead=-1,wakeLock=null;
const visualTimers=new Set(),skipOnce=new Set();
function styleStep(btn,v){const d=decodeStep(v);btn.classList.toggle('on',!!d);btn.setAttribute('aria-pressed',!!d);btn.classList.toggle('tuned',!!(d&&d.tune));
 if(d)btn.style.setProperty('--v',(d.vel/127).toFixed(2));else btn.style.removeProperty('--v');btn.title=d?`Vel ${d.vel}${d.tune?` · ${d.tune>0?'+':''}${d.tune} st`:''}`:''}
/* Patroonkiezer (zoals de FL-werkbalk): ◀ [Pattern n ▾] ▶ ＋ ✎ */
function renderPatternPicker(){for(const cont of $$('.pattern-picks')){cont.innerHTML='';
 const prev=document.createElement('button');prev.className='btn small icon';prev.textContent='◀';prev.title='Vorig patroon';prev.onclick=()=>selectPattern(state.pattern-1);
 const sel=document.createElement('select');sel.className='btn small pat-sel';sel.setAttribute('aria-label','Patroon');
 for(let i=0;i<state.patterns.length;i++){const o=new Option(`${patName(i)}${patHasNotes(i)?'':' (leeg)'}`,i);sel.add(o)}sel.add(new Option('＋ Nieuw patroon','new'));sel.value=state.pattern;
 sel.onchange=()=>{if(sel.value==='new')newPattern();else selectPattern(+sel.value)};
 const next=document.createElement('button');next.className='btn small icon';next.textContent='▶';next.title='Volgend patroon (maakt een nieuw als het laatste)';next.onclick=()=>selectPattern(state.pattern+1);
 const ren=document.createElement('button');ren.className='btn small icon';ren.textContent='✎';ren.title='Naam wijzigen';ren.onclick=()=>renamePattern(cont);
 cont.append(prev,sel,next,ren)}}
function selectPattern(i){if(i<0)return;if(i>=state.patterns.length){newPattern();return}state.pattern=i;renderAll();save()}
function newPattern(){if(state.patterns.length>=MAX_PATS){toast('Maximaal 999 patronen');renderPatternPicker();return}state.patterns.push({});state.pattern=state.patterns.length-1;renderAll();save();toast(`${patName(state.pattern)} gemaakt`,null,1200)}
function renamePattern(cont){const sel=cont.querySelector('select');const inp=document.createElement('input');inp.type='text';inp.maxLength=24;inp.value=patName(state.pattern);inp.className='pat-name-input';
 sel.replaceWith(inp);inp.focus();inp.select();const done=()=>{const v=inp.value.trim();if(v&&v!==`Pattern ${state.pattern+1}`)state.patNames[state.pattern]=v.slice(0,24);else delete state.patNames[state.pattern];save();renderAll()};
 inp.onblur=done;inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=patName(state.pattern);inp.blur()}}}
function drawSequencer(){const table=$('#step-grid');table.innerHTML='';const head=document.createElement('thead'),hr=document.createElement('tr'),stub=document.createElement('th');
 stub.className='track-cell';stub.textContent='TRACK';hr.append(stub);
 for(let s=0;s<state.stepLength;s++){const th=document.createElement('th');th.textContent=s+1;if(s%4===0)th.className='beat';hr.append(th)}head.append(hr);table.append(head);
 const body=document.createElement('tbody');
 for(let i=0;i<16;i++){const tr=document.createElement('tr'),td=document.createElement('td'),k=slotKey(state.activeBank,i);td.className='track-cell';
  const wrap=document.createElement('div');wrap.className='track';
  const led=document.createElement('button');led.className='rack-led'+(state.mutes[k]?'':' on');led.title='Kanaal aan/uit';led.dataset.act='mute';led.dataset.track=i;
  const pan=document.createElement('input');pan.type='range';pan.className='rack-knob';pan.min=-100;pan.max=100;pan.value=state.pans[k]??0;pan.title='Pan';pan.oninput=()=>{state.pans[k]=+pan.value;save()};pan.ondblclick=()=>{pan.value=0;state.pans[k]=0;save()};
  const vol=document.createElement('input');vol.type='range';vol.className='rack-knob';vol.min=0;vol.max=100;vol.value=state.vols[k]??90;vol.title='Volume';vol.oninput=()=>{state.vols[k]=+vol.value;save()};
  const hit=document.createElement('button');hit.className='rack-name';hit.textContent=nameFor(state.activeBank,i);hit.title='Speel / selecteer kanaal';hit.dataset.act='hit';hit.dataset.track=i;
  wrap.append(led,pan,vol,hit);td.append(wrap);tr.append(td);
  const pat=trackPattern(state.activeBank,i);
  for(let s=0;s<state.stepLength;s++){const cell=document.createElement('td'),btn=document.createElement('button');btn.type='button';
   btn.className='step'+(Math.floor(s/4)%2?' alt':'')+(s===playhead?' playing':'');btn.dataset.step=s;btn.dataset.track=i;
   btn.setAttribute('aria-label',`${nameFor(state.activeBank,i)} stap ${s+1}`);styleStep(btn,pat[s]);cell.append(btn);tr.append(cell)}
  body.append(tr)}
 table.append(body)}
$('#step-grid').addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;const i=+btn.dataset.track;
 if(btn.dataset.act==='hit'){triggerPad(state.activeBank,i);selectedPad=i;return}
 if(btn.dataset.act==='mute'){const k=slotKey(state.activeBank,i);state.mutes[k]=!state.mutes[k];btn.classList.toggle('on',!state.mutes[k]);drawMixer();save();return}
 if(btn.classList.contains('step')){const s=+btn.dataset.step,pat=trackPattern(state.activeBank,i);pat[s]=pat[s]?0:1;styleStep(btn,pat[s]);save()}});
function setStepCell(b,i,s){if(b!==state.activeBank)return;const el=$(`#step-grid .step[data-track="${i}"][data-step="${s}"]`);if(el)styleStep(el,trackPattern(b,i)[s])}
function recordHit(b,i,time,vel,tune){if(!gridRef)return;const sd=60/state.bpm/4,abs=gridRef.abs+Math.round((time-gridRef.t)/sd);if(abs<0)return;
 const L=state.stepLength,s=((abs%L)+L)%L;trackPattern(b,i)[s]=encodeStep(vel,tune);if(abs>=playCounter)skipOnce.add(slotKey(b,i)+'@'+abs);setStepCell(b,i,s);save()}
function paintStep(step){playhead=step;$$('#step-grid .step.playing').forEach(x=>x.classList.remove('playing'));if(step>=0)$$(`#step-grid .step[data-step="${step}"]`).forEach(x=>x.classList.add('playing'));$('#lcd-now').textContent=state.songMode?songLcdNow():lcdNow(step)}
function scheduleBeat(abs,t){const step=abs%state.stepLength,sd=60/state.bpm/4,tt=t+swingOffset(step,sd);
 gridRef={abs,t};if(step%16===0)barRef={t};
 if(state.metro&&step%4===0)click(t,step===0);
 const hits=[];if(!state.songMode||state.songPattern)for(const [k,arr] of Object.entries(getPattern())){if(!Array.isArray(arr))continue;const d=decodeStep(arr[step]);if(!d)continue;if(skipOnce.delete(k+'@'+abs))continue;
  const [b,i]=k.split(':').map(Number);if(b>=0&&b<4&&i>=0&&i<16){triggerPad(b,i,d.vel,tt,{seq:true,tune:d.tune});if(b===state.activeBank)hits.push(i)}}
 const id=setTimeout(()=>{visualTimers.delete(id);if(!playing)return;paintStep(step);hits.forEach(i=>flashPad(state.activeBank,i,'seqhit'))},Math.max(0,1000*(t-ctx.currentTime)));visualTimers.add(id)}
function scheduler(){if(!ctx||!playing)return;const sd=60/state.bpm/4;if(nextTime<ctx.currentTime-.25)nextTime=ctx.currentTime+.02;
 while(nextTime<ctx.currentTime+.12){scheduleBeat(playCounter,nextTime);playCounter++;nextTime+=sd}
 if(state.songMode)songSchedule(ctx.currentTime+.12);if(typeof clockSchedule==='function')clockSchedule(ctx.currentTime+.12)}
function clearTimers(){clearInterval(schedulerTimer);schedulerTimer=null;for(const id of visualTimers)clearTimeout(id);visualTimers.clear()}
async function keepAwake(on){try{if(on&&'wakeLock' in navigator&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}else if(!on&&wakeLock){await wakeLock.release();wakeLock=null}}catch(e){}}
function startTransport(){if(playing){pauseTransport();return}const ac=ensureAudio();if(!ac)return;const resumed=paused;
 if(!paused){playCounter=0;if(state.songMode)songRewindForStart()}paused=false;playing=true;skipOnce.clear();gridRef=null;barRef=null;nextTime=ac.currentTime+.06;if(state.songMode)songBegin(nextTime);if(typeof clockStart==='function')clockStart(nextTime,resumed);updateTransport();scheduler();schedulerTimer=setInterval(scheduler,25);keepAwake(true)}
function pauseTransport(){if(state.songMode)songPause();if(typeof clockStop==='function')clockStop();playing=false;paused=true;clearTimers();updateTransport();midiSend({type:'alloff'});keepAwake(false)}
function stopTransport(){if(state.songMode)songStop();if(typeof clockStop==='function')clockStop();playing=false;paused=false;playCounter=0;clearTimers();paintStep(-1);updateTransport();midiSend({type:'alloff'});keepAwake(false)}
function updateTransport(){const p=$('#play');p.innerHTML=playing?'❚❚<span class="lbl"> Pauze</span>':(paused?'▶<span class="lbl"> Verder</span>':'▶<span class="lbl"> Play</span>');p.classList.toggle('good',playing);p.classList.toggle('primary',!playing);
 const r=$('#rec');r.classList.toggle('toggled',recording);r.setAttribute('aria-pressed',recording);
 const m=$('#metro');m.classList.toggle('lit',state.metro);m.setAttribute('aria-pressed',state.metro);
 $('#pattern-indicator').textContent=`${patName(state.pattern).toUpperCase()} · ${state.stepLength} STEPS`;updateLCD()}
function setBpm(v){if(state.songMode)songReanchor();state.bpm=clamp(Math.round(v)||100,45,240);if(typeof updateBuses==='function')updateBuses();if(typeof clockTempo==='function')clockTempo();$('#bpm').value=state.bpm;updateLCD();save()}
let taps=[];function tapTempo(){const now=performance.now();taps=taps.filter(t=>now-t<2200);taps.push(now);if(taps.length>=2){setBpm(60000/((taps[taps.length-1]-taps[0])/(taps.length-1)));toast('Tempo '+state.bpm+' BPM',null,1200)}}
function toggleRec(){recording=!recording;if(state.songMode&&playing)songRecToggled();updateTransport();toast(recording?(playing?'Opname aan — tik op pads':'Opname aan — druk op Play en tik op pads'):'Opname uit')}
function toggleMetro(){state.metro=!state.metro;updateTransport();save()}

/* ---------- Klavier ---------- */
const activeSynth=new Map();
/* Eén synth-stem; werkt live én offline (WAV-export). release(t) mag in de toekomst liggen. */
function makeVoice(c,dest,note,vel,at,inst){if(typeof inst==='string'&&inst.startsWith('u:')){const v=makeSamplerVoice(c,dest,note,vel,at,inst);if(v)return v;inst='piano'}if(SYNTH_PRESETS[inst])return presetVoice(c,dest,note,vel,at,SYNTH_PRESETS[inst]);const f=440*2**((note-69)/12);
 const out=c.createGain();out.gain.value=0;
 const filt=c.createBiquadFilter();filt.type='lowpass';filt.frequency.value=inst==='bass'?900:inst==='synth'?3200:inst==='guitar'?2600:5200;filt.Q.value=inst==='synth'?4:.7;
 out.connect(filt);filt.connect(dest);
 const osc=c.createOscillator(),osc2=c.createOscillator(),mix=c.createGain();
 osc.type=inst==='bass'||inst==='synth'?'sawtooth':'triangle';osc2.type=inst==='piano'?'sine':'triangle';
 osc.frequency.value=inst==='bass'?f/2:f;osc2.frequency.value=inst==='bass'?f:f*2;if(inst==='synth')osc2.detune.value=9;
 mix.gain.value=inst==='synth'?.45:.1;osc.connect(out);osc2.connect(mix);mix.connect(out);
 const loud=clamp(vel/127,0,1)*.22,g=out.gain;g.setValueAtTime(0,at);g.linearRampToValueAtTime(loud,at+.006);
 if(inst==='piano'||inst==='guitar')g.setTargetAtTime(loud*.04,at+.006,inst==='guitar'?.12:.32);else g.setTargetAtTime(loud*.65,at+.006,.25);
 osc.onended=()=>{osc.disconnect();osc2.disconnect();mix.disconnect();out.disconnect();filt.disconnect()};osc.start(at);osc2.start(at);let stopped=false;
 return{release(t){if(stopped)return;stopped=true;t=Math.max(t,at+.01);g.cancelScheduledValues(t);g.setTargetAtTime(0,t,.05);try{osc.stop(t+.4);osc2.stop(t+.4)}catch(e){}}}}
function liveInstTarget(){const tr=typeof recInstTrack==='function'?recInstTrack():null;
 return tr?{inst:tr.inst,dest:liveTrackOut(tr),ch:trackChannel(tr)}:{inst:state.instrument,dest:masterNode,ch:state.keyCh}}
function instNoteOn(note,vel=104,fromIn=false){const ac=ensureAudio();if(!ac)return;if(activeSynth.has(note))instNoteOff(note,true);
 const tg=liveInstTarget(),voice=makeVoice(ac,tg.dest,note,vel,ac.currentTime+.003,tg.inst);activeSynth.set(note,{voice,ch:tg.ch});
 if(!fromIn)midiSend({type:'noteon',note,velocity:clamp(vel|0,1,127),channel:tg.ch});
 if(typeof songNoteOn==='function')songNoteOn(note,vel);
 $('#note-readout').textContent=noteLabel(note);const k=$(`#keyboard [data-note="${note}"]`);if(k)k.classList.add('held')}
function instNoteOff(note,fromIn=false){const v=activeSynth.get(note);let ch=0;if(v){v.voice.release(ctx.currentTime);ch=v.ch;activeSynth.delete(note)}
 if(typeof songNoteOff==='function')songNoteOff(note);
 if(!fromIn)midiSend({type:'noteoff',note,channel:ch});
 if(!kbHeldNotes().has(note)){const k=$(`#keyboard [data-note="${note}"]`);if(k)k.classList.remove('held')}}
const kbPointers=new Map(),kbKeysDown=new Map();
const kbHeldNotes=()=>new Set([...[...kbPointers.values()].map(p=>p.note),...kbKeysDown.values()].filter(n=>n!=null&&activeSynth.has(n)));
let kbFirst=48,kbLast=72;

/* ---------- Mixer ---------- */
function drawMixer(){if(typeof renderMixer==='function')renderMixer()}
/* ---------- Samples (IndexedDB) ---------- */
function openDB(){return new Promise((res,rej)=>{if(!window.indexedDB){rej(Error('indexedDB ontbreekt'));return}const r=indexedDB.open('MPC_Touch_Studio_Samples_v1',2);
 r.onupgradeneeded=()=>{for(const n of ['samples','kv'])if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbWrite(k,v){if(!db)return Promise.resolve();return new Promise((res,rej)=>{const tx=db.transaction('samples','readwrite');tx.objectStore('samples').put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function kvSet(k,v){if(!db)return Promise.resolve(false);return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error)})}
function kvGet(k){if(!db)return Promise.resolve(null);return new Promise((res,rej)=>{const tx=db.transaction('kv','readonly'),q=tx.objectStore('kv').get(k);q.onsuccess=()=>res(q.result??null);q.onerror=()=>rej(q.error)})}
function dbDelete(k){if(!db)return Promise.resolve();return new Promise((res,rej)=>{const tx=db.transaction('samples','readwrite');tx.objectStore('samples').delete(k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function decode(ac,bytes){return new Promise((res,rej)=>{const p=ac.decodeAudioData(bytes,res,rej);if(p&&p.then)p.then(res,rej)})}
async function loadSamples(){try{db=await openDB();const recs=await new Promise((res,rej)=>{const tx=db.transaction('samples','readonly'),st=tx.objectStore('samples'),out=[];
  const cur=st.openCursor();cur.onsuccess=()=>{const c=cur.result;if(c){out.push([c.key,c.value]);c.continue()}else res(out)};cur.onerror=()=>rej(cur.error)});
 if(!recs.length){await loadSong();return}const ac=ensureAudio();if(!ac)return;
 for(const [k,item] of recs){if(String(k).startsWith('clip:')){await loadClipRecord(k,item);continue}if(String(k).startsWith('kv:'))continue;if(String(k).startsWith('uinst:')){await loadUserInstRecord(k,item);continue}try{sampleBuffers.set(k,await decode(ac,item.bytes.slice(0)));sampleNames.set(k,item.name)}catch(e){console.warn('Kon sample niet laden:',k,e)}}
 drawPads();updateSelected();drawMixer();drawSequencer();await loadSong()}catch(e){console.warn('Samples alleen in deze sessie:',e);loadSong()}}
async function loadSampleInto(b,i,file){if(file.size>25*1024*1024)throw Error('groter dan 25 MB');const k=slotKey(b,i),ac=ensureAudio(),bytes=await file.arrayBuffer();
 sampleBuffers.set(k,await decode(ac,bytes.slice(0)));const name=file.name.replace(/\.[^.]+$/,'').slice(0,18);sampleNames.set(k,name);state.names[k]=name;delete state.trims[k];
 try{await dbWrite(k,{bytes,name})}catch(e){}return name}
async function uploadSample(file){if(!file)return;try{const name=await loadSampleInto(state.activeBank,selectedPad,file);drawPads();updateSelected();drawSequencer();drawMixer();save();toast('Sample geladen: '+name)}
 catch(e){toast('Kon dit audiobestand niet openen'+(e&&e.message?': '+e.message:''))}}
/* Hele kit: bestanden op naam gesorteerd naar pad 1, 2, 3 … (en door naar de volgende bank) */
async function loadKit(files,startB=state.activeBank,startI=0){files=[...files].filter(f=>/^audio\//.test(f.type)||/\.(wav|mp3|ogg|flac|m4a|aif|aiff|caf)$/i.test(f.name)).sort((x,y)=>x.name.localeCompare(y.name,undefined,{numeric:true,sensitivity:'base'}));
 if(!files.length){toast('Geen audiobestanden gevonden');return}let slot=startB*16+startI,ok=0,fail=0;const max=64-slot;if(files.length>max)toast(`Alleen de eerste ${max} bestanden passen`);
 toast(`Kit laden: ${Math.min(files.length,max)} samples...`,null,8000);
 for(const f of files.slice(0,max)){try{await loadSampleInto(slot>>4,slot&15,f);ok++}catch(e){fail++}slot++}
 drawPads();updateSelected();drawSequencer();drawMixer();save();toast(`Kit geladen: ${ok} samples op ${BANKS[startB]}${String(startI+1).padStart(2,'0')}${ok>1?' en verder':''}${fail?` · ${fail} mislukt`:''}`,null,4000)}

/* ---------- Export & projecten ---------- */
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
/* In een gedeelde claude.ai-pagina: opslaan via het platform (wav/mid worden in een .zip verpakt) */
let dlNs;async function getDownloads(){if(!(window.claude&&typeof window.claude.use==='function'))return null;if(dlNs===undefined){try{dlNs=await window.claude.use('downloads')}catch(e){dlNs=null}}return dlNs}
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC_T[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
async function makeZip(name,blob){const data=new Uint8Array(await blob.arrayBuffer()),fn=new TextEncoder().encode(name),crc=crc32(data),sz=data.length;
 const d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xffff,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xffff;
 const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(10,dt,true);lh.setUint16(12,dd,true);lh.setUint32(14,crc,true);lh.setUint32(18,sz,true);lh.setUint32(22,sz,true);lh.setUint16(26,fn.length,true);
 const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(12,dt,true);ch.setUint16(14,dd,true);ch.setUint32(16,crc,true);ch.setUint32(20,sz,true);ch.setUint32(24,sz,true);ch.setUint16(28,fn.length,true);
 const cdOff=30+fn.length+sz,cdSize=46+fn.length,end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,1,true);end.setUint16(10,1,true);end.setUint32(12,cdSize,true);end.setUint32(16,cdOff,true);
 return new Blob([lh.buffer,fn,data,ch.buffer,fn,end.buffer],{type:'application/zip'})}
async function deliver(blob,name){if(isNativeApp())return deliverNative(blob,name);const dl=await getDownloads();
 if(dl){let fname=name,data=blob;if(!/\.(json|txt|csv|zip)$/i.test(name)){data=await makeZip(name,blob);fname=name.replace(/\.[^.]+$/,'')+'.zip'}
  try{await dl.save({filename:fname,data});return true}catch(e){if(e&&e.code==='declined')return false;toast('Opslaan lukte niet'+(e&&e.message?': '+e.message:''));return false}}
 let file=null;try{file=new File([blob],name,{type:blob.type||'application/octet-stream'})}catch(e){}
 if(IS_IOS&&file&&navigator.canShare&&navigator.canShare({files:[file]})){
  try{await navigator.share({files:[file]});return true}catch(e){if(e&&e.name==='AbortError')return false;
   toast(name+' is klaar',{label:'Delen / bewaren',fn:()=>navigator.share({files:[file]}).catch(()=>download(blob,name))});return false}}
 download(blob,name);return true}
function toVLQ(v){let n=Math.max(0,v|0);const a=[n&0x7f];while((n>>=7)>0)a.unshift((n&0x7f)|0x80);return a}
function makeMIDI(){const ppq=480,stepTicks=120,ev=[];
 for(const [k,seq] of Object.entries(getPattern())){const [b,i]=k.split(':').map(Number);if(b<0||b>3||i<0||i>15||!Array.isArray(seq)||state.mutes[k])continue;
  for(let s=0;s<state.stepLength;s++){const d=decodeStep(seq[s]);if(!d)continue;const at=s*stepTicks+Math.round(swingOffset(s,stepTicks)),n=drumNote(b,i);
   ev.push({time:at,bytes:[0x90|state.padCh,n,d.vel],order:1});ev.push({time:at+70,bytes:[0x80|state.padCh,n,0],order:0})}}
 ev.sort((a,b)=>a.time-b.time||a.order-b.order);const tempo=Math.round(60000000/state.bpm);
 const name=[...`MPC Touch ${patName(state.pattern)}`.replace(/[^\x20-\x7e]/g,'')].map(c=>c.charCodeAt(0));
 const tr=[0,0xff,0x03,name.length,...name,0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,0xff,0x58,4,4,2,24,8];let prev=0;
 for(const e of ev){tr.push(...toVLQ(e.time-prev),...e.bytes);prev=e.time}
 tr.push(...toVLQ(Math.max(0,state.stepLength*stepTicks-prev)),0xff,0x2f,0);
 const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
 return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,(ppq>>8)&255,ppq&255,77,84,114,107,...u32(tr.length),...tr])}
function encodeWAV(buf,bits=16){const ch=buf.numberOfChannels,len=buf.length,B=bits===24?3:2,bpf=ch*B,view=new DataView(new ArrayBuffer(44+len*bpf));const w=(p,s)=>{for(let i=0;i<s.length;i++)view.setUint8(p+i,s.charCodeAt(i))};
 w(0,'RIFF');view.setUint32(4,36+len*bpf,true);w(8,'WAVE');w(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,ch,true);view.setUint32(24,buf.sampleRate,true);
 view.setUint32(28,buf.sampleRate*bpf,true);view.setUint16(32,bpf,true);view.setUint16(34,bits,true);w(36,'data');view.setUint32(40,len*bpf,true);
 let o=44;const d=Array.from({length:ch},(_,i)=>buf.getChannelData(i));
 if(B===2){for(let i=0;i<len;i++)for(let c=0;c<ch;c++){const s=clamp(d[c][i],-1,1);view.setInt16(o,s<0?s*0x8000:s*0x7fff,true);o+=2}}
 else for(let i=0;i<len;i++)for(let c=0;c<ch;c++){const s=clamp(d[c][i],-1,1);let v=Math.round(s<0?s*0x800000:s*0x7fffff);if(v<0)v+=0x1000000;view.setUint8(o,v&255);view.setUint8(o+1,(v>>8)&255);view.setUint8(o+2,(v>>16)&255);o+=3}
 return new Blob([view.buffer],{type:'audio/wav'})}
const wavFmt=()=>{const [b,r]=state.wavFmt.split('-').map(Number);return{bits:b,rate:r}};
function renderOffline(off){return new Promise((res,rej)=>{off.oncomplete=e=>res(e.renderedBuffer);const p=off.startRendering();if(p&&p.then)p.then(res,rej)})}
async function exportWAV(){const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!OAC){toast('WAV-export wordt niet ondersteund in deze browser');return}
 const btn=$('#export-wav');btn.disabled=true;btn.textContent='WAV renderen...';
 try{const dur=state.stepLength*60/state.bpm/4,rate=wavFmt().rate,off=new OAC(2,Math.ceil((dur*2+1.5)*rate),rate);const vol=off.createGain();vol.gain.value=state.master/100;vol.connect(off.destination);
  for(let rep=0;rep<2;rep++)for(const [k,seq] of Object.entries(getPattern())){const [b,i]=k.split(':').map(Number);if(b<0||b>3||i<0||i>15||!Array.isArray(seq))continue;
   for(let s=0;s<state.stepLength;s++){const d=decodeStep(seq[s]);if(!d)continue;const sd=60/state.bpm/4;soundAt(off,b,i,.01+rep*dur+s*sd+swingOffset(s,sd),d.vel/127,vol,d.tune)}}
  const rendered=await renderOffline(off);if(await deliver(encodeWAV(rendered,wavFmt().bits),`MPC_Touch_${patName(state.pattern).replace(/\W+/g,'_')}_${state.bpm}bpm.wav`))toast('WAV geëxporteerd')}
 catch(e){console.error(e);toast('WAV-export mislukt: '+(e.message||e))}finally{btn.disabled=false;btn.textContent='↓ Exporteer WAV'}}

/* ---------- Tabs & weergave ---------- */
function setTab(name){currentTab=name;document.body.dataset.tab=name;if(typeof plFullApply==='function')setTimeout(plFullApply,0);$$('.tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===name));$$('.page').forEach(el=>el.classList.toggle('active',el.id==='view-'+name));
 if(name==='sequence')drawSequencer();if(name==='keys')drawKeyboard();if(name==='mixer')drawMixer();if(name==='pads'){drawPads();setTimeout(()=>{if(typeof renderTrim==='function')renderTrim()},0)}if(name==='song')drawSongUI();
 if(window.matchMedia('(max-width:720px)').matches)window.scrollTo({top:0})}
function renderAll(){buildBanks();drawPads();updateSelected();drawSequencer();drawMixer();updateTransport();updateVelUI();
 $('#bpm').value=state.bpm;$('#swing').value=state.swing;$('#swing-val').textContent=state.swing+'%';$('#step-length').value=state.stepLength;
 renderPatternPicker();
 renderInstChips();if(typeof renderTheory==='function')renderTheory();drawKeyboard();updateMPC();renderDAW();updateModeUI()}

/* ---------- Bediening ---------- */
$$('.tab').forEach(el=>el.onclick=()=>setTab(el.dataset.tab));
$('#play').onclick=startTransport;$('#stop').onclick=stopTransport;$('#rec').onclick=toggleRec;$('#metro').onclick=toggleMetro;$('#tap').onclick=tapTempo;
$('#bpm').onchange=e=>setBpm(parseInt(e.target.value,10));$('#bpm').onkeydown=e=>{if(e.key==='Enter')e.target.blur()};
$('#bpm-down').onclick=e=>setBpm(state.bpm-(e.shiftKey?10:1));$('#bpm-up').onclick=e=>setBpm(state.bpm+(e.shiftKey?10:1));
$('#swing').oninput=e=>{state.swing=+e.target.value;$('#swing-val').textContent=state.swing+'%';updateLCD();save()};
$('#nr-btn').onclick=()=>setNR(!state.nr);$('#nr-rate').onchange=e=>{state.nrRate=e.target.value;updateMPC();save()};
$('#full-btn').onclick=()=>setFull(!state.full);$$('#lev-picks .chip').forEach(c=>c.onclick=()=>setLev(c.dataset.lev));
$$('#vel-picks .chip').forEach(c=>c.onclick=()=>{state.velMode=c.dataset.vel;updateVelUI();save()});
$('#pad-name').onchange=e=>{state.names[slotKey(state.activeBank,selectedPad)]=e.target.value.trim().slice(0,18)||SOUNDS[state.activeBank][selectedPad].name;drawPads();drawSequencer();drawMixer();save()};
$('#pad-name').onkeydown=e=>{if(e.key==='Enter')e.target.blur()};
$('#sample-file').onchange=async e=>{await uploadSample(e.target.files?.[0]);e.target.value=''};
$('#sample-tune').oninput=e=>{state.tunes[slotKey(state.activeBank,selectedPad)]=+e.target.value;$('#tune-val').textContent=e.target.value+' semitonen';save()};
$('#remove-sample').onclick=async()=>{const k=slotKey(state.activeBank,selectedPad);sampleBuffers.delete(k);sampleNames.delete(k);delete state.names[k];delete state.tunes[k];delete state.trims[k];try{await dbDelete(k)}catch(e){}drawPads();updateSelected();drawSequencer();drawMixer();save();toast('Ingebouwd geluid hersteld')};
$('#audition').onclick=()=>triggerPad(state.activeBank,selectedPad);
$('#step-length').onchange=e=>{state.stepLength=+e.target.value;stopTransport();drawSequencer();updateTransport();save()};
let clearArmed=0;$('#clear-pattern').onclick=e=>{const b=e.currentTarget,now=Date.now();
 if(now-clearArmed>2500){clearArmed=now;b.textContent='Nogmaals = wissen';b.classList.add('toggled');setTimeout(()=>{if(Date.now()-clearArmed>=2450){b.textContent='Wissen';b.classList.remove('toggled')}},2500);return}
 clearArmed=0;b.textContent='Wissen';b.classList.remove('toggled');state.patterns[state.pattern]={};drawSequencer();save();toast(patName(state.pattern)+' gewist')};
$('#random-hats').onclick=()=>{const a=trackPattern(state.activeBank,2);for(let i=0;i<state.stepLength;i++)a[i]=i%2===0?1:Math.random()>.55?encodeStep(64+Math.round(Math.random()*24)):0;drawSequencer();save()};
$('#copy-pattern').onclick=()=>{if(state.patterns.length>=MAX_PATS){toast('Maximaal 999 patronen');return}const from=state.pattern;state.patterns.push(JSON.parse(JSON.stringify(getPattern())));state.pattern=state.patterns.length-1;state.patNames[state.pattern]=patName(from)+' kopie';renderAll();save();toast(`${patName(from)} gekloond naar ${patName(state.pattern)}`)};
$('#export-midi').onclick=async()=>{if(await deliver(new Blob([makeMIDI()],{type:'audio/midi'}),`MPC_Touch_${patName(state.pattern).replace(/\W+/g,'_')}_${state.bpm}bpm.mid`))toast('MIDI-bestand geëxporteerd')};
$('#export-wav').onclick=exportWAV;
$('#save-project').onclick=()=>deliver(new Blob([JSON.stringify({format:'MPC Touch Studio Project v2',state,song})],{type:'application/json'}),'MPC_Touch_Project.json');
$('#load-project').onchange=async e=>{try{const f=e.target.files?.[0];if(!f)return;const data=JSON.parse(await f.text());
 if(data.format!=='MPC Touch Studio Project v2'||!Array.isArray(data.state?.patterns)||!data.state.patterns.length)throw Error('Ongeldig project');
 stopTransport();state=sanitize(data.state);if(data.song)setSong(data.song);selectedPad=0;renderAll();save();toast('Project geladen (eigen samples blijven per apparaat)')}catch(x){toast('Project openen mislukt: '+x.message)}e.target.value=''};


$('#connect-btn').onclick=connect;
$('#disconnect-btn').onclick=()=>{const ws=midi.ws;midi.ws=null;if(ws)ws.close();midi.paired=false;midi.wsPort='';setConnStatus('Verbinding handmatig verbroken');$('#midi-output').innerHTML='<option value="">Niet verbonden</option>'};
$('#midi-output').onchange=e=>{if(!midi.paired||!midi.ws)return;midi.wsPort='';setConnStatus('MIDI-poort openen...');if(e.target.value)midi.ws.send(JSON.stringify({type:'select_port',name:e.target.value}))};
$('#refresh-ports').onclick=()=>{if(midi.paired&&midi.ws)midi.ws.send(JSON.stringify({type:'ports'}));else toast('Koppel eerst de bridge')};
$$('.panic').forEach(b=>b.onclick=()=>{midiSend({type:'alloff'});[...activeSynth.keys()].forEach(n=>instNoteOff(n,true));toast('Alle MIDI-noten uit')});
const DAW={
 fl:{name:'FL Studio',mac:[['3. FL Studio','Options → MIDI Settings → Input: IAC-driver Bus 1 → Enable'],['4. Spelen','Selecteer een kanaal in de Channel Rack; voor drums laad je FPC of gebruik je een eigen drumkit'],['Mixer','Rechtsklik op een knop → Link to controller → beweeg een fader in de app']],bridge:'F10 → MIDI → Input → poort “MPC Touch Studio” → Enable'},
 ableton:{name:'Ableton Live',mac:[['3. Ableton','Live → Settings → Link, Tempo & MIDI → bij MIDI-poort In: IAC-driver Bus 1 → zet Track en Remote aan'],['4. Spelen','Maak een MIDI-track, zet MIDI From op “All Ins” of de IAC-driver en arm de track (of Monitor op In)'],['Drums','Zet een Drum Rack op de track: pad 1–16 van de app = de 16 pads van de rack (C1–D♯2)'],['Mixer','Druk ⌘M (MIDI Map), klik een knop in Live en beweeg een fader in de app']],bridge:'Options → Preferences → Link, Tempo & MIDI → poort “MPC Touch Studio”: zet Track en Remote aan'},
 logic:{name:'Logic Pro',mac:[['3. Logic','Logic ontvangt alle MIDI-ingangen automatisch, dus ook de IAC-driver; niets in te stellen'],['4. Spelen','Selecteer een Software Instrument-track; die speelt mee zodra je in de app speelt (arm hem om op te nemen)'],['Drums','Gebruik Drum Machine Designer of een Drummer-kit: pad 1–16 = C1–D♯2'],['Mixer','Klik een knop in Logic, druk ⌘L (Learn Assignment) en beweeg een fader in de app']],bridge:'Logic Pro bestaat alleen voor de Mac. Gebruik op je Mac de Web MIDI-verbinding hiernaast.'}};
function renderDAW(){const d=DAW[state.daw];$$('#daw-picks .chip').forEach(c=>c.classList.toggle('active',c.dataset.daw===state.daw));$$('.daw-name').forEach(e=>e.textContent=d.name);
 const box=$('#daw-steps');box.innerHTML='';for(const [k,v] of d.mac){const r=document.createElement('div');r.className='stat';const a=document.createElement('strong'),b=document.createElement('span');a.textContent=k;b.textContent=v;r.append(a,b);box.append(r)}
 $('#bridge-daw-step').textContent=d.bridge;$('#wm-route').value=state.midiRoute}
$$('#daw-picks .chip').forEach(c=>c.onclick=()=>{state.daw=c.dataset.daw;renderDAW();save()});
$('#wm-route').onchange=e=>{state.midiRoute=e.target.value;save()};
$('#webmidi-btn').onclick=()=>{if(midi.access)fillWebMidiPorts();else enableWebMIDI()};
$('#wm-out').onchange=e=>selectWebOut(e.target.value);$('#wm-in').onchange=e=>selectWebIn(e.target.value);
$('#server-url').value=autoURL();

/* Mac-toetsenbord */
const PAD_KEYS={Digit1:0,Digit2:1,Digit3:2,Digit4:3,KeyQ:4,KeyW:5,KeyE:6,KeyR:7,KeyA:8,KeyS:9,KeyD:10,KeyF:11,KeyZ:12,KeyX:13,KeyC:14,KeyV:15};
const PIANO_KEYS={KeyA:0,KeyW:1,KeyS:2,KeyE:3,KeyD:4,KeyF:5,KeyT:6,KeyG:7,KeyY:8,KeyH:9,KeyU:10,KeyJ:11,KeyK:12,KeyO:13,KeyL:14,KeyP:15,Semicolon:16};
window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target;if(t&&t.closest&&t.closest('input:not([type=range]),select,textarea'))return;
 if(e.code==='Space'){e.preventDefault();if(!e.repeat)startTransport();return}
 if(e.code==='Escape'){stopTransport();return}
 if(e.repeat)return;
 if(e.shiftKey){if(e.code==='KeyR'){toggleRec();return}if(e.code==='KeyM'){toggleMetro();return}if(e.code==='KeyN'){setNR(!state.nr);return}if(e.code==='KeyF'){setFull(!state.full);return}if(e.code==='KeyL'){setLev({off:'vel',vel:'tune',tune:'off'}[state.lev]);return}const m=/^Digit([1-4])$/.exec(e.code);if(m){setBank(+m[1]-1);return}return}
 if(currentTab==='keys'){if(e.code==='KeyZ'){shiftOctave(-1);return}if(e.code==='KeyX'){shiftOctave(1);return}
  if(e.code in PIANO_KEYS){e.preventDefault();const n=kbFirst+PIANO_KEYS[e.code];kbKeysDown.set(e.code,n);instNoteOn(n,state.full?127:105)}return}
 if(e.code in PAD_KEYS){e.preventDefault();padDown('k'+e.code,PAD_KEYS[e.code],state.full?127:105)}});
window.addEventListener('keyup',e=>{nrStop('k'+e.code);const n=kbKeysDown.get(e.code);if(n!=null){kbKeysDown.delete(e.code);if(!kbHeldNotes().has(n))instNoteOff(n)}});
window.addEventListener('blur',()=>{repeaters.clear();for(const [c,n] of kbKeysDown){kbKeysDown.delete(c);instNoteOff(n)}});

/* iOS: geen zoom-gebaren, audio hervatten na onderbreking */
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
document.addEventListener('dblclick',e=>{if(!e.target.closest('input,select,textarea'))e.preventDefault()},{passive:false});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(ctx&&ctx.state!=='running')ctx.resume().catch(()=>{});if(playing)keepAwake(true)}});
window.addEventListener('pagehide',()=>{stopTransport();[...activeSynth.keys()].forEach(n=>instNoteOff(n))});
let rsz=null;window.addEventListener('resize',()=>{clearTimeout(rsz);rsz=setTimeout(()=>{if(currentTab==='keys')drawKeyboard()},150)});
const tp=$('#transport');if('IntersectionObserver' in window){const s=document.createElement('div');tp.before(s);new IntersectionObserver(([en])=>tp.classList.toggle('stuck',!en.isIntersecting)).observe(s)}

/* Apparaat-specifiek: aanbevolen verbinding markeren */
(function(){const card=IS_MAC?'#card-mac':IS_IOS?'#card-ios':'#card-bridge';$(card).classList.add('recommended');
 if(IS_IOS){$('#card-ios').parentNode.prepend($('#card-ios'))}
 if(IS_MAC&&navigator.requestMIDIAccess&&storeGet('mpcts-webmidi')==='1')enableWebMIDI()})();




/* ---------- Android-app (Capacitor): opslaan in Documenten/MPC Touch Studio + Android-deelmenu ---------- */
function isNativeApp(){try{return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform())}catch(e){return false}}
async function blobToB64Chunks(blob,size=3*1024*1024){const out=[];for(let o=0;o<blob.size;o+=size){const ab=await blob.slice(o,o+size).arrayBuffer(),u=new Uint8Array(ab);let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));out.push(btoa(s))}return out}
async function deliverNative(blob,name){const P=Capacitor.Plugins||{},FS=P.Filesystem,SH=P.Share;if(!FS){toast('Opslaan is niet beschikbaar in deze app-versie');return false}
 try{toast('Opslaan…',null,1500);const parts=await blobToB64Chunks(blob),write=async(dir,path)=>{await FS.writeFile({path,data:parts[0]||'',directory:dir,recursive:true});for(let i=1;i<parts.length;i++)await FS.appendFile({path,data:parts[i],directory:dir});return(await FS.getUri({path,directory:dir})).uri};
  let saved=null;try{saved=await write('DOCUMENTS','MPC Touch Studio/'+name)}catch(e){console.warn('Documents',e)}
  const uri=await write('CACHE',name),share=()=>SH&&SH.share({title:name,files:[uri],dialogTitle:'Bewaar of deel '+name}).catch(()=>{});
  toast(saved?`${name} staat in Documenten › MPC Touch Studio`:`${name} is klaar`,SH?{label:'Delen…',fn:share}:null,7000);if(!saved)share();return true}
 catch(e){toast('Opslaan mislukt: '+(e.message||e));return false}}
