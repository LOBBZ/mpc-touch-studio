'use strict';
/* =====================================================================
   MPC Touch Studio — Playlist (zoals FL Studio): sporen met clips.
   Tijd in ticks (960 per kwartnoot).
   Clip-soorten:
     pattern: {kind:'pattern', pat:0–3}            → speelt sequencer-patroon A–D (loopt door)
     notes:   {kind:'notes', events:[...], cLen}    → opgenomen/getekende noten (relatief aan clip)
     audio:   {kind:'audio', clipId, gain}          → opname (golfvorm)
   Gemeenschappelijk: {id, start, len, off, mute, name}
   Event-formaten (in notenclips en in de afgeleide lijst t.events):
     drums: [tick, 0, bank, pad, velocity, tune]   instrument: [tick, 1, noot, velocity, duur]
     audio (afgeleid): [tick, 2, clipId, gain, offsetTicks, lengteTicks]
   ===================================================================== */
const PPQ=960,T16=PPQ/4,BAR=PPQ*4,INSTS=['piano','bass','guitar','synth'];
const TRACK_COLORS=['#ffb94c','#65dfcf','#bda0fc','#ff6577','#84de9a','#7cb3ff','#ff9f6b','#e6e07a'];
const U32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const mkTrack=(id,type,name,inst,color,arm)=>({id,type,name,inst,vol:type==='drums'?85:80,pan:0,mute:false,solo:false,arm,color,insert:id<=N_INSERTS?id:0,clips:[],events:[]});
const MIN_TRACKS=50;
function fillTracks(sg){while(sg.tracks.length<MIN_TRACKS){const n=sg.tracks.length+1;sg.tracks.push(mkTrack(sg.nextId++,'inst',`Track ${n}`,'piano',TRACK_COLORS[(n-1)%TRACK_COLORS.length],false))}return sg}
function freshSong(){return fillTracks({tracks:[mkTrack(1,'drums','Drums','piano',TRACK_COLORS[0],true),mkTrack(2,'inst','Keys','piano',TRACK_COLORS[1],true),mkTrack(3,'audio','Zang','piano',TRACK_COLORS[2],false)],
 nextId:4,nextClip:1,length:0,locate:0,masterFx:MASTER_FX_DEFAULT(),name:'Nummer 1',bpm:null,inserts:(()=>{const a=freshInserts();a[0].name='Drums';a[1].name='Keys';a[2].name='Zang';return a})()})}
let song=freshSong(),selTrack=1;
const newClipId=()=>song.nextClip++;

function newTrack(type){const n=song.tracks.filter(t=>t.type===type).length+1;
 const name=type==='drums'?`Drums ${n}`:type==='audio'?(n===1?'Zang':`Audio ${n}`):['Keys','Bass','Synth','Gitaar'][(n-1)%4]+(n>4?' '+n:'');
 const t=mkTrack(song.nextId++,type,name,type==='inst'?['piano','bass','synth','guitar'][(n-1)%4]:'piano',TRACK_COLORS[song.tracks.length%TRACK_COLORS.length],false);
 song.tracks.push(t);selTrack=t.id;return t}

/* ---------- Inlezen / migreren / opslaan ---------- */
function validEvent(nt,e){return Array.isArray(e)&&e.length>=5&&isFinite(e[0])&&e[0]>=0&&(nt==='drums'?e[1]===0:e[1]===1)}
const trackNt=t=>t.type==='drums'?'drums':'inst';
function sanitizeClip(t,c){if(!c||typeof c!=='object')return null;const base={id:+c.id||0,start:Math.max(0,Math.round(+c.start||0)),len:Math.max(T16,Math.round(+c.len||BAR)),off:Math.max(0,Math.round(+c.off||0)),mute:!!c.mute,name:String(c.name||'').slice(0,40)};
 if(c.kind==='audio'&&c.clipId)return{...base,kind:'audio',clipId:String(c.clipId),gain:clamp(Number(c.gain??1),0,2)};
 if(c.kind==='pattern')return{...base,kind:'pattern',pat:ensurePattern(c.pat|0)};
 if(c.kind==='notes'){const nt=c.nt==='drums'||c.nt==='inst'?c.nt:(Array.isArray(c.events)&&c.events[0]&&c.events[0][1]===0?'drums':trackNt(t));const ev=(Array.isArray(c.events)?c.events:[]).filter(e=>validEvent(nt,e)).sort((a,b)=>a[0]-b[0]);return{...base,kind:'notes',nt,events:ev,cLen:Math.max(BAR,Math.round(+c.cLen||base.len))}}
 return null}
function eventsToClips(t,events,clipIdRef){const ev=events.filter(e=>Array.isArray(e)&&isFinite(e[0])&&e[0]>=0);if(!ev.length)return[];
 if(t.type==='audio')return ev.filter(e=>e[1]===2).map(e=>({id:clipIdRef.n++,kind:'audio',start:Math.round(e[0]),len:Math.round(clipTicks(e[2])||BAR*4),off:0,clipId:String(e[2]),gain:e[3]??1,mute:false,name:'Opname'}));
 const nt=trackNt(t),notes=ev.filter(e=>validEvent(nt,e)).sort((a,b)=>a[0]-b[0]);if(!notes.length)return[];
 const s=Math.floor(notes[0][0]/BAR)*BAR,end=Math.max(...notes.map(e=>e[0]+(e[1]===1?e[4]:T16))),len=Math.max(BAR,Math.ceil((end-s)/BAR)*BAR);
 return[{id:clipIdRef.n++,kind:'notes',nt,start:s,len,cLen:len,off:0,mute:false,name:t.name,events:notes.map(e=>{const n=e.slice();n[0]-=s;return n})}]}
function setSong(d){if(!d||!Array.isArray(d.tracks))return false;const ref={n:Math.max(1,+d.nextClip||1)};
 const tracks=d.tracks.filter(t=>t&&['drums','inst','audio'].includes(t.type)).map((t,k)=>{const tr={id:+t.id||k+1,type:t.type,fx:t.fx,insert:Number.isInteger(t.insert)&&t.insert>=0&&t.insert<=N_INSERTS?t.insert:(k+1<=N_INSERTS?k+1:0),name:String(t.name||'Spoor').slice(0,20),
  inst:validInst(t.inst)?t.inst:'piano',vol:clamp(Number(t.vol??80),0,100),pan:clamp(Number(t.pan??0),-100,100),mute:!!t.mute,solo:!!t.solo,arm:!!t.arm,
  color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:TRACK_COLORS[k%TRACK_COLORS.length],clips:[],events:[]};
  tr.clips=Array.isArray(t.clips)?t.clips.map(c=>sanitizeClip(tr,c)).filter(Boolean):eventsToClips(tr,Array.isArray(t.events)?t.events:[],ref);
  for(const c of tr.clips)if(!c.id)c.id=ref.n++;return tr});
 if(!tracks.length)return false;const maxClip=Math.max(0,...tracks.flatMap(t=>t.clips.map(c=>c.id)));
 song=fillTracks({tracks,nextId:Math.max(...tracks.map(t=>t.id))+1,nextClip:Math.max(ref.n,maxClip+1),length:Math.max(0,+d.length||0),locate:0,masterFx:d.masterFx,name:String(d.name||'Naamloos').slice(0,40),bpm:d.bpm>=45&&d.bpm<=240?Math.round(d.bpm):null});
 song.inserts=sanitizeInserts(d.inserts,song.tracks);song.tracks.forEach(t=>delete t.fx);masterFx();song.tracks.forEach(rebuildFlat);if(typeof edClearSel==='function')edClearSel();PL.sel.clear();
 if(!song.tracks.some(t=>t.id===selTrack))selTrack=song.tracks[0].id;
 songPos=0;liveTrackNodes.forEach(n=>{try{n.g.disconnect();n.inp.disconnect();n.end.disconnect()}catch(e){}});liveTrackNodes.clear();resetLiveInserts();drawSongUI();if(currentTab==='mixer')renderMixer();return true}
const serializeSong=()=>JSON.stringify({...song,tracks:song.tracks.map(({events,...rest})=>rest)});
let songSaveTimer=null;
function saveSongSoon(){clearTimeout(songSaveTimer);songSaveTimer=setTimeout(saveSong,500)}
async function saveSong(){song.bpm=state.bpm;const data=serializeSong();try{if(db&&await kvSet('song',JSON.parse(data)))return}catch(e){}
 try{localStorage.setItem('mpcts-song',data)}catch(e){toast('Song te groot om automatisch te bewaren: gebruik ↓ Bewaar project',null,5000)}}
async function loadSong(){try{let d=await kvGet('song');if(!d){const raw=storeGet('mpcts-song');if(raw)d=JSON.parse(raw)}if(d)setSong(d)}catch(e){console.warn(e)}drawSongUI();gcClipsLater()}

/* ---------- Clips → afspeellijst per spoor ---------- */
const patLenTicks=()=>state.stepLength*T16;
function patternEvents(p){const out=[],pat=state.patterns[p]||{};
 for(const [k,arr] of Object.entries(pat)){if(!Array.isArray(arr))continue;const [b,i]=k.split(':').map(Number);if(!(b>=0&&b<4&&i>=0&&i<16))continue;
  for(let s=0;s<state.stepLength;s++){const d=decodeStep(arr[s]);if(d)out.push([Math.round(s*T16+swingOffset(s,T16)),0,b,i,d.vel,d.tune])}}
 return out.sort((a,b)=>a[0]-b[0])}
const clipSrcLen=c=>c.kind==='pattern'?patLenTicks():c.kind==='notes'?Math.max(T16,c.cLen||c.len):Infinity;
function rebuildFlat(t){const out=[];
 for(const c of t.clips){if(c.mute)continue;
  if(c.kind==='audio'){out.push([c.start,2,c.clipId,c.gain??1,c.off||0,c.len]);continue}
  const src=c.kind==='pattern'?patternEvents(c.pat):c.events,L=clipSrcLen(c);if(!src.length)continue;
  for(let base=-((c.off||0)%L);base<c.len;base+=L)for(const e of src){if(e[0]>=L)continue;const rel=base+e[0];if(rel<0||rel>=c.len)continue;const n=e.slice();n[0]=c.start+rel;if(n[1]===1)n[4]=Math.max(10,Math.min(n[4],c.len-rel));out.push(n)}}
 out.sort((a,b)=>a[0]-b[0]);t.events=out;
 if(playing&&songAnchor)songIdx.set(t.id,lowerBound(out,songHorizonTick))}
function songPatternsChanged(){let any=false;for(const t of song.tracks)if(t.clips.some(c=>c.kind==='pattern')){rebuildFlat(t);any=true}if(any&&currentTab==='song')drawTimeline()}

/* ---------- Audio per spoor ---------- */
const liveTrackNodes=new Map();
const anySolo=()=>song.tracks.some(t=>t.solo);
const trackAudible=t=>!t.mute&&(!anySolo()||t.solo);
const trackGainVal=t=>trackAudible(t)?t.vol/100:0;
function liveTrackOut(t){const ac=ensureAudio();if(!ac)return masterNode;let n=liveTrackNodes.get(t.id);if(!n){n=buildTrackStrip(ac,t,liveInsertIn(t.insert));liveTrackNodes.set(t.id,n)}return n.inp}
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
function songLength(){let end=song.length;for(const t of song.tracks)for(const c of t.clips)end=Math.max(end,c.start+c.len);return end}
const songHasContent=()=>song.tracks.some(t=>t.clips.length);
function songReanchor(){if(songAnchor&&ctx){const now=ctx.currentTime;songAnchor={time:now,tick:songTickAt(now)}}}
function songRewindForStart(){songPos=song.locate;playCounter=Math.round(songPos/T16)}
function songBegin(t){songAnchor={time:t,tick:songPos};songHorizonTick=songPos;for(const tr of song.tracks)songIdx.set(tr.id,lowerBound(tr.events,songPos));
 startOverlappingClips(t);
 if(recording){take=newTake();audioRecStart()}
 else if(!state.songPattern&&!songHasContent())toast('De playlist is nog leeg: plaats een patroon met ✏️ of neem op met ● Rec');
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

/* ---------- Opnemen: elke take wordt een clip ---------- */
function newTake(){return{ev:new Map(),pending:new Map(),maxTick:0,count:0,patFrom:state.songPattern&&ctx&&songAnchor?Math.max(0,songTickAt(ctx.currentTime)):null}}
function pushTake(tr,e){let a=take.ev.get(tr.id);if(!a){a=[];take.ev.set(tr.id,a)}a.push(e);take.count++;if(e[0]>take.maxTick)take.maxTick=e[0]}
let warnedAt=0;function warnNoArm(kind){if(Date.now()-warnedAt>4000){warnedAt=Date.now();toast(kind==='drums'?'Arm een drumspoor (R) om pads op te nemen':'Arm een instrumentspoor (R) om het klavier op te nemen')}}
function songRecPad(b,i,time,vel,tune,fromPattern){if(!take)return;if(fromPattern)return; // meespelend patroon wordt een patternclip
 const tr=recDrumTrack();if(!tr){warnNoArm('drums');return}pushTake(tr,[Math.max(0,Math.round(songTickAt(time))),0,b,i,Math.round(vel),tune||0])}
function songNoteOn(note,vel){if(!(state.songMode&&recording&&playing&&take&&ctx))return;const tr=recInstTrack();if(!tr){warnNoArm('inst');return}
 take.pending.set(note,{tick:Math.max(0,songTickAt(ctx.currentTime)),vel:Math.round(vel),id:tr.id})}
function songNoteOff(note){if(!take||!ctx)return;const p=take.pending.get(note);if(!p)return;take.pending.delete(note);const tr=song.tracks.find(t=>t.id===p.id);if(!tr)return;
 pushTake(tr,[Math.round(p.tick),1,note,p.vel,Math.max(PPQ/32,Math.round(songTickAt(ctx.currentTime)-p.tick))])}
/* Undo/redo: tot 60 stappen */
const snapshotSong=serializeSong,undoStack=[],redoStack=[];
function pushHistory(){undoStack.push(snapshotSong());if(undoStack.length>60)undoStack.shift();redoStack.length=0;updateUndoUI()}
function undo(){if(!undoStack.length){toast('Niets om ongedaan te maken');return}stopTransport();redoStack.push(snapshotSong());setSong(JSON.parse(undoStack.pop()));saveSong();updateUndoUI();toast('Ongedaan gemaakt',null,1200)}
function redo(){if(!redoStack.length){toast('Niets om opnieuw te doen');return}stopTransport();undoStack.push(snapshotSong());setSong(JSON.parse(redoStack.pop()));saveSong();updateUndoUI();toast('Opnieuw gedaan',null,1200)}
function updateUndoUI(){const u=$('#song-undo'),r=$('#song-redo');if(u)u.disabled=!undoStack.length;if(r)r.disabled=!redoStack.length}
let gcT=null;const gcClipsLater=()=>{clearTimeout(gcT);gcT=setTimeout(()=>{if(!undoStack.length)gcClips()},2000)};
function commitTake(){if(!take)return;const endTick=ctx?songTickAt(ctx.currentTime):songPos;
 const ar=audioRecStop();
 for(const [n,p] of take.pending){const tr=song.tracks.find(t=>t.id===p.id);if(tr)pushTake(tr,[Math.round(p.tick),1,n,p.vel,Math.max(PPQ/32,Math.round(endTick-p.tick))])}
 const t=take;take=null;const patTrack=t.patFrom!=null?recDrumTrack():null,patOk=patTrack&&endTick-t.patFrom>T16;
 if(!t.count&&!ar&&!patOk){drawSongUI();return}
 pushHistory();let made=0;
 for(const [id,arr] of t.ev){const tr=song.tracks.find(x=>x.id===id);if(!tr||!arr.length)continue;arr.sort((a,b)=>a[0]-b[0]);
  const s=Math.floor(arr[0][0]/BAR)*BAR,end=Math.max(...arr.map(e=>e[0]+(e[1]===1?e[4]:T16)),endTick),len=Math.max(BAR,Math.ceil((end-s)/BAR)*BAR);
  const n=tr.clips.filter(c=>c.kind==='notes').length+1;tr.clips.push({id:newClipId(),kind:'notes',nt:arr[0][1]===0?'drums':'inst',start:s,len,cLen:len,off:0,mute:false,name:`${tr.name} ${n}`,events:arr.map(e=>{const x=e.slice();x[0]-=s;return x})});rebuildFlat(tr);made++}
 if(ar){const n=ar.tr.clips.length+1;ar.tr.clips.push({id:newClipId(),kind:'audio',start:ar.ev[0],len:Math.max(T16,Math.round(clipTicks(ar.ev[2]))),off:0,clipId:ar.ev[2],gain:1,mute:false,name:`${ar.tr.name} ${n}`});rebuildFlat(ar.tr);made++}
 if(patOk){const s=Math.floor(t.patFrom/BAR)*BAR,len=Math.max(BAR,Math.ceil((endTick-s)/BAR)*BAR);patTrack.clips.push({id:newClipId(),kind:'pattern',pat:state.pattern,start:s,len,off:0,mute:false,name:''});rebuildFlat(patTrack);made++;
  state.songPattern=false;$('#song-pattern').checked=false;save()}
 song.length=Math.max(song.length,Math.round(endTick));
 toast(patOk?'Opname bewaard: het patroon staat nu als patternclip in de playlist':`Opname bewaard als ${made} clip${made>1?'s':''}`,null,3500);
 saveSong();drawSongUI()}
function songRecToggled(){if(recording){take=newTake();audioRecStart()}else commitTake()}
function songPause(){commitTake();songPos=songAnchor&&ctx?Math.max(0,songTickAt(ctx.currentTime)):songPos;songAnchor=null;releaseSongVoices();drawSongUI()}
function songStop(){commitTake();songPos=song.locate;songAnchor=null;releaseSongVoices();drawSongUI()}
function setLocate(tk){song.locate=Math.max(0,Math.round(tk/PPQ)*PPQ);if(!playing){songPos=song.locate;if(paused)playCounter=Math.round(songPos/T16)}drawTimeline();updateSongTime();if(typeof drawEd==='function')drawEd()}
function songLcdNow(){const tk=Math.max(0,songPlayTick());return`${pad3(Math.floor(tk/BAR)+1)}.${pad2(Math.floor(tk%BAR/PPQ)+1)}.${pad2(Math.floor(tk%PPQ/10))}`}

/* ---------- PAT / SONG ---------- */
function setMode(m){const isSong=m==='song';if(state.songMode===isSong)return;stopTransport();state.songMode=isSong;updateModeUI();updateLCD();save();
 toast(isSong?'SONG: de playlist speelt af':'PAT: het patroon speelt in een loop')}
function updateModeUI(){const b=$('#mode-btn');b.textContent=state.songMode?'SONG':'PAT';b.classList.toggle('song',state.songMode);
 $$('#mode-picks .chip').forEach(c=>c.classList.toggle('active',(c.dataset.mode==='song')===state.songMode));$('#song-pattern').checked=state.songPattern}

/* ---------- Playlist tekenen ---------- */
const LANE=48,RULER=26;
const tl={v:$('#tl'),scroll:$('#tl-scroll'),spacer:$('#tl-spacer'),canvas:$('#tl-canvas'),heads:$('#tl-heads')};
const rulerTop=()=>tl.v.scrollTop;
const pxPerTick=()=>state.songZoom/BAR;
const fmtTime=s=>{s=Math.max(0,s);const m=Math.floor(s/60),r=s-m*60;return`${m}:${r<10?'0':''}${r.toFixed(1)}`};
const hexA=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
function clipLabel(c){return(c.mute?'🔇 ':'')+(c.kind==='pattern'?patName(c.pat):c.name||(c.kind==='audio'?'Opname':'Noten'))}
function drawSongUI(){if(!tl.heads)return;renderHeads();layoutTimeline();drawTimeline();updateSongTime();updatePlHint();if(typeof renderEditor==='function'){renderEditor();renderFxPanel()}}
function layoutTimeline(){const bars=Math.max(32,Math.ceil((Math.max(songLength(),songPlayTick())+BAR*16)/BAR));tl.spacer.style.width=bars*state.songZoom+'px';
 const h=RULER+song.tracks.length*LANE,cw=tl.scroll.clientWidth||600,dpr=window.devicePixelRatio||1,c=tl.canvas;
 c.style.width=cw+'px';c.style.height=h+'px';c.width=Math.round(cw*dpr);c.height=Math.round(h*dpr);tl.layoutBars=bars}
function clipRect(k,c){const ppt=pxPerTick(),sl=tl.scroll.scrollLeft;return{x:c.start*ppt-sl,w:Math.max(4,c.len*ppt),y:RULER+k*LANE+3,h:LANE-6}}
function rr(g,x,y,w,h,r){r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function drawTimeline(){const c=tl.canvas;if(!c.width)return;const g=c.getContext('2d'),dpr=window.devicePixelRatio||1,W=c.width/dpr,H=c.height/dpr;g.setTransform(dpr,0,0,dpr,0,0);
 const sl=tl.scroll.scrollLeft,ppt=pxPerTick(),t0=sl/ppt,t1=(sl+W)/ppt,X=tk=>(tk-t0)*ppt,RT=rulerTop(),VH=tl.v.clientHeight||H,k0=Math.max(0,Math.floor((RT-LANE)/LANE)),k1=Math.min(song.tracks.length-1,Math.ceil((RT+VH)/LANE));
 g.fillStyle='#0d1520';g.fillRect(0,RT,W,VH);
 for(let k=k0;k<=k1;k++){const t=song.tracks[k],y=RULER+k*LANE;g.fillStyle=t.id===selTrack?'#16212f':(k%2?'#0f1823':'#0d1520');g.fillRect(0,y,W,LANE);g.fillStyle='#253041';g.fillRect(0,y+LANE-1,W,1)}
 const barPx=state.songZoom;let every=1;while(barPx*every<40)every*=2;
 for(let b=Math.floor(t0/BAR);b*BAR<=t1;b++){const x=Math.round(X(b*BAR));
  if(barPx>=70){g.fillStyle='#172231';for(let q=1;q<4;q++)g.fillRect(Math.round(X(b*BAR+q*PPQ)),RT,1,VH)}
  if(b%every===0){g.fillStyle='#2c3a4c';g.fillRect(x,RT,1,VH)}}
 // clips
 for(let k=k0;k<=k1;k++){const t=song.tracks[k],audible=trackAudible(t);
  for(const cl of t.clips){const r=clipRect(k,cl);if(r.x>W||r.x+r.w<0)continue;const sel=PL.sel.has(cl);
   g.save();g.globalAlpha=cl.mute?.35:(audible?1:.45);rr(g,r.x,r.y,r.w,r.h,5);g.fillStyle=hexA(t.color,.24);g.fill();g.clip();
   g.fillStyle=hexA(t.color,.9);g.fillRect(r.x,r.y,r.w,12);g.fillStyle='#0b1018';g.font='700 9px system-ui,sans-serif';g.textBaseline='middle';g.fillText(clipLabel(cl),r.x+5,r.y+6.5);
   const L=clipSrcLen(cl);if(L<cl.len&&L*ppt>6){g.fillStyle=hexA(t.color,.55);for(let b=cl.start-((cl.off||0)%L)+L;b<cl.start+cl.len;b+=L)if(b>cl.start)g.fillRect(Math.round(X(b)),r.y+12,1,r.h-12)}
   g.restore();
   g.save();rr(g,r.x,r.y,r.w,r.h,5);g.lineWidth=sel?2:1;g.strokeStyle=sel?'#ffffff':hexA(t.color,.8);g.stroke();g.restore()}
  g.save();g.beginPath();g.rect(0,RULER+k*LANE+15,W,LANE-18);g.clip();drawEvents(g,t,t.events,RULER+k*LANE+8,X,t0,t1,'#f4f8ff',audible?.9:.4);g.restore()}
 if(take)for(const [id,arr] of take.ev){const k=song.tracks.findIndex(t=>t.id===id);if(k>=0)drawEvents(g,song.tracks[k],arr,RULER+k*LANE+8,X,t0,t1,'#ff6577',1)}
 if(rec.active){const k=song.tracks.findIndex(t=>t.id===rec.trackId);if(k>=0){const x=X(rec.startTick),w=recClipTicks()*pxPerTick();g.fillStyle='#ff657740';g.fillRect(x,RULER+k*LANE+4,w,LANE-8);g.fillStyle='#ff6577';g.fillRect(x,RULER+k*LANE+LANE/2-1-rec.level*14,Math.max(2,w),2+rec.level*28)}}
 const d=PL.drag;if(d&&d.mode==='band'){g.fillStyle='#65dfcf22';g.strokeStyle='#65dfcf';const x=Math.min(d.x0,d.x1),y=Math.min(d.y0,d.y1);g.fillRect(x,y,Math.abs(d.x1-d.x0),Math.abs(d.y1-d.y0));g.strokeRect(x+.5,y+.5,Math.abs(d.x1-d.x0),Math.abs(d.y1-d.y0))}
 if(d&&d.mode==='erase'&&d.trail){g.strokeStyle='#ff6577aa';g.lineWidth=6;g.lineCap='round';g.beginPath();d.trail.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke()}
 const end=songLength();if(end>0){g.fillStyle='#ffffff38';g.fillRect(Math.round(X(end)),RT,1,VH)}
 // liniaal (blijft bovenaan staan)
 g.fillStyle='#16202d';g.fillRect(0,RT,W,RULER);g.fillStyle='#303e4f';g.fillRect(0,RT+RULER-1,W,1);g.font='600 10px ui-monospace,Menlo,monospace';g.textBaseline='middle';
 for(let b=Math.floor(t0/BAR);b*BAR<=t1;b++){if(b%every)continue;const x=Math.round(X(b*BAR));g.fillStyle='#91a5b9';g.fillRect(x,RT+RULER-7,1,6);g.fillText(String(b+1),x+3,RT+RULER/2-1)}
 const lx=X(song.locate);g.fillStyle='#ffb94c';g.beginPath();g.moveTo(lx-6,RT);g.lineTo(lx+6,RT);g.lineTo(lx,RT+9);g.closePath();g.fill();
 const px=Math.round(X(songPlayTick()));g.fillStyle=recording&&playing&&state.songMode?'#ff6577':'#65dfcf';g.fillRect(px,RT,2,VH)}
function drawEvents(g,t,ev,y,X,t0,t1,color,alpha){if(!ev.length)return;g.globalAlpha=alpha;g.fillStyle=color;const pad=5,h=LANE-pad*2-8,ppt=pxPerTick(),dw=Math.max(2,Math.min(5,state.songZoom/48));
 let i=ev===t.events?lowerBound(ev,t0-BAR*2):0;
 for(;i<ev.length;i++){const e=ev[i];if(e[0]>t1)break;
  if(e[1]===2){drawClips(g,[e],y,LANE-10,X,t0,t1,color,alpha,null,true);g.globalAlpha=alpha;g.fillStyle=color;continue}
  const x=X(e[0]);if(e[1]===0){if(x<-6)continue;g.fillRect(x,y+pad+((e[3]%16)/15)*(h-2),dw,2)}
  else{const w=Math.max(2,e[4]*ppt-1);if(x+w<0)continue;g.fillRect(x,y+pad+(1-(clamp(e[2],36,96)-36)/60)*(h-2),w,2)}}
 g.globalAlpha=1}
function updateSongTime(){const tk=songPlayTick();$('#song-pos').textContent=fmtTime(ticksToSec(tk));$('#song-len').textContent=fmtTime(ticksToSec(songLength())).replace(/\.\d$/,'');
 $('#song-barpos').textContent=`MAAT ${Math.floor(tk/BAR)+1}.${Math.floor(tk%BAR/PPQ)+1}`}
let songRAF=0;
function startSongRAF(){if(songRAF)return;const loop=()=>{songRAF=0;if(!playing||!state.songMode)return;
  if(currentTab==='song'){const W=tl.scroll.clientWidth,px=songPlayTick()*pxPerTick()-tl.scroll.scrollLeft;
   if(!PL.drag&&(px>W*.85||px<0))tl.scroll.scrollLeft=Math.max(0,songPlayTick()*pxPerTick()-W*.25);
   if(songPlayTick()/BAR>(tl.layoutBars||0)-8)layoutTimeline();drawTimeline();if(edVisible())drawEd()}
  updateSongTime();songRAF=requestAnimationFrame(loop)};songRAF=requestAnimationFrame(loop)}
let tlDrawQueued=false;const tlQueue=()=>{if(tlDrawQueued)return;tlDrawQueued=true;requestAnimationFrame(()=>{tlDrawQueued=false;drawTimeline()})};tl.scroll.addEventListener('scroll',tlQueue,{passive:true});tl.v.addEventListener('scroll',tlQueue,{passive:true});
function zoom(f){const W=tl.scroll.clientWidth,center=(tl.scroll.scrollLeft+W/2)/pxPerTick();state.songZoom=clamp(Math.round(state.songZoom*f),6,240);layoutTimeline();tl.scroll.scrollLeft=Math.max(0,center*pxPerTick()-W/2);drawTimeline();save()}

/* ---------- Playlist bewerken (gereedschap zoals FL) ---------- */
const PL={tool:'select',sel:new Set(),drag:null,lastTap:{t:0,c:null}};
const PL_SNAPS={bar:BAR,beat:PPQ,'1/16':T16,off:1};
const plGrid=()=>PL_SNAPS[state.plSnap]||PPQ;
const plSnap=tk=>{const g=plGrid();return Math.max(0,Math.round(tk/g)*g)};
const plFloor=tk=>{const g=plGrid();return Math.max(0,Math.floor(tk/g)*g)};
const tlPos=ev=>{const r=tl.canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top}};
const tlTick=x=>(tl.scroll.scrollLeft+x)/pxPerTick();
const laneAt=y=>y<RULER?null:song.tracks[Math.floor((y-RULER)/LANE)]||null;
const inRuler=y=>y>=rulerTop()&&y<rulerTop()+RULER;
const clipFits=()=>true; // zoals FL: elke clip mag op elk spoor
function hitClip(x,y){if(y<rulerTop()+RULER||y<RULER)return null;const k=Math.floor((y-RULER)/LANE),t=song.tracks[k];if(!t)return null;
 for(let i=t.clips.length-1;i>=0;i--){const c=t.clips[i],r=clipRect(k,c);if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){const e=Math.min(12,r.w/4);return{t,c,k,edge:x>r.x+r.w-e?'r':x<r.x+e?'l':null}}}return null}
function maxClipLen(c){return c.kind==='audio'?Math.max(T16,Math.round(clipTicks(c.clipId))-(c.off||0)):Infinity}
function removeClip(t,c){t.clips=t.clips.filter(x=>x!==c);PL.sel.delete(c);if(typeof ED!=='undefined'&&ED.target&&ED.target._clip===c){ED.target=null;renderEditor()}}
function placeClip(t,tick){pushHistory();const src=state.plSrc||'p0';let c;
 if(src!=='n')c={id:newClipId(),kind:'pattern',pat:ensurePattern(+src.slice(1)),start:tick,len:patLenTicks(),off:0,mute:false,name:''};
 else c={id:newClipId(),kind:'notes',nt:trackNt(t),start:tick,len:BAR,cLen:BAR,off:0,mute:false,name:`${t.name} ${t.clips.filter(x=>x.kind==='notes').length+1}`,events:[]};
 t.clips.push(c);PL.sel.clear();PL.sel.add(c);rebuildFlat(t);saveSongSoon();layoutTimeline();drawTimeline();
 if(c.kind==='notes'){edOpenClip(t,c);toast('Lege notenclip: teken noten in de editor hieronder',null,2500)}}
function splitClip(h,tick){const {t,c}=h;tick=plSnap(tick);if(tick<=c.start||tick>=c.start+c.len)return;pushHistory();
 const c2=JSON.parse(JSON.stringify(c));c2.id=newClipId();c2.start=tick;c2.len=c.start+c.len-tick;c2.off=(c.off||0)+(tick-c.start);c.len=tick-c.start;
 t.clips.splice(t.clips.indexOf(c)+1,0,c2);rebuildFlat(t);saveSongSoon();drawTimeline()}
function eraseHit(h,d){if(!h||d.erased.has(h.c))return;d.erased.add(h.c);removeClip(h.t,h.c);rebuildFlat(h.t);drawTimeline();if(navigator.vibrate)try{navigator.vibrate(8)}catch(e){}}
function openClip(h){const {t,c}=h;
 if(c.kind==='pattern'){state.pattern=c.pat;renderAll();save();setTab('sequence');toast(`${patName(c.pat)} bewerken in de Channel Rack: alle clips van dit patroon veranderen mee`,null,3000);return}
 if(c.kind==='audio'){toast('Audioclip: sleep de randen om in te korten, ✂️ om te knippen');return}
 edOpenClip(t,c)}
function plDuplicate(){if(!PL.sel.size){toast('Selecteer eerst clips (⬚)');return}pushHistory();const sel=[...PL.sel],s0=Math.min(...sel.map(c=>c.start)),s1=Math.max(...sel.map(c=>c.start+c.len)),shift=Math.max(BAR,Math.ceil((s1-s0)/BAR)*BAR);
 const added=[];for(const t of song.tracks)for(const c of [...t.clips])if(PL.sel.has(c)){const n=JSON.parse(JSON.stringify(c));n.id=newClipId();n.start+=shift;t.clips.push(n);added.push(n);rebuildFlat(t)}
 PL.sel=new Set(added);saveSongSoon();layoutTimeline();drawTimeline();toast(`${added.length} clip${added.length>1?'s':''} gedupliceerd`,null,1200)}
function plDelete(){if(!PL.sel.size){toast('Selecteer eerst clips (⬚), of veeg ze weg met 🧽');return}pushHistory();
 for(const t of song.tracks){const had=t.clips.some(c=>PL.sel.has(c));if(had){for(const c of [...t.clips])if(PL.sel.has(c))removeClip(t,c);rebuildFlat(t)}}PL.sel.clear();saveSongSoon();drawTimeline();gcClipsLater()}

tl.canvas.addEventListener('pointerdown',ev=>{ensureAudio();const {x,y}=tlPos(ev);
 if(inRuler(y)){setLocate(Math.round(tlTick(x)/PPQ)*PPQ);return}
 const hit=hitClip(x,y);try{tl.canvas.setPointerCapture(ev.pointerId)}catch(e){}
 PL.drag={id:ev.pointerId,x0:x,y0:y,x1:x,y1:y,cy:ev.clientY,sl:tl.scroll.scrollLeft,st:tl.v.scrollTop,hit,moved:false,mode:null,mouse:ev.pointerType==='mouse',shift:ev.shiftKey||ev.metaKey||ev.ctrlKey,erased:new Set(),trail:[[x,y]]};
 if(PL.tool==='erase'){pushHistory();PL.drag.mode='erase';eraseHit(hit,PL.drag)}});
tl.canvas.addEventListener('pointermove',ev=>{const d=PL.drag;if(!d||d.id!==ev.pointerId)return;const {x,y}=tlPos(ev),dx=x-d.x0,dy=y-d.y0;if(d.cx==null)d.cx=ev.clientX;
 if(d.mode==='erase'){d.trail.push([x,y]);if(d.trail.length>40)d.trail.shift();eraseHit(hitClip(x,y),d);drawTimeline();return}
 if(!d.moved){if(Math.hypot(dx,dy)<6)return;d.moved=true;
  if(d.hit&&(PL.tool==='select'||PL.tool==='draw')){d.mode=d.hit.edge==='r'?'rr':d.hit.edge==='l'?'rl':'move';pushHistory();
   if(!PL.sel.has(d.hit.c)){if(!d.shift)PL.sel.clear();PL.sel.add(d.hit.c)}d.orig=new Map([...PL.sel].map(c=>[c,{start:c.start,len:c.len,off:c.off||0}]))}
  else d.mode=PL.tool==='select'&&d.mouse?'band':'pan'}
 const ppt=pxPerTick();
 if(d.mode==='pan'){tl.scroll.scrollLeft=d.sl-(ev.clientX-d.cx);const before=tl.v.scrollTop;tl.v.scrollTop=tl.v.scrollTop+(d.cy-ev.clientY);if(tl.v.scrollTop===before)window.scrollBy(0,d.cy-ev.clientY);d.cy=ev.clientY;return}
 if(d.mode==='band'){d.x1=x;d.y1=y;drawTimeline();return}
 const ho=d.orig.get(d.hit.c);if(!ho)return;const touched=new Set();
 if(d.mode==='move'){let dt=plSnap(ho.start+dx/ppt)-ho.start;for(const o of d.orig.values())dt=Math.max(dt,-o.start);
  for(const [c,o] of d.orig)c.start=o.start+dt;
  const lane=laneAt(y);if(lane&&lane!==d.hit.t&&PL.sel.size===1&&clipFits(d.hit.c,lane)){removeClip(d.hit.t,d.hit.c);PL.sel.add(d.hit.c);lane.clips.push(d.hit.c);touched.add(d.hit.t);d.hit.t=lane;d.hit.k=song.tracks.indexOf(lane)}}
 else if(d.mode==='rr'){const delta=plSnap(ho.start+ho.len+dx/ppt)-(ho.start+ho.len);for(const [c,o] of d.orig)c.len=clamp(o.len+delta,T16,maxClipLen(c))}
 else if(d.mode==='rl'){let delta=plSnap(ho.start+dx/ppt)-ho.start;for(const [c,o] of d.orig){let dd=Math.min(delta,o.len-T16);if(c.kind==='audio')dd=Math.max(dd,-o.off);dd=Math.max(dd,-o.start);c.start=o.start+dd;c.len=o.len-dd;c.off=Math.max(0,o.off+dd)}}
 for(const t of song.tracks)if(t.clips.some(c=>PL.sel.has(c)))touched.add(t);touched.forEach(rebuildFlat);drawTimeline()});
function plPointerEnd(ev){const d=PL.drag;if(!d||d.id!==ev.pointerId)return;PL.drag=null;
 if(d.mode==='erase'){if(!d.erased.size){undoStack.pop();updateUndoUI()}else{saveSongSoon();gcClipsLater();toast(`${d.erased.size} clip${d.erased.size>1?'s':''} weggeveegd (↶ maakt ongedaan)`,null,1800)}drawTimeline();return}
 if(!d.moved){plTap(d);return}
 if(d.mode==='band'){const x0=Math.min(d.x0,d.x1),x1=Math.max(d.x0,d.x1),y0=Math.min(d.y0,d.y1),y1=Math.max(d.y0,d.y1);if(!d.shift)PL.sel.clear();
  song.tracks.forEach((t,k)=>{for(const c of t.clips){const r=clipRect(k,c);if(r.x<x1&&r.x+r.w>x0&&r.y<y1&&r.y+r.h>y0)PL.sel.add(c)}});drawTimeline();return}
 if(d.mode==='move'||d.mode==='rr'||d.mode==='rl'){song.length=Math.max(0,song.length);saveSongSoon();layoutTimeline();drawTimeline();if(typeof drawEd==='function')drawEd()}}
['pointerup','pointercancel'].forEach(n=>tl.canvas.addEventListener(n,plPointerEnd));
tl.canvas.addEventListener('contextmenu',e=>{e.preventDefault();const {x,y}=tlPos(e),h=hitClip(x,y);if(h){pushHistory();removeClip(h.t,h.c);rebuildFlat(h.t);saveSongSoon();drawTimeline();gcClipsLater()}});
function plTap(d){const {x0:x,y0:y,hit}=d,lane=laneAt(y);
 if(lane&&selTrack!==lane.id){selTrack=lane.id;renderHeads();renderFxPanel()}
 if(PL.tool==='slice'){if(hit)splitClip(hit,tlTick(x));return}
 if(PL.tool==='mute'){if(hit){pushHistory();hit.c.mute=!hit.c.mute;rebuildFlat(hit.t);saveSongSoon();drawTimeline()}return}
 if(hit){const now=Date.now(),dbl=PL.lastTap.c===hit.c&&now-PL.lastTap.t<380;PL.lastTap={t:now,c:hit.c};
  if(dbl){openClip(hit);return}
  if(d.shift){PL.sel.has(hit.c)?PL.sel.delete(hit.c):PL.sel.add(hit.c)}else{PL.sel.clear();PL.sel.add(hit.c)}
  if(hit.c.kind==='notes'&&typeof edOpenClip==='function'&&$('#ed-panel').open)edOpenClip(hit.t,hit.c,true);drawTimeline();return}
 if(PL.tool==='draw'&&lane){placeClip(lane,plFloor(tlTick(x)));return}
 PL.sel.clear();drawTimeline()}
const PL_HINTS={select:'⬚ Tik = selecteren · dubbeltik = openen (noten → piano roll, pattern → sequencer) · sleep = verplaatsen (ook naar een ander spoor) · sleep de rand = langer/korter (patronen loopen door).',
 draw:'✏️ Tik op een lege plek om de gekozen bron te plaatsen: een pattern op een drumspoor, een notenclip op een instrumentspoor.',
 slice:'✂️ Tik op een clip om hem op die plek in tweeën te knippen.',erase:'🧽 Tik of veeg met je vinger over clips om ze uit te vegen. ↶ maakt het ongedaan.',mute:'🔇 Tik op een clip om hem te dempen of weer aan te zetten.'};
function renderPlSrc(){const s=$('#pl-src');if(!s)return;const cur=state.plSrc||'p0';s.innerHTML='';
 for(let i=0;i<state.patterns.length;i++)s.add(new Option(`✏️ ${patName(i)}${patHasNotes(i)?'':' (leeg)'}`,'p'+i));s.add(new Option('✏️ Lege notenclip','n'));s.value=cur;if(s.value!==cur)s.value='p0'}
function updatePlHint(){const h=$('#pl-hint');if(h)h.textContent=PL_HINTS[PL.tool];$$('#pl-tool .chip').forEach(c=>c.classList.toggle('active',c.dataset.tool===PL.tool));
 renderPlSrc();const n=$('#pl-snap');if(n)n.value=state.plSnap||'beat';tl.canvas.dataset.tool=PL.tool}
window.addEventListener('keydown',e=>{if(currentTab!=='song')return;const tg=e.target;if(tg&&tg.closest&&tg.closest('input:not([type=range]),select,textarea'))return;const mod=e.metaKey||e.ctrlKey;
 if(mod&&e.code==='KeyB'){e.preventDefault();plDuplicate();return}
 if(!mod&&(e.code==='Delete'||e.code==='Backspace')&&PL.sel.size&&(typeof ED==='undefined'||!ED.sel.size)){e.preventDefault();plDelete();return}
 if(!mod&&!e.shiftKey&&!e.repeat){const k={KeyV:'select',KeyP:'draw',KeyC:'slice',KeyD:'erase',KeyT:'mute'}[e.code];if(k&&e.altKey){PL.tool=k;updatePlHint()}}});

/* Spoorkoppen */
function confirmTap(btn,label,fn){if(btn.dataset.armed==='1'){btn.dataset.armed='';btn.textContent=btn.dataset.orig;btn.classList.remove('toggled');fn();return}
 btn.dataset.orig=btn.textContent;btn.dataset.armed='1';btn.textContent=label;btn.classList.add('toggled');
 setTimeout(()=>{if(btn.dataset.armed==='1'){btn.dataset.armed='';btn.textContent=btn.dataset.orig;btn.classList.remove('toggled')}},2500)}
function renderHeads(){const h=tl.heads;h.innerHTML='<div class="ruler-head">SPOREN</div>';
 for(const t of song.tracks){const d=document.createElement('div');d.className='th'+(t.id===selTrack?' sel':'');d.style.setProperty('--tc',t.color);
  d.innerHTML=`<div class="th-row"><input type="text" maxlength="20" aria-label="Spoornaam">${t.type==='inst'?`<button class="badge tb-type" data-a="type" title="Soort spoor">INST</button><select aria-label="Instrument">${instOptionsHTML()}</select>`:`<button class="badge tb-type" data-a="type" title="Soort spoor (bepaalt wat je opneemt)">${t.type==='audio'?'AUDIO':'PADS'}</button>`}<button class="tb fx" data-a="fx" title="Effecten">FX</button><button class="tb x" data-a="del" title="Spoor verwijderen" aria-label="Spoor verwijderen">✕</button></div>
  <div class="th-row"><button class="tb r${t.arm?' on':''}" data-a="arm" title="Opname aan/uit">R</button><button class="tb m${t.mute?' on':''}" data-a="mute" title="Mute">M</button><button class="tb s${t.solo?' on':''}" data-a="solo" title="Solo">S</button><input type="range" min="0" max="100" aria-label="Volume"></div>`;
  const nm=d.querySelector('input[type=text]');nm.value=t.name;nm.onchange=()=>{t.name=nm.value.trim().slice(0,20)||t.name;nm.value=t.name;saveSongSoon()};nm.onkeydown=e=>{if(e.key==='Enter')nm.blur()};
  const sel=d.querySelector('select');if(sel){sel.value=t.inst;sel.onchange=()=>{t.inst=sel.value;saveSongSoon()}}
  const vol=d.querySelector('input[type=range]');vol.value=t.vol;vol.oninput=()=>{t.vol=+vol.value;updateTrackGains();saveSongSoon()};
  d.addEventListener('click',e=>{const btn=e.target.closest('[data-a]');
   if(!btn){if(selTrack!==t.id){selTrack=t.id;$$('#tl-heads .th').forEach(x=>x.classList.toggle('sel',x===d));drawTimeline();renderFxPanel()}return}
   const a=btn.dataset.a;
   if(a==='type'){t.type={drums:'inst',inst:'audio',audio:'drums'}[t.type];renderHeads();if(t.arm&&t.type==='audio')ensureMic();saveSongSoon();toast(`${t.name}: ${t.type==='drums'?'pads/drums':t.type==='audio'?'audio (microfoon)':'instrument'} opnemen`,null,1500);return}
   if(a==='arm'){t.arm=!t.arm;btn.classList.toggle('on',t.arm);if(t.arm&&t.type==='audio')ensureMic()}
   else if(a==='fx'){selTrack=t.id;MIX.sel=t.insert||0;setTab('mixer');return}
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
   else if(e[1]===1)ev.push({t:e[0],b:[0x90|ch,e[2],e[3]],o:1},{t:e[0]+Math.max(1,e[4]),b:[0x80|ch,e[2],0],o:0})}
  chunks.push(chunk(t.name,ev))}
 const head=[77,84,104,100,0,0,0,6,0,1,(chunks.length>>8)&255,chunks.length&255,(PPQ>>8)&255,PPQ&255];
 const out=new Uint8Array(head.length+chunks.reduce((n,c)=>n+c.length,0));let o=0;out.set(head,o);o+=head.length;for(const c of chunks){out.set(c,o);o+=c.length}return out}
async function exportSongWAV(){const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!OAC){toast('WAV-export wordt niet ondersteund in deze browser');return}
 const len=songLength();if(!song.tracks.some(t=>t.events.length)){toast('De playlist is nog leeg');return}
 const dur=ticksToSec(len)+Math.max(2.5,masterFx().revDecay+.5),btn=$('#song-wav');if(dur>240&&IS_IOS)toast('Lange song: renderen kan even duren en veel geheugen vragen',null,4000);
 btn.disabled=true;btn.textContent='WAV renderen...';
 try{const rate=wavFmt().rate,off=new OAC(2,Math.ceil(dur*rate),rate),master=off.createGain();master.gain.value=state.master/100;
  const lim=off.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=7;lim.ratio.value=7;lim.attack.value=.005;lim.release.value=.12;master.connect(lim);lim.connect(off.destination);
  const route=makeOfflineRouting(off,master),list=[];for(const t of song.tracks){if(!trackAudible(t)||!t.events.length)continue;const g=route.trackIn(t);for(const e of t.events)list.push({tt:.05+ticksToSec(e[0]),e,t,g})}
  list.sort((a,b)=>a.tt-b.tt);let idx=0;
  const scheduleUpTo=lim=>{while(idx<list.length&&list[idx].tt<lim){const {tt,e,t,g}=list[idx++];
   if(e[1]===2){const c=clips.get(e[2]);if(c){const s=off.createBufferSource(),cg=off.createGain();s.buffer=c.buf;cg.gain.value=e[3]??1;s.connect(cg);cg.connect(g);const o=ticksToSec(e[4]||0),l=e[5]!=null?ticksToSec(e[5]):c.dur-o;if(l>0&&o<c.dur)s.start(tt,o,l)}}
   else if(e[1]===0)soundAt(off,e[2],e[3],tt,e[4]/127,g,e[5]||0);else makeVoice(off,g,e[2],e[3],tt,t.inst).release(tt+ticksToSec(e[4]))}};
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
$$('#pl-tool .chip').forEach(c=>c.onclick=()=>{PL.tool=c.dataset.tool;updatePlHint()});
$('#pl-src').onchange=e=>{state.plSrc=e.target.value;save();if(PL.tool!=='draw'){PL.tool='draw';updatePlHint()}};
$('#pl-snap').onchange=e=>{state.plSnap=e.target.value;save()};
$('#pl-dup').onclick=plDuplicate;$('#pl-del').onclick=plDelete;
$('#track-clear').onclick=e=>{const t=song.tracks.find(x=>x.id===selTrack);if(!t||!t.clips.length){toast('Kies een spoor met clips (tik op de spoorkop)');return}
 confirmTap(e.currentTarget,'Nogmaals = leegmaken',()=>{stopTransport();pushHistory();t.clips=[];rebuildFlat(t);drawSongUI();saveSong();toast(`Spoor “${t.name}” leeggemaakt`);gcClipsLater()})};
$('#song-clear').onclick=e=>confirmTap(e.currentTarget,'Nogmaals = wissen',()=>{stopTransport();pushHistory();for(const t of song.tracks){t.clips=[];rebuildFlat(t)}song.length=0;song.locate=0;songPos=0;tl.scroll.scrollLeft=0;drawSongUI();saveSong();toast('Playlist gewist (↶ maakt het ongedaan)');gcClipsLater()});
$('#song-midi').onclick=async()=>{if(!song.tracks.some(t=>t.events.length&&t.type!=='audio')){toast('Er staan nog geen noten in de playlist');return}if(await deliver(new Blob([makeSongMIDI()],{type:'audio/midi'}),`MPC_Touch_Song_${state.bpm}bpm.mid`))toast('Song-MIDI geëxporteerd')};
$('#song-wav').onclick=exportSongWAV;
window.addEventListener('resize',()=>{if(currentTab==='song'){layoutTimeline();drawTimeline()}});
