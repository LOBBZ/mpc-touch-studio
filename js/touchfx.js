'use strict';
/* =====================================================================
   Touch FX — XY-vlak zoals op de MPC: effecten op de master met je vinger.
   Werkt met touch (telefoon/tablet/touch-laptop), muis/trackpad en via
   MIDI-learn met knoppen van een controller (bijv. Q-Links van een MPC).
   Effecten: Filter, Stutter, Delay, Space (reverb), Gate, Lo-Fi, Flanger.
   ===================================================================== */
const TFX_MODES={
 filter:{name:'Filter',x:'Cutoff ◂ LP · HP ▸',y:'Resonantie'},
 stutter:{name:'Stutter',x:'Lengte 1/4 → 1/64',y:'Herhaling'},
 delay:{name:'Delay',x:'Tijd',y:'Feedback'},
 reverb:{name:'Space',x:'Hoeveelheid',y:'Helderheid'},
 gate:{name:'Gate',x:'Snelheid',y:'Diepte'},
 lofi:{name:'Lo-Fi',x:'Toon',y:'Bits'},
 flanger:{name:'Flanger',x:'Snelheid',y:'Diepte'}};
const TFX={c:null,inp:null,dry:null,wet:null,n:null,active:false,latch:false,x:.5,y:.5,learn:null,ccTimer:0,trail:[],pointer:null,stDiv:null,stTimer:0};
const fracDiv=(x,list)=>list[Math.min(list.length-1,Math.floor(x*list.length))];
const divSec=d=>240/state.bpm*d; // d = deel van een hele noot
const tzv=(p,v,tc=.012)=>{if(TFX.c)p.setTargetAtTime(v,TFX.c.currentTime,tc)};
const fmtHz=f=>f>=1000?(f/1000).toFixed(1)+' kHz':Math.round(f)+' Hz';
const divName=d=>({0.25:'1/4',0.125:'1/8',0.0625:'1/16',0.03125:'1/32',0.015625:'1/64'})[d]||(d===1/12?'1/8T':d===3/16?'1/8.':d===3/8?'1/4.':'');

function setupTouchFx(c,dest){const inp=c.createGain(),dry=c.createGain(),wet=c.createGain();inp.connect(dry);dry.connect(dest);wet.connect(dest);wet.gain.value=0;
 Object.assign(TFX,{c,inp,dry,wet,n:null});buildTfx(state.tfxMode);return inp}
function teardownTfx(){const n=TFX.n;if(!n)return;try{TFX.inp.disconnect(n.in)}catch(e){}for(const v of Object.values(n))if(v&&typeof v.disconnect==='function'){try{if(v.stop)v.stop()}catch(e){}try{v.disconnect()}catch(e){}}TFX.n=null}
function buildTfx(mode){if(!TFX.c)return;teardownTfx();const c=TFX.c,n={};TFX.dry.gain.value=1;TFX.wet.gain.value=0;
 if(mode==='filter'){n.in=c.createBiquadFilter();n.in.type='highpass';n.in.frequency.value=20;n.lp=c.createBiquadFilter();n.lp.type='lowpass';n.lp.frequency.value=20000;n.in.connect(n.lp);n.lp.connect(TFX.wet)}
 else if(mode==='stutter'){n.in=c.createGain();n.d=c.createDelay(4);n.fb=c.createGain();n.fb.gain.value=0;n.in.connect(n.d);n.d.connect(n.fb);n.fb.connect(n.d);n.d.connect(TFX.wet);n.d.delayTime.value=divSec(.0625)}
 else if(mode==='delay'){n.in=c.createGain();n.in.gain.value=0;n.d=c.createDelay(4);n.fb=c.createGain();n.lp=c.createBiquadFilter();n.lp.type='lowpass';n.lp.frequency.value=4800;
  n.in.connect(n.d);n.d.connect(n.lp);n.lp.connect(n.fb);n.fb.connect(n.d);n.lp.connect(TFX.wet);TFX.wet.gain.value=.85}
 else if(mode==='reverb'){n.in=c.createGain();n.in.gain.value=0;n.cv=c.createConvolver();n.cv.buffer=makeImpulse(c,3.6);n.lp=c.createBiquadFilter();n.lp.type='lowpass';n.lp.frequency.value=8000;
  n.in.connect(n.cv);n.cv.connect(n.lp);n.lp.connect(TFX.wet);TFX.wet.gain.value=1}
 else if(mode==='gate'){n.in=c.createGain();n.osc=c.createOscillator();n.osc.type='square';n.amt=c.createGain();n.amt.gain.value=0;n.osc.connect(n.amt);n.amt.connect(n.in.gain);n.in.connect(TFX.wet);n.osc.start()}
 else if(mode==='lofi'){n.in=c.createWaveShaper();n.lp=c.createBiquadFilter();n.lp.type='lowpass';n.hp=c.createBiquadFilter();n.hp.type='highpass';n.hp.frequency.value=120;n.in.connect(n.lp);n.lp.connect(n.hp);n.hp.connect(TFX.wet);n.bits=0}
 else if(mode==='flanger'){n.in=c.createDelay(.05);n.in.delayTime.value=.004;n.osc=c.createOscillator();n.depth=c.createGain();n.fb=c.createGain();n.osc.connect(n.depth);n.depth.connect(n.in.delayTime);n.in.connect(n.fb);n.fb.connect(n.in);n.in.connect(TFX.wet);n.osc.start()}
 // stutter en delay/reverb hebben de ingang altijd nodig (buffer vullen / staart)
 TFX.inp.connect(n.in);TFX.n=n;TFX.stDiv=null;tfxParams()}
function crushCurve(bits){const N=4096,cv=new Float32Array(N),st=Math.pow(2,bits-1);for(let i=0;i<N;i++){const x=i/(N-1)*2-1;cv[i]=Math.round(x*st)/st}return cv}
const STUT_DIVS=[1/4,1/8,1/16,1/32,1/64],DLY_LIST=[1/16,1/12,1/8,3/16,1/4,3/8],GATE_DIVS=[1/4,1/8,1/16,1/32];
function tfxParams(){const n=TFX.n;if(!n)return;const {x,y}=TFX,m=state.tfxMode;
 if(m==='filter'){const q=.7+y*14;if(x<.5){tzv(n.lp.frequency,200*Math.pow(100,x/.5));tzv(n.in.frequency,20);n.lp.Q.value=q;n.in.Q.value=.7}else{tzv(n.lp.frequency,20000);tzv(n.in.frequency,20*Math.pow(400,(x-.5)/.5));n.in.Q.value=q;n.lp.Q.value=.7}}
 else if(m==='stutter'){const d=fracDiv(x,STUT_DIVS);if(TFX.active){tzv(n.fb.gain,.82+y*.175,.005);if(d!==TFX.stDiv)stutterCapture(d)}else{n.d.delayTime.setValueAtTime(divSec(d),TFX.c.currentTime);TFX.stDiv=d}}
 else if(m==='delay'){tzv(n.d.delayTime,divSec(fracDiv(x,DLY_LIST)),.05);tzv(n.fb.gain,.15+y*.78)}
 else if(m==='reverb'){if(TFX.active)tzv(n.in.gain,.15+x*1.1,.03);tzv(n.lp.frequency,700*Math.pow(20,y))}
 else if(m==='gate'){n.osc.frequency.setValueAtTime(1/divSec(fracDiv(x,GATE_DIVS)),TFX.c.currentTime);const dpt=.25+y*.75;if(TFX.active){tzv(n.amt.gain,dpt/2,.01);tzv(n.in.gain,1-dpt/2,.01)}}
 else if(m==='lofi'){tzv(n.lp.frequency,500*Math.pow(30,x));const b=Math.round(14-y*11);if(b!==n.bits){n.bits=b;n.in.curve=crushCurve(b)}}
 else if(m==='flanger'){tzv(n.osc.frequency,.08*Math.pow(75,x));tzv(n.depth.gain,.0006+y*.0032);tzv(n.fb.gain,.25+y*.6)}}
/* Stutter: pak het laatste stukje audio en herhaal het */
function stutterCapture(d){const n=TFX.n,c=TFX.c;TFX.stDiv=d;clearTimeout(TFX.stTimer);
 tzv(n.fb.gain,0,.003);tzv(TFX.wet.gain,0,.003);tzv(TFX.dry.gain,1,.003);n.d.delayTime.setValueAtTime(divSec(d),c.currentTime+.004);tzv(n.in.gain,1,.003);
 TFX.stTimer=setTimeout(()=>{if(TFX.active&&state.tfxMode==='stutter')stutterLoop()},divSec(d)*1000+8)}
function stutterLoop(){const n=TFX.n;tzv(n.in.gain,0,.002);tzv(n.fb.gain,.82+TFX.y*.175,.002);tzv(TFX.dry.gain,0,.003);tzv(TFX.wet.gain,1,.003)}
function tfxEngage(){if(!ensureAudio()||!TFX.n)return;TFX.active=true;const m=state.tfxMode,n=TFX.n;
 if(m==='filter'||m==='lofi'){tzv(TFX.dry.gain,0,.008);tzv(TFX.wet.gain,1,.008)}
 else if(m==='gate'){tzv(TFX.dry.gain,0,.008);tzv(TFX.wet.gain,1,.008)}
 else if(m==='flanger'){tzv(TFX.dry.gain,.75,.01);tzv(TFX.wet.gain,.75,.01)}
 else if(m==='delay'){tzv(n.in.gain,1,.005)}
 else if(m==='stutter'){const d=fracDiv(TFX.x,STUT_DIVS);if(d===TFX.stDiv)stutterLoop();else stutterCapture(d)}
 tfxParams();tfxUI()}
function tfxRelease(){TFX.active=false;const m=state.tfxMode,n=TFX.n;if(!n)return;clearTimeout(TFX.stTimer);
 if(m==='delay'||m==='reverb')tzv(n.in.gain,0,.02);
 else if(m==='stutter'){tzv(n.fb.gain,0,.004);tzv(n.in.gain,1,.004);tzv(TFX.dry.gain,1,.004);tzv(TFX.wet.gain,0,.004);TFX.stDiv=null}
 else if(m==='gate'){tzv(n.amt.gain,0,.01);tzv(n.in.gain,1,.01);tzv(TFX.dry.gain,1,.01);tzv(TFX.wet.gain,0,.01)}
 else{tzv(TFX.dry.gain,1,.02);tzv(TFX.wet.gain,0,.02)}
 tfxUI()}
function tfxSetMode(m){if(!TFX_MODES[m])return;const was=TFX.active;if(was)tfxRelease();state.tfxMode=m;save();buildTfx(m);if(was&&TFX.latch)tfxEngage();tfxUI()}
function tfxReadout(){const {x,y}=TFX,m=state.tfxMode;
 if(m==='filter')return x<.5?`Low-pass ${fmtHz(200*Math.pow(100,x/.5))} · Q ${(.7+y*14).toFixed(1)}`:`High-pass ${fmtHz(20*Math.pow(400,(x-.5)/.5))} · Q ${(.7+y*14).toFixed(1)}`;
 if(m==='stutter')return`Herhaal ${divName(fracDiv(x,STUT_DIVS))} · ${Math.round((.82+y*.175)*100)}%`;
 if(m==='delay')return`Delay ${divName(fracDiv(x,DLY_LIST))} · feedback ${Math.round((.15+y*.78)*100)}%`;
 if(m==='reverb')return`Space ${Math.round(x*100)}% · ${fmtHz(700*Math.pow(20,y))}`;
 if(m==='gate')return`Gate ${divName(fracDiv(x,GATE_DIVS))} · diepte ${Math.round((.25+y*.75)*100)}%`;
 if(m==='lofi')return`${Math.round(14-y*11)} bit · ${fmtHz(500*Math.pow(30,x))}`;
 return`Flanger ${(.08*Math.pow(75,x)).toFixed(2)} Hz · diepte ${Math.round(y*100)}%`}

/* ---------- UI ---------- */
const tfxEl={box:$('#tfx'),cv:$('#tfx-pad')};
function tfxUI(){const box=tfxEl.box;if(!box)return;$('#tfx-btn').classList.toggle('lit',!box.hidden||TFX.active||TFX.latch);$('#tfx-hold').classList.toggle('on',TFX.latch);
 $$('#tfx-modes .chip').forEach(c=>c.classList.toggle('active',c.dataset.m===state.tfxMode));$('#tfx-read').textContent=(TFX.active?'● ':'')+tfxReadout();
 const cc=state.tfxCC;$('#tfx-cc').textContent=TFX.learn?`Draai nu aan een knop voor ${TFX.learn.toUpperCase()}…`:`X = ${cc.x!=null?'CC '+cc.x:'—'} · Y = ${cc.y!=null?'CC '+cc.y:'—'}`;tfxDraw()}
function tfxDraw(){const c=tfxEl.cv;if(!c||tfxEl.box.hidden)return;const dpr=window.devicePixelRatio||1,W=c.clientWidth,H=c.clientHeight;if(!W)return;
 if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr)}const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
 const gr=g.createLinearGradient(0,0,W,H);gr.addColorStop(0,'#1c2433');gr.addColorStop(1,'#101722');g.fillStyle=gr;g.fillRect(0,0,W,H);
 g.strokeStyle='#ffffff10';g.lineWidth=1;for(let i=1;i<8;i++){g.beginPath();g.moveTo(i*W/8,0);g.lineTo(i*W/8,H);g.stroke();g.beginPath();g.moveTo(0,i*H/8);g.lineTo(W,i*H/8);g.stroke()}
 const M=TFX_MODES[state.tfxMode];g.fillStyle='#ffffff0d';g.font=`800 ${Math.round(Math.min(W,H)/5)}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(M.name.toUpperCase(),W/2,H/2);
 g.font='600 11px system-ui,sans-serif';g.fillStyle='#91a5b9';g.textAlign='center';g.fillText(M.x+'  →',W/2,H-10);
 g.save();g.translate(12,H/2);g.rotate(-Math.PI/2);g.fillText(M.y+'  →',0,0);g.restore();
 const now=performance.now();TFX.trail=TFX.trail.filter(p=>now-p.t<500);for(const p of TFX.trail){const a=1-(now-p.t)/500;g.fillStyle=`rgba(255,185,76,${a*.35})`;g.beginPath();g.arc(p.x*W,(1-p.y)*H,10*a+3,0,Math.PI*2);g.fill()}
 const px=TFX.x*W,py=(1-TFX.y)*H;
 if(TFX.active){const rg=g.createRadialGradient(px,py,0,px,py,60);rg.addColorStop(0,'rgba(255,185,76,.55)');rg.addColorStop(1,'rgba(255,185,76,0)');g.fillStyle=rg;g.beginPath();g.arc(px,py,60,0,Math.PI*2);g.fill();g.fillStyle='#ffd27a';g.beginPath();g.arc(px,py,14,0,Math.PI*2);g.fill()}
 else{g.strokeStyle='#65dfcf';g.lineWidth=2;g.beginPath();g.arc(px,py,12,0,Math.PI*2);g.stroke()}
 g.strokeStyle='#ffffff22';g.setLineDash([3,4]);g.beginPath();g.moveTo(px,0);g.lineTo(px,H);g.moveTo(0,py);g.lineTo(W,py);g.stroke();g.setLineDash([]);
 if(TFX.trail.length||TFX.active)requestAnimationFrame(tfxDraw)}
function tfxPos(e){const r=tfxEl.cv.getBoundingClientRect();TFX.x=clamp((e.clientX-r.left)/r.width,0,1);TFX.y=clamp(1-(e.clientY-r.top)/r.height,0,1);TFX.trail.push({x:TFX.x,y:TFX.y,t:performance.now()});if(TFX.trail.length>40)TFX.trail.shift()}
tfxEl.cv.addEventListener('pointerdown',e=>{if(TFX.pointer!=null)return;e.preventDefault();TFX.pointer=e.pointerId;try{tfxEl.cv.setPointerCapture(e.pointerId)}catch(x){}tfxPos(e);tfxEngage()});
tfxEl.cv.addEventListener('pointermove',e=>{if(e.pointerId!==TFX.pointer)return;tfxPos(e);tfxParams();$('#tfx-read').textContent='● '+tfxReadout();tfxDraw()});
const tfxUp=e=>{if(e.pointerId!==TFX.pointer)return;TFX.pointer=null;if(!TFX.latch)tfxRelease();else tfxUI()};
['pointerup','pointercancel'].forEach(n=>tfxEl.cv.addEventListener(n,tfxUp));
tfxEl.cv.addEventListener('contextmenu',e=>e.preventDefault());
function tfxToggle(open){const box=tfxEl.box;box.hidden=open===undefined?!box.hidden:!open;if(box.hidden&&TFX.active&&!TFX.latch)tfxRelease();tfxUI()}
$('#tfx-btn').onclick=()=>{ensureAudio();tfxToggle()};$('#tfx-close').onclick=()=>tfxToggle(false);
$('#tfx-hold').onclick=()=>{TFX.latch=!TFX.latch;if(!TFX.latch&&TFX.active&&TFX.pointer==null)tfxRelease();tfxUI()};
(function(){const box=$('#tfx-modes');for(const [k,v] of Object.entries(TFX_MODES)){const b=document.createElement('button');b.className='chip';b.dataset.m=k;b.textContent=v.name;b.onclick=()=>{ensureAudio();tfxSetMode(k)};box.append(b)}})();
$('#tfx-learn-x').onclick=()=>{TFX.learn=TFX.learn==='x'?null:'x';tfxUI()};$('#tfx-learn-y').onclick=()=>{TFX.learn=TFX.learn==='y'?null:'y';tfxUI()};
/* MIDI-controller (bijv. Q-Link-knoppen van een MPC in controllermodus) */
function tfxMidiCC(ch,cc,val){if(TFX.learn){state.tfxCC[TFX.learn]=cc;toast(`Touch FX ${TFX.learn.toUpperCase()} = CC ${cc}`);TFX.learn=null;save();tfxUI();return true}
 const cfg=state.tfxCC;if(cc!==cfg.x&&cc!==cfg.y)return false;if(cc===cfg.x)TFX.x=val/127;if(cc===cfg.y)TFX.y=val/127;
 if(!TFX.active)tfxEngage();else tfxParams();clearTimeout(TFX.ccTimer);if(!TFX.latch)TFX.ccTimer=setTimeout(()=>{if(TFX.pointer==null)tfxRelease()},700);
 TFX.trail.push({x:TFX.x,y:TFX.y,t:performance.now()});tfxUI();return true}
window.addEventListener('keydown',e=>{if(e.shiftKey&&!e.metaKey&&!e.ctrlKey&&e.code==='KeyX'){const t=e.target;if(t&&t.closest&&t.closest('input:not([type=range]),select,textarea'))return;e.preventDefault();ensureAudio();tfxToggle()}});
window.addEventListener('resize',()=>tfxDraw());
