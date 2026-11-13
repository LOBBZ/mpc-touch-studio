'use strict';
/* =====================================================================
   MPC Touch Studio — Song-modus: multitrack-tijdlijn zonder lengtelimiet
   Tijd in ticks (960 per kwartnoot). Events per spoor, gesorteerd op tick:
     drumspoor:       [tick, 0, bank, pad, velocity, tune]
     instrumentspoor: [tick, 1, noot, velocity, duur]
   ===================================================================== */
const PPQ=960,T16=PPQ/4,BAR=PPQ*4,INSTS=['piano','bass','guitar','synth'];
const INST_LABEL={piano:'Piano',bass:'Bass',guitar:'Gitaar',synth:'Synth'};
const TRACK_COLORS=['#ffb94c','#65dfcf','#bda0fc','#ff6577','#84de9a','#7cb3ff','#ff9f6b','#e6e07a'];
const U32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];

function freshSong(){return{tracks:[
  {id:1,type:'drums',name:'Drums',inst:'piano',vol:85,pan:0,mute:false,solo:false,arm:true,color:TRACK_COLORS[0],events:[]},
  {id:2,type:'inst',name:'Keys',inst:'piano',vol:80,pan:0,mute:false,solo:false,arm:true,color:TRACK_COLORS[1],events:[]}],
 nextId:3,length:0,locate:0,masterFx:MASTER_FX_DEFAULT()}}
let song=freshSong(),selTrack=1;

function newTrack(type){const n=song.tracks.filter(t=>t.type===type).length+1;
 const t={id:song.nextId++,type,name:type==='drums'?`Drums ${n}`:type==='audio'?(n===1?'Zang':`Audio ${n}`):['Keys','Bass','Synth','Gitaar'][(n-1)%4]+(n>4?' '+n:''),fx:FX_DEFAULT(),inst:type==='inst'?['piano','bass','synth','guitar'][(n-1)%4]:'piano',
  vol:80,pan:0,mute:false,solo:false,arm:false,color:TRACK_COLORS[song.tracks.length%TRACK_COLORS.length],events:[]};
 song.tracks.push(t);selTrack=t.id;return t}
function setSong(d){if(!d||!Array.isArray(d.tracks))return false;
 const tracks=d.tracks.filter(t=>t&&['drums','inst','audio'].includes(t.type)).map((t,k)=>({id:+t.id||k+1,type:t.type,fx:t.fx,name:String(t.name||'Spoor').slice(0,20),
  inst:validInst(t.inst)?t.inst:'piano',vol:clamp(Number(t.vol??80),0,100),pan:clamp(Number(t.pan??0),-100,100),mute:!!t.mute,solo:!!t.solo,arm:!!t.arm,
  color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:TRACK_COLORS[k%TRACK_COLORS.length],
  events:(Array.isArray(t.events)?t.events:[]).filter(e=>Array.isArray(e)&&e.length>=(t.type==='audio'?4:5)&&isFinite(e[0])&&e[0]>=0).sort((a,b)=>a[0]-b[0])}));
 if(!tracks.length)return false;
 song={tracks,nextId:Math.max(...tracks.map(t=>t.id))+1,length:Math.max(0,+d.length||0),locate:0,masterFx:d.masterFx};masterFx();tracks.forEach(fxOf);if(typeof edClearSel==='function')edClearSel();
 if(!song.tracks.some(t=>t.id===selTrack))selTrack=song.tracks[0].id;
 songPos=0;liveTrackNodes.forEach(n=>{try{n.g.disconnect();n.inp.disconnect()}catch(e){}});liveTrackNodes.clear();drawSongUI();return true}

/* ---------- Opslaan (IndexedDB, met localStorage als reserve) ---------- */
let songSaveTimer=null;
function saveSongSoon(){clearTimeout(songSaveTimer);songSaveTimer=setTimeout(saveSong,500)}
async function saveSong(){try{if(db&&await kvSet('song',JSON.parse(JSON.stringify(song))))return}catch(e){}
 try{localStorage.setItem('mpcts-song',JSON.stringify(song))}catch(e){toast('Song te groot om automatisch te bewaren: gebruik ↓ Bewaar project',null,5000)}}
async function loadSong(){try{let d=await kvGet('song');if(!d){const raw=storeGet('mpcts-song');if(raw)d=JSON.parse(raw)}if(d)setSong(d)}catch(e){}drawSongUI();gcClipsLater()}

/* ---------- Audio per spoor ---------- */
const liveTrackNodes=new Map();
const anySolo=()=>song.tracks.some(t=>t.solo);
const trackAudible=t=>!t.mute&&(!anySolo()||t.solo);
const trackGainVal=t=>trackAudible(t)?t.vol/100:0;
const makeTrackOut=(c,t,master)=>buildTrackChain(c,t,master);
function liveTrackOut(t){const ac=ensureAudio();if(!ac)return masterNode;let n=liveTrackNodes.get(t.id);if(!n){n=makeTrackOut(ac,t,masterNode);liveTrackNodes.set(t.id,n)}return n.inp}
function updateTrackGains(){if(!ctx)return;for(const t of song.tracks){const n=liveTrackNodes.get(t.id);if(!n)continue;n.g.gain.setTargetAtTime(trackGainVal(t),ctx.currentTime,.02);if(n.p)n.p.pan.setTargetAtTime(t.pan/100,ctx.currentTime,.02)}}
const recDrumTrack=()=>song.tracks.find(t=>t.arm&&t.type==='drums')||null;
const recInstTrack=()=>song.tracks.find(t=>t.arm&&t.type==='inst')||null;
function liveDrumDest(){const t=recDrumTrack();return t?liveTrackOut(t):masterNode}
function trackChannel(t){if(t.type!=='inst')return state.padCh;const k=song.tracks.filter(x=>x.type==='inst').indexOf(t);let ch=state.keyCh,n=0;while(n<k){ch=(ch+1)%16;if(ch!==state.padCh)n++}if(ch===state.padCh)ch=(ch+1)%16;return ch}

/* ---------- Klok ---------- */
let songAnchor=null,songPos=0,songHorizonTick=0,take=null,songVoices=[];
const songIdx=new Map();
const ticksToSec=tk=>tk/PPQ*60/state.bpm;
function songTickAt(time){return songAnchor?songAnchor.tick+(time-songAnchor.time)*state.bpm/60*PPQ:songPos}
function songTimeAt(tick){return songAnchor.time+(tick-songAnchor.tick)*60/(state.bpm*PPQ)}
function songPlayTick(){return playing&&songAnchor&&ctx?Math.max(0,songTickAt(ctx.currentTime)):songPos}
function lowerBound(a,tick){let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m][0]<tick)lo=m+1;else hi=m}return lo}
function songLength(){let end=song.length;for(const t of song.tracks){const e=t.events[t.events.length-1];if(!e)continue;if(t.type==='audio'){for(const a of t.events)end=Math.max(end,a[0]+clipTicks(a[2]))}else end=Math.max(end,e[0]+(e[1]===1?e[4]:T16))}return end}
function songReanchor(){if(songAnchor&&ctx){const now=ctx.currentTime;songAnchor={time:now,tick:songTickAt(now)}}}
function songRewindForStart(){songPos=song.locate;playCounter=Math.round(songPos/T16)}
function songBegin(t){songAnchor={time:t,tick:songPos};songHorizonTick=songPos;for(const tr of song.tracks)songIdx.set(tr.id,lowerBound(tr.events,songPos));
 startOverlappingClips(t);
 if(recording){take=newTake();audioRecStart()}
 else if(!state.songPattern&&!song.tracks.some(x=>x.events.length))toast('De song is nog leeg: zet ● Rec aan om op te nemen');
 startSongRAF()}
function songSchedule(horizon){const hz=songTickAt(horizon),now=ctx.currentTime;songHorizonTick=hz;
 for(const tr of song.tracks){const ev=tr.events;let i=songIdx.get(tr.id);if(i==null)i=lowerBound(ev,hz);const audible=trackAudible(tr);
  while(i<ev.length&&ev[i][0]<hz){const e=ev[i++];if(!audible)continue;const t=songTimeAt(e[0]);if(t<now-.03)continue;playSongEvent(tr,e,t)}songIdx.set(tr.id,i)}
 if(!recording&&!state.songPattern){const end=songLength();if(end>0&&songTickAt(now)>=end){stopTransport();toast('Einde van de song')}}}
function playSongEvent(tr,e,t){const dest=liveTrackOut(tr);
 if(e[1]===2){playClip(dest,e,t);return}
 if(e[1]===0){triggerPad(e[2],e[3],e[4],t,{seq:true,songPlay:true,tune:e[5]||0,dest});
  if(e[2]===state.activeBank&&state.lev==='off'){const id=setTimeout(()=>{visualTimers.delete(id);if(playing)flashPhys(e[3],'seqhit')},Math.max(0,(t-ctx.currentTime)*1000));visualTimers.add(id)}}
 else{const dur=ticksToSec(e[4]),v=makeVoice(ctx,dest,e[2],e[3],t,tr.inst);v.release(t+dur);
  if(songVoices.length>64)songVoices=songVoices.filter(x=>x.end>ctx.currentTime);songVoices.push({v,end:t+dur});
  midiSend({type:'note',note:e[2],velocity:e[3],channel:trackChannel(tr),delay_ms:clamp(Math.round((t-ctx.currentTime)*1000),0,2000),duration_ms:Math.max(20,Math.round(dur*1000))})}}
function releaseSongVoices(){stopClipSources();if(!ctx)return;const now=ctx.currentTime;for(const x of songVoices)if(x.end>now)x.v.release(now);songVoices=[]}

/* ---------- Opnemen (takes, overdub, undo) ---------- */
function newTake(){return{ev:new Map(),pending:new Map(),maxTick:0,hadPattern:false,count:0}}
function pushTake(tr,e){let a=take.ev.get(tr.id);if(!a){a=[];take.ev.set(tr.id,a)}a.push(e);take.count++;if(e[0]>take.maxTick)take.maxTick=e[0]}
let warnedAt=0;function warnNoArm(kind){if(Date.now()-warnedAt>4000){warnedAt=Date.now();toast(kind==='drums'?'Arm een drumspoor (R) om pads op te nemen':'Arm een instrumentspoor (R) om het klavier op te nemen')}}
function songRecPad(b,i,time,vel,tune,fromPattern){if(!take)return;const tr=recDrumTrack();if(!tr){warnNoArm('drums');return}
 pushTake(tr,[Math.max(0,Math.round(songTickAt(time))),0,b,i,Math.round(vel),tune||0]);if(fromPattern)take.hadPattern=true}
function songNoteOn(note,vel){if(!(state.songMode&&recording&&playing&&take&&ctx))return;const tr=recInstTrack();if(!tr){warnNoArm('inst');return}
 take.pending.set(note,{tick:Math.max(0,songTickAt(ctx.currentTime)),vel:Math.round(vel),id:tr.id})}
function songNoteOff(note){if(!take||!ctx)return;const p=take.pending.get(note);if(!p)return;take.pending.delete(note);const tr=song.tracks.find(t=>t.id===p.id);if(!tr)return;
 pushTake(tr,[Math.round(p.tick),1,note,p.vel,Math.max(PPQ/32,Math.round(songTickAt(ctx.currentTime)-p.tick))])}
const snapshotSong=()=>JSON.stringify(song);
/* Undo/redo: tot 60 stappen */
const undoStack=[],redoStack=[];
function pushHistory(){undoStack.push(snapshotSong());if(undoStack.length>60)undoStack.shift();redoStack.length=0;updateUndoUI()}
function undo(){if(!undoStack.length){toast('Niets om ongedaan te maken');return}stopTransport();redoStack.push(snapshotSong());setSong(JSON.parse(undoStack.pop()));saveSong();updateUndoUI();toast('Ongedaan gemaakt',null,1200)}
function redo(){if(!redoStack.length){toast('Niets om opnieuw te doen');return}stopTransport();undoStack.push(snapshotSong());setSong(JSON.parse(redoStack.pop()));saveSong();updateUndoUI();toast('Opnieuw gedaan',null,1200)}
function updateUndoUI(){const u=$('#song-undo'),r=$('#song-redo');if(u)u.disabled=!undoStack.length;if(r)r.disabled=!redoStack.length}
let gcT=null;const gcClipsLater=()=>{clearTimeout(gcT);gcT=setTimeout(()=>{if(!undoStack.length)gcClips()},2000)};
function commitTake(){if(!take)return;const endTick=ctx?songTickAt(ctx.currentTime):songPos;
 const ac=audioRecStop();if(ac)pushTake(ac.tr,ac.ev);
 for(const [n,p] of take.pending){const tr=song.tracks.find(t=>t.id===p.id);if(tr)pushTake(tr,[Math.round(p.tick),1,n,p.vel,Math.max(PPQ/32,Math.round(endTick-p.tick))])}
 const t=take;take=null;if(!t.count){drawSongUI();return}
 pushHistory();
 for(const [id,arr] of t.ev){const tr=song.tracks.find(x=>x.id===id);if(tr)tr.events=tr.events.concat(arr).sort((a,b)=>a[0]-b[0])}
 song.length=Math.max(song.length,Math.round(endTick));
 if(playing&&songAnchor)for(const tr of song.tracks)songIdx.set(tr.id,lowerBound(tr.events,Math.max(songHorizonTick,t.maxTick+1)));
 if(t.hadPattern&&state.songPattern){state.songPattern=false;$('#song-pattern').checked=false;save();toast('Take bewaard. Het patroon staat nu op je drumspoor en speelt niet meer apart mee.',null,5000)}
 else toast(`Take bewaard: ${t.count} noten`);
 saveSong();drawSongUI()}
function songRecToggled(){if(recording){take=newTake();audioRecStart()}else commitTake()}
function songPause(){commitTake();songPos=songAnchor&&ctx?Math.max(0,songTickAt(ctx.currentTime)):songPos;songAnchor=null;releaseSongVoices();drawSongUI()}
function songStop(){commitTake();songPos=song.locate;songAnchor=null;releaseSongVoices();drawSongUI()}
function setLocate(tk){song.locate=Math.max(0,Math.round(tk/PPQ)*PPQ);if(!playing){songPos=song.locate;if(paused)playCounter=Math.round(songPos/T16)}drawTimeline();updateSongTime()}
function songLcdNow(){const tk=Math.max(0,songPlayTick());return`${pad3(Math.floor(tk/BAR)+1)}.${pad2(Math.floor(tk%BAR/PPQ)+1)}.${pad2(Math.floor(tk%PPQ/10))}`}

/* ---------- Modus ---------- */
function setMode(m){const isSong=m==='song';if(state.songMode===isSong)return;stopTransport();state.songMode=isSong;updateModeUI();updateLCD();save();
 toast(isSong?'Song-modus: onbeperkt opnemen op de tijdlijn':'Patroon-modus: loop van 16 of 32 stappen')}
function updateModeUI(){const b=$('#mode-btn');b.textContent=state.songMode?'SONG':'LOOP';b.classList.toggle('song',state.songMode);
 $$('#mode-picks .chip').forEach(c=>c.classList.toggle('active',(c.dataset.mode==='song')===state.songMode));$('#song-pattern').checked=state.songPattern}

/* ---------- Tijdlijn ---------- */
const LANE=58,RULER=26;
const tl={scroll:$('#tl-scroll'),spacer:$('#tl-spacer'),canvas:$('#tl-canvas'),heads:$('#tl-heads')};
const pxPerTick=()=>state.songZoom/BAR;
const fmtTime=s=>{s=Math.max(0,s);const m=Math.floor(s/60),r=s-m*60;return`${m}:${r<10?'0':''}${r.toFixed(1)}`};
function drawSongUI(){if(!tl.heads)return;renderHeads();layoutTimeline();drawTimeline();updateSongTime();if(typeof renderEditor==='function'){renderEditor();renderFxPanel()}}
function layoutTimeline(){const bars=Math.max(32,Math.ceil((Math.max(songLength(),songPlayTick())+BAR*16)/BAR));tl.spacer.style.width=bars*state.songZoom+'px';
 const h=RULER+song.tracks.length*LANE,cw=tl.scroll.clientWidth||600,dpr=window.devicePixelRatio||1,c=tl.canvas;
 c.style.width=cw+'px';c.style.height=h+'px';c.width=Math.round(cw*dpr);c.height=Math.round(h*dpr);tl.layoutBars=bars}
function drawTimeline(){const c=tl.canvas;if(!c.width)return;const g=c.getContext('2d'),dpr=window.devicePixelRatio||1,W=c.width/dpr,H=c.height/dpr;g.setTransform(dpr,0,0,dpr,0,0);
 const sl=tl.scroll.scrollLeft,ppt=pxPerTick(),t0=sl/ppt,t1=(sl+W)/ppt,X=tk=>(tk-t0)*ppt;
 g.fillStyle='#0d1520';g.fillRect(0,0,W,H);
 song.tracks.forEach((t,k)=>{const y=RULER+k*LANE;g.fillStyle=t.id===selTrack?'#16212f':(k%2?'#0f1823':'#0d1520');g.fillRect(0,y,W,LANE);g.fillStyle='#253041';g.fillRect(0,y+LANE-1,W,1)});
 g.fillStyle='#16202d';g.fillRect(0,0,W,RULER);g.fillStyle='#303e4f';g.fillRect(0,RULER-1,W,1);
 const barPx=state.songZoom;let every=1;while(barPx*every<40)every*=2;
 g.font='600 10px ui-monospace,Menlo,monospace';g.textBaseline='middle';
 for(let b=Math.floor(t0/BAR);b*BAR<=t1;b++){const x=Math.round(X(b*BAR));
  if(barPx>=70){g.fillStyle='#172231';for(let q=1;q<4;q++)g.fillRect(Math.round(X(b*BAR+q*PPQ)),RULER,1,H-RULER)}
  if(b%every===0){g.fillStyle='#2c3a4c';g.fillRect(x,RULER,1,H-RULER);g.fillStyle='#91a5b9';g.fillRect(x,RULER-7,1,6);g.fillText(String(b+1),x+3,RULER/2-1)}}
 song.tracks.forEach((t,k)=>drawEvents(g,t,t.events,RULER+k*LANE,X,t0,t1,t.color,trackAudible(t)?1:.3));
 if(take)for(const [id,arr] of take.ev){const k=song.tracks.findIndex(t=>t.id===id);if(k>=0)drawEvents(g,song.tracks[k],arr,RULER+k*LANE,X,t0,t1,'#ff6577',1)}
 if(rec.active){const k=song.tracks.findIndex(t=>t.id===rec.trackId);if(k>=0){const x=X(rec.startTick),w=recClipTicks()*pxPerTick();g.fillStyle='#ff657740';g.fillRect(x,RULER+k*LANE+4,w,LANE-8);g.fillStyle='#ff6577';g.fillRect(x,RULER+k*LANE+LANE/2-1-rec.level*18,Math.max(2,w),2+rec.level*36)}}
 const end=songLength();if(end>0){g.fillStyle='#ffffff38';g.fillRect(Math.round(X(end)),RULER,1,H-RULER)}
 const lx=X(song.locate);g.fillStyle='#ffb94c';g.beginPath();g.moveTo(lx-6,0);g.lineTo(lx+6,0);g.lineTo(lx,9);g.closePath();g.fill();
 const px=Math.round(X(songPlayTick()));g.fillStyle=recording&&playing&&state.songMode?'#ff6577':'#65dfcf';g.fillRect(px,0,2,H)}
function drawEvents(g,t,ev,y,X,t0,t1,color,alpha){if(!ev.length)return;if(t.type==='audio'){drawClips(g,ev,y,LANE,X,t0,t1,color,alpha);return}g.globalAlpha=alpha;g.fillStyle=color;const pad=7,h=LANE-pad*2,ppt=pxPerTick();
 let i=ev===t.events?lowerBound(ev,t0-BAR*2):0;
 if(t.type==='drums'){const w=Math.max(2,Math.min(6,state.songZoom/48));for(;i<ev.length;i++){const e=ev[i];if(e[0]>t1)break;const x=X(e[0]);if(x<-6)continue;g.fillRect(x,y+pad+((e[3]%16)/15)*(h-3),w,3)}}
 else for(;i<ev.length;i++){const e=ev[i];if(e[0]>t1)break;const x=X(e[0]),w=Math.max(2,e[4]*ppt-1);if(x+w<0)continue;g.fillRect(x,y+pad+(1-(clamp(e[2],36,96)-36)/60)*(h-3),w,3)}
 g.globalAlpha=1}
function updateSongTime(){const tk=songPlayTick();$('#song-pos').textContent=fmtTime(ticksToSec(tk));$('#song-len').textContent=fmtTime(ticksToSec(songLength())).replace(/\.\d$/,'');
 $('#song-barpos').textContent=`MAAT ${Math.floor(tk/BAR)+1}.${Math.floor(tk%BAR/PPQ)+1}`}
let songRAF=0;
function startSongRAF(){if(songRAF)return;const loop=()=>{songRAF=0;if(!playing||!state.songMode)return;
  if(currentTab==='song'){const W=tl.scroll.clientWidth,px=songPlayTick()*pxPerTick()-tl.scroll.scrollLeft;
   if(px>W*.85||px<0)tl.scroll.scrollLeft=Math.max(0,songPlayTick()*pxPerTick()-W*.25);
   if(songPlayTick()/BAR>(tl.layoutBars||0)-8)layoutTimeline();drawTimeline();if(edVisible())drawEd()}
  updateSongTime();songRAF=requestAnimationFrame(loop)};songRAF=requestAnimationFrame(loop)}
let tlDrawQueued=false;tl.scroll.addEventListener('scroll',()=>{if(tlDrawQueued)return;tlDrawQueued=true;requestAnimationFrame(()=>{tlDrawQueued=false;drawTimeline()})},{passive:true});
tl.canvas.addEventListener('click',e=>{const r=tl.canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,tk=(tl.scroll.scrollLeft+x)/pxPerTick();
 if(y<RULER){setLocate(tk);return}const k=Math.floor((y-RULER)/LANE),t=song.tracks[k];if(t){selTrack=t.id;renderHeads();drawTimeline();renderEditor();renderFxPanel()}});
function zoom(f){const W=tl.scroll.clientWidth,center=(tl.scroll.scrollLeft+W/2)/pxPerTick();state.songZoom=clamp(Math.round(state.songZoom*f),6,240);layoutTimeline();tl.scroll.scrollLeft=Math.max(0,center*pxPerTick()-W/2);drawTimeline();save()}

/* Spoorkoppen */
function confirmTap(btn,label,fn){if(btn.dataset.armed==='1'){btn.dataset.armed='';btn.textContent=btn.dataset.orig;btn.classList.remove('toggled');fn();return}
 btn.dataset.orig=btn.textContent;btn.dataset.armed='1';btn.textContent=label;btn.classList.add('toggled');
 setTimeout(()=>{if(btn.dataset.armed==='1'){btn.dataset.armed='';btn.textContent=btn.dataset.orig;btn.classList.remove('toggled')}},2500)}
function renderHeads(){const h=tl.heads;h.innerHTML='<div class="ruler-head">SPOREN</div>';
 for(const t of song.tracks){const d=document.createElement('div');d.className='th'+(t.id===selTrack?' sel':'');d.style.setProperty('--tc',t.color);
  d.innerHTML=`<div class="th-row"><input type="text" maxlength="20" aria-label="Spoornaam">${t.type==='inst'?`<select aria-label="Instrument">${instOptionsHTML()}</select>`:`<span class="badge">${t.type==='audio'?'AUDIO':'PADS'}</span>`}<button class="tb fx" data-a="fx" title="Effecten">FX</button><button class="tb x" data-a="del" title="Spoor verwijderen" aria-label="Spoor verwijderen">✕</button></div>
  <div class="th-row"><button class="tb r${t.arm?' on':''}" data-a="arm" title="Opname aan/uit">R</button><button class="tb m${t.mute?' on':''}" data-a="mute" title="Mute">M</button><button class="tb s${t.solo?' on':''}" data-a="solo" title="Solo">S</button><input type="range" min="0" max="100" aria-label="Volume"></div>`;
  const nm=d.querySelector('input[type=text]');nm.value=t.name;nm.onchange=()=>{t.name=nm.value.trim().slice(0,20)||t.name;nm.value=t.name;saveSongSoon()};nm.onkeydown=e=>{if(e.key==='Enter')nm.blur()};
  const sel=d.querySelector('select');if(sel){sel.value=t.inst;sel.onchange=()=>{t.inst=sel.value;saveSongSoon()}}
  const vol=d.querySelector('input[type=range]');vol.value=t.vol;vol.oninput=()=>{t.vol=+vol.value;updateTrackGains();saveSongSoon()};
  d.addEventListener('click',e=>{const btn=e.target.closest('[data-a]');
   if(!btn){if(selTrack!==t.id){selTrack=t.id;$$('#tl-heads .th').forEach(x=>x.classList.toggle('sel',x===d));drawTimeline();renderEditor();renderFxPanel()}return}
   const a=btn.dataset.a;
   if(a==='arm'){t.arm=!t.arm;btn.classList.toggle('on',t.arm);if(t.arm&&t.type==='audio')ensureMic()}
   else if(a==='fx'){selTrack=t.id;$$('#tl-heads .th').forEach(x=>x.classList.toggle('sel',x===d));drawTimeline();renderFxPanel();renderEditor();$('#fx-panel').open=true;$('#fx-panel').scrollIntoView({behavior:'smooth',block:'nearest'});return}
   else if(a==='mute'){t.mute=!t.mute;btn.classList.toggle('on',t.mute);updateTrackGains();drawTimeline()}
   else if(a==='solo'){t.solo=!t.solo;btn.classList.toggle('on',t.solo);updateTrackGains();drawTimeline()}
   else if(a==='del'){if(song.tracks.length<=1){toast('Er moet minstens één spoor blijven');return}
    confirmTap(btn,'?',()=>{stopTransport();pushHistory();song.tracks=song.tracks.filter(x=>x!==t);const n=liveTrackNodes.get(t.id);if(n){try{n.g.disconnect()}catch(x){}liveTrackNodes.delete(t.id)}if(selTrack===t.id)selTrack=song.tracks[0].id;drawSongUI();saveSong();toast(`Spoor “${t.name}” verwijderd (↶ maakt het ongedaan)`)});return}
   saveSongSoon()});
  h.append(d)}}

/* ---------- Export: song als MIDI (type 1, één MIDI-spoor per spoor) en als WAV-mixdown ---------- */
function makeSongMIDI(){const tempo=Math.round(60000000/state.bpm),enc=s=>[...s].map(ch=>ch.charCodeAt(0)&127);
 const chunk=(name,evs,meta)=>{evs.sort((a,b)=>a.t-b.t||a.o-b.o);const nm=enc(name),d=[0,0xff,0x03,nm.length,...nm,...(meta||[])];let prev=0;
  for(const e of evs){const tm=Math.max(prev,Math.round(e.t));for(const x of toVLQ(tm-prev))d.push(x);d.push(...e.b);prev=tm}d.push(0,0xff,0x2f,0);
  const out=[77,84,114,107,...U32(d.length)];for(const x of d)out.push(x);return out};
 const chunks=[chunk('Tempo',[],[0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,0xff,0x58,4,4,2,24,8])];
 for(const t of song.tracks){if(!t.events.length||t.type==='audio')continue;const ch=trackChannel(t),ev=[];
  for(const e of t.events){if(e[1]===0){if(state.mutes[slotKey(e[2],e[3])])continue;const n=drumNote(e[2],e[3]);ev.push({t:e[0],b:[0x90|ch,n,e[4]],o:1},{t:e[0]+PPQ/8,b:[0x80|ch,n,0],o:0})}
   else ev.push({t:e[0],b:[0x90|ch,e[2],e[3]],o:1},{t:e[0]+Math.max(1,e[4]),b:[0x80|ch,e[2],0],o:0})}
  chunks.push(chunk(t.name,ev))}
 const head=[77,84,104,100,0,0,0,6,0,1,(chunks.length>>8)&255,chunks.length&255,(PPQ>>8)&255,PPQ&255];
 const out=new Uint8Array(head.length+chunks.reduce((n,c)=>n+c.length,0));let o=0;out.set(head,o);o+=head.length;for(const c of chunks){out.set(c,o);o+=c.length}return out}
async function exportSongWAV(){const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!OAC){toast('WAV-export wordt niet ondersteund in deze browser');return}
 const len=songLength();if(!song.tracks.some(t=>t.events.length)){toast('De song is nog leeg');return}
 const dur=ticksToSec(len)+Math.max(2.5,masterFx().revDecay+.5),btn=$('#song-wav');if(dur>240&&IS_IOS)toast('Lange song: renderen kan even duren en veel geheugen vragen',null,4000);
 btn.disabled=true;btn.textContent='WAV renderen...';
 try{const rate=wavFmt().rate,off=new OAC(2,Math.ceil(dur*rate),rate),master=off.createGain();master.gain.value=state.master/100;
  const lim=off.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=7;lim.ratio.value=7;lim.attack.value=.005;lim.release.value=.12;master.connect(lim);lim.connect(off.destination);
  const list=[];for(const t of song.tracks){if(!trackAudible(t)||!t.events.length)continue;const g=makeTrackOut(off,t,master).inp;for(const e of t.events)list.push({tt:.05+ticksToSec(e[0]),e,t,g})}
  list.sort((a,b)=>a.tt-b.tt);let idx=0;
  const scheduleUpTo=lim=>{while(idx<list.length&&list[idx].tt<lim){const {tt,e,t,g}=list[idx++];if(e[1]===2){const c=clips.get(e[2]);if(c){const s=off.createBufferSource(),cg=off.createGain();s.buffer=c.buf;cg.gain.value=e[3]??1;s.connect(cg);cg.connect(g);s.start(tt)}}else if(e[1]===0)soundAt(off,e[2],e[3],tt,e[4]/127,g,e[5]||0);else makeVoice(off,g,e[2],e[3],tt,t.inst).release(tt+ticksToSec(e[4]))}};
  /* In blokken van 2 s inplannen: houdt de audiograaf klein, zodat ook songs van 7+ minuten snel renderen */
  const WIN=2;let chunked=false;
  if(typeof off.suspend==='function'){try{scheduleUpTo(WIN+.5);for(let w=WIN;w<dur-.1;w+=WIN){const at=w;off.suspend(at).then(()=>{scheduleUpTo(at+WIN+.5);off.resume()})}chunked=true}catch(e){chunked=false}}
  if(!chunked)scheduleUpTo(Infinity);
  let pct=0;const prog=setInterval(()=>{const p=Math.min(99,Math.round(idx/list.length*100));if(p!==pct){pct=p;btn.textContent=`WAV renderen... ${p}%`}},250);
  let buf;try{buf=await renderOffline(off)}finally{clearInterval(prog)}if(await deliver(encodeWAV(buf,wavFmt().bits),`MPC_Touch_Song_${state.bpm}bpm.wav`))toast('Song-WAV geëxporteerd')}
 catch(e){console.error(e);toast('WAV-export mislukt: '+(e.message||e))}finally{btn.disabled=false;btn.textContent='↓ Song als WAV'}}

/* ---------- Bediening ---------- */
$$('#mode-picks .chip').forEach(c=>c.onclick=()=>setMode(c.dataset.mode));
$('#song-pattern').onchange=e=>{state.songPattern=e.target.checked;save()};
$('#song-home').onclick=()=>{setLocate(0);tl.scroll.scrollLeft=0;if(!playing){songPos=0}drawTimeline()};
$('#zoom-in').onclick=()=>zoom(1.5);$('#zoom-out').onclick=()=>zoom(1/1.5);
$('#add-drums').onclick=()=>{newTrack('drums');drawSongUI();saveSong()};
$('#add-inst').onclick=()=>{newTrack('inst');drawSongUI();saveSong()};
$('#add-audio').onclick=()=>{const t=newTrack('audio');t.arm=true;song.tracks.forEach(x=>{if(x!==t&&x.type==='audio')x.arm=false});drawSongUI();saveSong();ensureMic()};
$('#song-undo').onclick=()=>undo();$('#song-redo').onclick=()=>redo();
$('#track-clear').onclick=e=>{const t=song.tracks.find(x=>x.id===selTrack);if(!t||!t.events.length){toast('Kies een spoor met noten (tik op de spoorkop)');return}
 confirmTap(e.currentTarget,'Nogmaals = leegmaken',()=>{stopTransport();pushHistory();t.events=[];drawSongUI();saveSong();toast(`Spoor “${t.name}” leeggemaakt`)})};
$('#song-clear').onclick=e=>confirmTap(e.currentTarget,'Nogmaals = wissen',()=>{stopTransport();pushHistory();for(const t of song.tracks)t.events=[];song.length=0;song.locate=0;songPos=0;tl.scroll.scrollLeft=0;drawSongUI();saveSong();toast('Song gewist (↶ maakt het ongedaan)');gcClipsLater()});
$('#song-midi').onclick=async()=>{if(!song.tracks.some(t=>t.events.length)){toast('De song is nog leeg');return}if(await deliver(new Blob([makeSongMIDI()],{type:'audio/midi'}),`MPC_Touch_Song_${state.bpm}bpm.mid`))toast('Song-MIDI geëxporteerd')};
$('#song-wav').onclick=exportSongWAV;
window.addEventListener('resize',()=>{if(currentTab==='song'){layoutTimeline();drawTimeline()}});
