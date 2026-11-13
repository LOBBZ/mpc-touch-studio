'use strict';
/* =====================================================================
   Piano-tab: lang klavier (88 toetsen, scrollen), akkoorden (standaard,
   jazz, in toonsoort, progressies), toonladders en stap-invoer naar de
   piano roll in de gekozen duur.
   ===================================================================== */
const KB_LO=21,KB_HI=108;
const KS={chordPtr:new Map(),cursor:null,lastLocate:null,seqTimers:[]};
const isBlack=n=>[1,3,6,8,10].includes(n%12);
const kbWhites=()=>{const w=[];for(let n=KB_LO;n<=KB_HI;n++)if(!isBlack(n))w.push(n);return w};
const kbArea=$('#key-area'),kbMap=$('#kb-map');

function drawKeyboard(){const root=$('#keyboard');if(!root)return;root.innerHTML='';const whites=kbWhites(),kw=state.kbKeyW;root.style.width=whites.length*kw+'px';root.style.setProperty('--kw',kw+'px');
 const show=state.kbShowScale,rp=TH.root,sc=TH.scale;
 for(const n of whites){const k=document.createElement('button');k.className='white-key';k.dataset.note=n;
  if(show&&inScale(n,rp,sc))k.classList.add(((n-rp)%12+12)%12===0?'root-key':'in-scale');
  k.innerHTML=`<b>${n%12===0?noteLabel(n):''}</b>`;root.append(k)}
 for(let n=KB_LO;n<=KB_HI;n++){if(!isBlack(n))continue;const before=whites.filter(x=>x<n).length,k=document.createElement('button');k.className='black-key';
  k.style.left=before*kw+'px';k.style.width=Math.round(kw*.62)+'px';k.dataset.note=n;if(show&&inScale(n,rp,sc))k.classList.add(((n-rp)%12+12)%12===0?'root-key':'in-scale');root.append(k)}
 activeSynth.forEach((_,n)=>{const k=root.querySelector(`[data-note="${n}"]`);if(k)k.classList.add('held')});
 kbFirst=(state.octave+1)*12;kbLast=kbFirst+24;$('#kb-zoom-val').textContent=kw;
 $$('#kb-opts [data-opt]').forEach(b=>b.classList.toggle('active',!!state[b.dataset.opt]));
 if(!drawKeyboard.done&&kbArea.clientWidth){drawKeyboard.done=true;requestAnimationFrame(()=>kbScrollTo(state.octave,false))}
 kbUpdateLabel();drawKbMap()}

/* Scrollen: de bovenste mini-strook toont het hele klavier; sleep het kader om te scrollen */
function kbXOfNote(n){return kbWhites().filter(x=>x<n).length*state.kbKeyW}
function kbScrollTo(oct,smooth=true){const x=kbXOfNote((oct+1)*12);kbArea.scrollTo({left:Math.max(0,x-8),behavior:smooth?'smooth':'auto'})}
function kbUpdateLabel(){const kw=state.kbKeyW,wh=kbWhites(),a=wh[Math.min(wh.length-1,Math.floor(kbArea.scrollLeft/kw))],b=wh[Math.min(wh.length-1,Math.floor((kbArea.scrollLeft+kbArea.clientWidth-1)/kw))];
 $('#octave-label').textContent=`${noteLabel(a)}–${noteLabel(b)}`;const o=Math.floor(a/12)-1;if(o!==state.octave&&a%12<=2){state.octave=clamp(o,0,7);kbFirst=(state.octave+1)*12}}
function drawKbMap(){const c=kbMap;if(!c||!c.clientWidth)return;const dpr=devicePixelRatio||1,W=c.clientWidth,H=c.clientHeight;c.width=W*dpr;c.height=H*dpr;const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
 const wh=kbWhites(),ww=W/wh.length;g.fillStyle='#e8edf2';g.fillRect(0,0,W,H);
 wh.forEach((n,i)=>{if(state.kbShowScale&&inScale(n,TH.root,TH.scale)){g.fillStyle=((n-TH.root)%12+12)%12===0?'#9bd94a':'#ffcf8a';g.fillRect(i*ww,H*.62,ww,H*.38)}g.fillStyle='#8a96a3';g.fillRect(i*ww,0,1,H);if(n%12===0){g.fillStyle='#4a5560';g.font='9px system-ui';g.fillText(noteLabel(n),i*ww+2,H-3)}});
 for(let n=KB_LO;n<=KB_HI;n++)if(isBlack(n)){const i=wh.filter(x=>x<n).length;g.fillStyle='#20272b';g.fillRect(i*ww-ww*.3,0,ww*.6,H*.58)}
 const total=wh.length*state.kbKeyW,x=kbArea.scrollLeft/total*W,w=Math.min(W,kbArea.clientWidth/total*W);g.fillStyle='#ff9a2e33';g.fillRect(x,0,w,H);g.strokeStyle='#ff9a2e';g.lineWidth=2;g.strokeRect(x+1,1,w-2,H-2)}
let kbMapDrag=null;
kbMap.addEventListener('pointerdown',e=>{e.preventDefault();kbMap.setPointerCapture(e.pointerId);kbMapDrag=e.pointerId;kbMapMove(e)});
kbMap.addEventListener('pointermove',e=>{if(kbMapDrag===e.pointerId)kbMapMove(e)});
['pointerup','pointercancel'].forEach(n=>kbMap.addEventListener(n,()=>{kbMapDrag=null}));
function kbMapMove(e){const r=kbMap.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1),total=kbWhites().length*state.kbKeyW;kbArea.scrollLeft=f*total-kbArea.clientWidth/2}
let kbSq=false;kbArea.addEventListener('scroll',()=>{if(kbSq)return;kbSq=true;requestAnimationFrame(()=>{kbSq=false;kbUpdateLabel();drawKbMap()})},{passive:true});
function shiftOctave(d){state.octave=clamp(state.octave+d,0,7);kbFirst=(state.octave+1)*12;kbScrollTo(state.octave);save()}
function kbZoom(d){const mid=(kbArea.scrollLeft+kbArea.clientWidth/2)/state.kbKeyW;state.kbKeyW=clamp(state.kbKeyW+d,24,90);drawKeyboard();kbArea.scrollLeft=mid*state.kbKeyW-kbArea.clientWidth/2;save()}
$('#kb-zin').onclick=()=>kbZoom(8);$('#kb-zout').onclick=()=>kbZoom(-8);
$('#octave-down').onclick=()=>shiftOctave(-1);$('#octave-up').onclick=()=>shiftOctave(1);
$('#kb-opts').addEventListener('click',e=>{const b=e.target.closest('[data-opt]');if(!b)return;state[b.dataset.opt]=!state[b.dataset.opt];save();drawKeyboard();
 const msg={kbShowScale:['Toonladder op het klavier','uit'],kbLock:['Alleen noten uit de toonladder','uit'],kbChordMode:[`Akkoordmodus: elke toets speelt een ${chordType(state.chType)[1]||'majeur'}-akkoord`,'Akkoordmodus uit']}[b.dataset.opt];
 if(msg)toast(state[b.dataset.opt]?msg[0]:(msg[1]==='uit'?msg[0]+' uit':msg[1]),null,1800)});

/* Toetsen bespelen (met glijden, toonladder-slot en akkoordmodus) */
const kb=$('#keyboard');
const kbNote=n=>state.kbLock?snapToScale(n,TH.root,TH.scale):n;
function kbPress(id,n,vel){if(state.kbChordMode){const ns=chordNotes(n,state.chType,state.chVoicing);KS.chordPtr.set(id,ns);ns.forEach(x=>instNoteOn(x,vel));stepInsert(ns,null);return}
 kbPointers.set(id,{note:n});instNoteOn(n,vel)}
function kbLift(id){const ch=KS.chordPtr.get(id);if(ch){KS.chordPtr.delete(id);ch.forEach(x=>instNoteOff(x));return}const p=kbPointers.get(id);if(!p)return;kbPointers.delete(id);if(p.note!=null&&!kbHeldNotes().has(p.note))instNoteOff(p.note)}
kb.addEventListener('pointerdown',e=>{const k=e.target.closest('[data-note]');if(!k)return;e.preventDefault();try{kb.setPointerCapture(e.pointerId)}catch(x){}kbPress(e.pointerId,kbNote(+k.dataset.note),keyVel(e,k))});
kb.addEventListener('pointermove',e=>{if(KS.chordPtr.has(e.pointerId))return;const p=kbPointers.get(e.pointerId);if(!p)return;const k=keyAt(e.clientX,e.clientY);const n=k?kbNote(+k.dataset.note):null;if(n===p.note)return;
 const old=p.note;p.note=n;if(old!=null&&!kbHeldNotes().has(old))instNoteOff(old);if(n!=null)instNoteOn(n,keyVel(e,k))});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>kb.addEventListener(ev,e=>kbLift(e.pointerId)));
kb.addEventListener('contextmenu',e=>e.preventDefault());
function keyAt(x,y){const el=document.elementFromPoint(x,y);return el&&el.closest?el.closest('#keyboard [data-note]'):null}
function keyVel(e,k){if(e.pointerType==='pen'&&e.pressure>0)return clamp(Math.round(e.pressure*100+27),20,127);if(state.full)return 127;
 if(state.velMode==='pos'){const r=k.getBoundingClientRect();return Math.round(45+clamp((e.clientY-r.top)/r.height,0,1)*82)}return 105}

/* ---------- Akkoorden & toonladders ---------- */
const chordRootMidi=pc=>(state.octave+1)*12+pc;
function renderTheory(){
 $('#th-root').innerHTML=NOTE_NAMES.map((n,i)=>`<button class="chip${i===TH.root?' active':''}" data-root="${i}">${n}</button>`).join('');
 $('#th-scale').innerHTML=optionsHTML(SCALES,TH.scale,3);$('#th-voicing').innerHTML=optionsHTML(VOICINGS,state.chVoicing);
 $('#th-dur').innerHTML=DURATIONS.map(([k])=>`<option${k===state.chDur?' selected':''}>${k}</option>`).join('');
 $$('#th-groups .chip').forEach(c=>c.classList.toggle('active',c.dataset.grp===state.chGroup));
 $('#th-step').classList.toggle('active',state.stepIns);
 const box=$('#chords');let h='';const r=TH.root;
 if(state.chGroup==='std'||state.chGroup==='jazz')for(const [id,,iv,g] of CHORD_TYPES){if(g!==state.chGroup)continue;h+=`<button data-ch="${r}:${id}" class="${id===state.chType?'cur':''}" title="${iv.length} noten">${chordName(r,id)}</button>`}
 else if(state.chGroup==='key'){const d7=diatonic(r,TH.scale,true),d3=diatonic(r,TH.scale,false);
  if(!d7.length)h='<p class="hint">Diatonische akkoorden werken met toonladders van 7 noten (bijv. majeur, mineur, dorisch).</p>';
  else{h+='<div class="ch-sub">Vierklanken</div>'+d7.map(c=>`<button data-ch="${c.root}:${c.type}"><small>${c.roman}</small>${chordName(c.root,c.type)}</button>`).join('');
   h+='<div class="ch-sub">Drieklanken</div>'+d3.map(c=>`<button data-ch="${c.root}:${c.type}"><small>${c.roman}</small>${chordName(c.root,c.type)}</button>`).join('')}}
 else{const d=diatonic(r,TH.scale,true);if(!d.length)h='<p class="hint">Kies een toonladder van 7 noten voor progressies.</p>';
  else h+=PROGRESSIONS.map(([name,deg],i)=>`<button data-prog="${i}" class="prog"><small>${name}</small>${deg.slice(0,4).map(x=>chordName(d[x].root,d[x].type)).join(' – ')}${deg.length>4?' …':''}</button>`).join('')}
 box.innerHTML=h;
 const sc=scaleOf(TH.scale);$('#th-notes').textContent=sc[2].map(i=>NOTE_NAMES[(r+i)%12]).join(' · ');
 $('#th-key').textContent=`${NOTE_NAMES[r]} ${sc[1]}`;stepLabel()}
function stepLabel(){const el=$('#th-pos');if(!el)return;if(!state.stepIns){el.textContent='';return}syncCursor();const t=KS.cursor,bar=Math.floor(t/BAR)+1,beat=Math.floor(t%BAR/PPQ)+1,s16=Math.floor(t%PPQ/T16)+1;el.textContent=`→ invoegen op ${bar}.${beat}.${s16}`}
function syncCursor(){if(KS.cursor==null||song.locate!==KS.lastLocate){KS.cursor=song.locate;KS.lastLocate=song.locate}}

/* Stap-invoer: noten in de open notenclip zetten (of een nieuwe clip maken) en de cursor de gekozen duur opschuiven */
function stepTarget(){let t=typeof edTrack==='function'?edTrack():null;if(t&&t.type==='inst')return t;
 const tr=recInstTrack()||song.tracks.find(x=>x.type==='inst');if(!tr)return null;syncCursor();const st=Math.floor(KS.cursor/BAR)*BAR;
 let c=tr.clips.find(x=>x.kind==='notes'&&x.start<=KS.cursor&&x.start+x.len>KS.cursor);
 if(!c){c={id:newClipId(),kind:'notes',nt:'inst',start:st,len:BAR*4,cLen:BAR*4,off:0,mute:false,name:`${tr.name} akkoorden`,events:[]};tr.clips.push(c);rebuildFlat(tr)}
 edOpenClip(tr,c,true);return edTrack()}
function stepInsert(notes,dur,advance=true){if(!state.stepIns||!notes.length)return;const t=stepTarget();if(!t){toast('Maak eerst een instrumentspoor in de Playlist');return}
 syncCursor();dur=dur||durTicks(state.chDur);pushHistory();const rel=Math.max(0,KS.cursor-t._clip.start);
 for(const n of notes)t.events.push([rel,1,clamp(n,PR_LO,PR_HI),100,dur]);trackEdited(t);
 if(advance){KS.cursor+=dur;KS.lastLocate=song.locate}stepLabel()}

/* Akkoord spelen: vasthouden = klinkt door; korte tik = speelt de gekozen duur */
function playNotesTimed(notes,startSec,durSec,vel=96,strum=0){const ac=ensureAudio(),tg=liveInstTarget();
 notes.forEach((n,i)=>{const at=ac.currentTime+startSec+i*strum;const v=makeVoice(ac,tg.dest,n,vel,at,tg.inst);v.release(at+Math.max(.08,durSec*.96));
  const id=setTimeout(()=>{const k=$(`#keyboard [data-note="${n}"]`);if(k){k.classList.add('held');setTimeout(()=>k.classList.remove('held'),Math.max(80,durSec*900))}},(startSec+i*strum)*1000);KS.seqTimers.push(id);
  midiSend({type:'note',note:n,velocity:vel,channel:tg.ch,delay_ms:Math.round((startSec+i*strum)*1000),duration_ms:Math.round(durSec*960)})})}
const tickSec=tk=>tk/PPQ*60/state.bpm;
function stopSeq(){KS.seqTimers.forEach(clearTimeout);KS.seqTimers=[]}
const chHeld=new Map();
$('#chords').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-ch],[data-prog]');if(!b)return;e.preventDefault();ensureAudio();
 if(b.dataset.prog!=null){playProgression(+b.dataset.prog);return}
 const [pc,id]=b.dataset.ch.split(':'),notes=chordNotes(chordRootMidi(+pc),id,state.chVoicing),strum=['guitar','pluck'].includes(liveInstTarget().inst);
 state.chType=id;$$('#chords [data-ch]').forEach(x=>x.classList.toggle('cur',x===b));save();
 try{b.setPointerCapture(e.pointerId)}catch(x){}const timers=[];notes.forEach((n,i)=>{if(strum&&i)timers.push(setTimeout(()=>instNoteOn(n,92),i*22));else instNoteOn(n,96)});
 b.classList.add('held');chHeld.set(e.pointerId,{b,notes,timers,t0:performance.now()});$('#th-now').textContent=b.textContent.replace(/^[ivxIVX°]+(?=[A-G])/,'');stepInsert(notes)});
const chRelease=e=>{const h=chHeld.get(e.pointerId);if(!h)return;chHeld.delete(e.pointerId);h.b.classList.remove('held');
 const left=tickSec(durTicks(state.chDur))*1000-(performance.now()-h.t0),off=()=>{h.timers.forEach(clearTimeout);h.notes.forEach(n=>instNoteOff(n))};
 if(performance.now()-h.t0<220&&left>0)setTimeout(off,Math.min(left,4000));else off()};
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>$('#chords').addEventListener(ev,chRelease));
function playProgression(i){const [name,deg]=PROGRESSIONS[i],d=diatonic(TH.root,TH.scale,true);if(!d.length)return;stopSeq();const dur=durTicks(state.chDur),ds=tickSec(dur);
 deg.forEach((x,k)=>{const c=d[x],notes=chordNotes(chordRootMidi(c.root),c.type,state.chVoicing);playNotesTimed(notes,k*ds+.03,ds,92);stepInsert(notes,dur)});
 toast(`${name}: ${deg.length} akkoorden van ${state.chDur}`,null,2000)}
function playScale(){const dir=$('#th-dir').value,oct=+$('#th-oct').value,notes=scaleRun(chordRootMidi(TH.root),TH.scale,oct,dir),dur=durTicks(state.chDur),ds=tickSec(dur);stopSeq();
 notes.forEach((n,k)=>{playNotesTimed([n],k*ds+.03,ds,96);stepInsert([n],dur)})}

$('#th-root').addEventListener('click',e=>{const b=e.target.closest('[data-root]');if(!b)return;state.thRoot=+b.dataset.root;save();renderTheory();drawKeyboard();if(typeof drawEd==='function')drawEd()});
$('#th-scale').onchange=e=>{state.thScale=e.target.value;save();renderTheory();drawKeyboard();if(typeof drawEd==='function')drawEd()};
$('#th-voicing').onchange=e=>{state.chVoicing=e.target.value;save()};
$('#th-dur').onchange=e=>{state.chDur=e.target.value;save()};
$('#th-groups').addEventListener('click',e=>{const b=e.target.closest('[data-grp]');if(!b)return;state.chGroup=b.dataset.grp;save();renderTheory()});
$('#th-step').onclick=()=>{state.stepIns=!state.stepIns;KS.cursor=null;save();renderTheory();
 toast(state.stepIns?'Stap-invoer aan: akkoorden en toonladders komen in de piano roll (bij de gele startmarkering), elk in de gekozen duur':'Stap-invoer uit',null,3500)};
$('#th-play').onclick=playScale;$('#th-stop').onclick=()=>{stopSeq();[...activeSynth.keys()].forEach(n=>instNoteOff(n,true))};
$('#th-back').onclick=()=>{syncCursor();KS.cursor=Math.max(0,KS.cursor-durTicks(state.chDur));stepLabel()};
window.addEventListener('resize',()=>{if(currentTab==='keys')drawKbMap()});
