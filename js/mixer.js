'use strict';
/* =====================================================================
   Mixer zoals FL Studio: Master + inserts met fader, pan, mute/solo,
   VU-meter en FX (EQ, compressor, reverb/delay-send).
   Playlist-sporen sturen naar een insert (t.insert, 0 = master).
   Live ingespeelde pads/klavier gaan via het gearmde spoor → insert.
   ===================================================================== */
const N_INSERTS=32;
const mkInsert=i=>({id:i,name:`Insert ${i}`,vol:80,pan:0,mute:false,solo:false,fx:FX_DEFAULT()});
function freshInserts(){return Array.from({length:N_INSERTS},(_,k)=>mkInsert(k+1))}
function sanitizeInserts(arr,tracks){const out=freshInserts();
 if(Array.isArray(arr))for(const x of arr){const i=x&&+x.id;if(!(i>=1&&i<=N_INSERTS))continue;const s=out[i-1];
  s.name=String(x.name||s.name).slice(0,16);s.vol=clamp(Number(x.vol??80),0,125);s.pan=clamp(Number(x.pan??0),-100,100);s.mute=!!x.mute;s.solo=!!x.solo;s.fx=x.fx;fxOf(s)}
 else for(const t of tracks){/* migratie: oude spoor-FX naar de insert van dat spoor */if(t.insert>=1&&t.insert<=N_INSERTS&&t.fx){out[t.insert-1].fx=t.fx;fxOf(out[t.insert-1]);out[t.insert-1].name=t.name.slice(0,16)}}
 return out}
const insById=id=>song.inserts&&song.inserts[id-1]||null;
const anySoloIns=()=>song.inserts.some(s=>s.solo);
const insAudible=s=>!s.mute&&(!anySoloIns()||s.solo);
const insGainVal=s=>insAudible(s)?s.vol/100:0;
const dbStr=v=>v<=0?'-∞':((20*Math.log10(v/100))>=0?'+':'')+(20*Math.log10(v/100)).toFixed(1)+' dB';

/* ---------- Audio ---------- */
function buildInsertChain(c,s,master,meter){const f=fxOf(s),inp=c.createGain();
 const lo=c.createBiquadFilter();lo.type='lowshelf';lo.frequency.value=180;lo.gain.value=f.low;
 const mid=c.createBiquadFilter();mid.type='peaking';mid.frequency.value=f.midF;mid.Q.value=.9;mid.gain.value=f.mid;
 const hi=c.createBiquadFilter();hi.type='highshelf';hi.frequency.value=6000;hi.gain.value=f.high;
 const comp=c.createDynamicsCompressor();setComp(comp,f);
 const g=c.createGain();g.gain.value=insGainVal(s);
 inp.connect(lo);lo.connect(mid);mid.connect(hi);hi.connect(comp);comp.connect(g);
 let end=g,p=null;if(c.createStereoPanner){p=c.createStereoPanner();p.pan.value=s.pan/100;g.connect(p);end=p}end.connect(master);
 let an=null;if(meter){an=c.createAnalyser();an.fftSize=512;end.connect(an)}
 const bus=getBuses(c,master),rs=c.createGain(),ds=c.createGain();rs.gain.value=f.rev/100;ds.gain.value=f.dly/100;end.connect(rs);rs.connect(bus.revIn);end.connect(ds);ds.connect(bus.dlyIn);
 return{inp,lo,mid,hi,comp,g,p,rs,ds,an}}
function buildTrackStrip(c,t,dest){const inp=c.createGain(),g=c.createGain();g.gain.value=trackGainVal(t);inp.connect(g);let end=g,p=null;
 if(c.createStereoPanner){p=c.createStereoPanner();p.pan.value=t.pan/100;g.connect(p);end=p}end.connect(dest);return{inp,g,p,end}}
/* live */
const liveInsertNodes=new Map();let masterAn=null;
function liveInsertIn(id){if(!id||!insById(id))return masterNode;const ac=ensureAudio();if(!ac)return masterNode;let n=liveInsertNodes.get(id);if(!n){n=buildInsertChain(ac,insById(id),masterNode,true);liveInsertNodes.set(id,n)}return n.inp}
function resetLiveInserts(){liveInsertNodes.forEach(n=>{try{n.inp.disconnect();n.g.disconnect();n.p&&n.p.disconnect()}catch(e){}});liveInsertNodes.clear()}
function updateInsertFx(s){const n=liveInsertNodes.get(s.id);if(!n||!ctx)return;const f=fxOf(s),now=ctx.currentTime,st=(prm,v)=>prm.setTargetAtTime(v,now,.02);
 st(n.lo.gain,f.low);st(n.mid.gain,f.mid);st(n.mid.frequency,f.midF);st(n.hi.gain,f.high);setComp(n.comp,f);st(n.rs.gain,f.rev/100);st(n.ds.gain,f.dly/100);if(n.p)st(n.p.pan,s.pan/100)}
function updateInsertGains(){if(!ctx||!song.inserts)return;for(const s of song.inserts){const n=liveInsertNodes.get(s.id);if(!n)continue;n.g.gain.setTargetAtTime(insGainVal(s),ctx.currentTime,.02);if(n.p)n.p.pan.setTargetAtTime(s.pan/100,ctx.currentTime,.02)}}
function rerouteTrack(t){const n=liveTrackNodes.get(t.id);if(!n)return;try{n.end.disconnect()}catch(e){}n.end.connect(liveInsertIn(t.insert))}
/* offline (WAV-export) */
function makeOfflineRouting(off,master){const ins=new Map();const insIn=id=>{if(!id||!insById(id))return master;let n=ins.get(id);if(!n){n=buildInsertChain(off,insById(id),master,false);ins.set(id,n)}return n.inp};
 return{trackIn:t=>buildTrackStrip(off,t,insIn(t.insert)).inp}}

/* ---------- UI ---------- */
const MIX={sel:0};
function renderMixer(){const root=$('#mix-strips');if(!root||!song.inserts)return;root.innerHTML='';
 const strip=(id)=>{const isM=id===0,s=isM?null:insById(id),d=document.createElement('div');d.className='mx'+(isM?' master':'')+(MIX.sel===id?' sel':'');d.dataset.id=id;
  const routed=isM?[]:song.tracks.filter(t=>t.insert===id).map(t=>t.name);
  d.innerHTML=`<div class="mx-name"></div><div class="mx-mid"><canvas class="mx-meter" width="14" height="150"></canvas><input type="range" class="mx-fader" min="0" max="${isM?100:125}" aria-label="Volume"></div>
   <output class="mx-db"></output><input type="range" class="mx-pan" min="-100" max="100" aria-label="Pan"><div class="mx-btns"><button class="tb m" data-a="mute">M</button><button class="tb s" data-a="solo">S</button></div>
   <button class="btn small mx-fx" data-a="fx">FX</button><div class="mx-route"></div>`;
  const nm=d.querySelector('.mx-name');
  if(isM)nm.textContent='MASTER';else{const inp=document.createElement('input');inp.type='text';inp.maxLength=16;inp.value=s.name;inp.onchange=()=>{s.name=inp.value.trim().slice(0,16)||s.name;inp.value=s.name;saveSongSoon()};nm.append(inp);const num=document.createElement('span');num.textContent=id;nm.prepend(num)}
  const fd=d.querySelector('.mx-fader'),db=d.querySelector('.mx-db'),pan=d.querySelector('.mx-pan');
  if(isM){fd.value=state.master;db.textContent=state.master+'%';pan.hidden=true;d.querySelector('.mx-btns').style.visibility='hidden';fd.oninput=()=>{state.master=+fd.value;db.textContent=state.master+'%';if(masterNode)masterNode.gain.setTargetAtTime(state.master/100,ctx.currentTime,.02);save()}}
  else{fd.value=s.vol;db.textContent=dbStr(s.vol);pan.value=s.pan;fd.oninput=()=>{s.vol=+fd.value;db.textContent=dbStr(s.vol);updateInsertGains();saveSongSoon()};fd.ondblclick=()=>{s.vol=80;fd.value=80;db.textContent=dbStr(80);updateInsertGains();saveSongSoon()};
   pan.oninput=()=>{s.pan=+pan.value;updateInsertGains();saveSongSoon()};pan.ondblclick=()=>{s.pan=0;pan.value=0;updateInsertGains();saveSongSoon()};
   const mb=d.querySelector('[data-a=mute]'),sb=d.querySelector('[data-a=solo]');mb.classList.toggle('on',s.mute);sb.classList.toggle('on',s.solo);
   mb.onclick=()=>{s.mute=!s.mute;mb.classList.toggle('on',s.mute);updateInsertGains();saveSongSoon()};sb.onclick=()=>{s.solo=!s.solo;sb.classList.toggle('on',s.solo);updateInsertGains();saveSongSoon()}}
  d.querySelector('.mx-route').textContent=isM?'reverb · delay':(routed.length?'← '+routed.join(', '):'');
  d.querySelector('[data-a=fx]').onclick=()=>{MIX.sel=id;$$('#mix-strips .mx').forEach(x=>x.classList.toggle('sel',+x.dataset.id===id));renderInsertFx()};
  d.addEventListener('pointerdown',e=>{if(e.target.closest('input,button'))return;MIX.sel=id;$$('#mix-strips .mx').forEach(x=>x.classList.toggle('sel',+x.dataset.id===id));renderInsertFx()});
  return d};
 root.append(strip(0));for(const s of song.inserts)root.append(strip(s.id));renderInsertFx();startMeters()}
function renderInsertFx(){const box=$('#mix-fx-body');if(!box)return;box.innerHTML='';const id=MIX.sel;
 const sec=(title)=>{const s=document.createElement('div');s.className='fx-sec';const h=document.createElement('h3');h.textContent=title;s.append(h);box.append(s);return s};
 if(id===0){const mf=masterFx(),m=sec('Master: reverb- en delay-bus');
  m.append(fxSlider('Reverb-lengte',.3,6,.1,mf.revDecay,v=>v.toFixed(1)+' s',v=>{mf.revDecay=v;clearTimeout(renderInsertFx.t);renderInsertFx.t=setTimeout(updateBuses,250);saveSongSoon()}));
  m.append(fxSlider('Reverb-niveau',0,150,1,mf.revLvl,v=>v+'%',v=>{mf.revLvl=v;updateBuses();saveSongSoon()}));
  const dw=document.createElement('label');dw.className='fx-f';dw.innerHTML='<span class="fx-l">Delay-tijd</span><select></select><output></output>';
  const sel=dw.querySelector('select');for(const d of Object.keys(DLY_DIVS))sel.add(new Option(d.replace('D',' punt').replace('T',' triool'),d));sel.value=mf.dlyDiv;sel.onchange=()=>{mf.dlyDiv=sel.value;updateBuses();saveSongSoon()};m.append(dw);
  m.append(fxSlider('Delay-feedback',0,90,1,mf.dlyFb,v=>v+'%',v=>{mf.dlyFb=v;updateBuses();saveSongSoon()}));
  m.append(fxSlider('Delay-niveau',0,150,1,mf.dlyLvl,v=>v+'%',v=>{mf.dlyLvl=v;updateBuses();saveSongSoon()}));return}
 const s=insById(id);if(!s)return;const f=fxOf(s),t=sec(`Insert ${id}: ${s.name}`);
 for(const [k,l,mn,mx,st,fmt] of FX_FIELDS){if(k==='thr')t.append(compToggle(f,()=>{updateInsertFx(s);saveSongSoon()}));t.append(fxSlider(l,mn,mx,st,f[k],fmt,v=>{f[k]=v;updateInsertFx(s);saveSongSoon()}))}
 const rb=document.createElement('button');rb.className='btn small';rb.textContent='FX resetten';rb.onclick=()=>{pushHistory();s.fx=FX_DEFAULT();updateInsertFx(s);renderInsertFx();saveSongSoon()};t.append(rb)}
/* Spoor → insert (in de Playlist onder "Mixer-routing") */
function renderFxPanel(){const box=$('#fx-body');if(!box)return;box.innerHTML='';const t=song.tracks.find(x=>x.id===selTrack);if(!t)return;
 const w=document.createElement('div');w.className='route-row';w.innerHTML='<span></span><select aria-label="Mixer-insert"></select><button class="btn small">Open mixer ☷</button>';
 w.querySelector('span').textContent=`${t.name} →`;const sel=w.querySelector('select');sel.add(new Option('Master',0));for(const s of song.inserts)sel.add(new Option(`${s.id} · ${s.name}`,s.id));sel.value=t.insert||0;
 sel.onchange=()=>{t.insert=+sel.value;rerouteTrack(t);saveSongSoon()};w.querySelector('button').onclick=()=>{MIX.sel=t.insert||0;setTab('mixer')};box.append(w);
 const pw=fxSlider('Pan spoor',-100,100,1,t.pan,v=>v===0?'C':(v<0?'L':'R')+Math.abs(v),v=>{t.pan=v;updateTrackGains();saveSongSoon()});box.append(pw)}
/* VU-meters */
let meterRAF=0;const meterBuf=new Float32Array(512),meterPeak=new Map();
function startMeters(){if(meterRAF)return;if(!masterAn&&ctx&&masterNode){masterAn=ctx.createAnalyser();masterAn.fftSize=512;masterNode.connect(masterAn)}const loop=()=>{meterRAF=0;if(currentTab!=='mixer')return;
  for(const cv of $$('#mix-strips .mx-meter')){const id=+cv.closest('.mx').dataset.id;let an=null;if(id===0)an=masterAn;else{const n=liveInsertNodes.get(id);an=n&&n.an}
   let lvl=0;if(an){an.getFloatTimeDomainData(meterBuf);for(let i=0;i<meterBuf.length;i++){const v=Math.abs(meterBuf[i]);if(v>lvl)lvl=v}}
   const prev=meterPeak.get(id)||0,show=Math.max(lvl,prev*.9);meterPeak.set(id,show);
   const g=cv.getContext('2d'),H=cv.height,W=cv.width,h=Math.min(1,show)*H;g.clearRect(0,0,W,H);g.fillStyle='#0b1018';g.fillRect(0,0,W,H);
   const gr=g.createLinearGradient(0,H,0,0);gr.addColorStop(0,'#8fd14f');gr.addColorStop(.7,'#e6d84f');gr.addColorStop(.92,'#ff6577');g.fillStyle=gr;g.fillRect(2,H-h,W-4,h)}
  meterRAF=requestAnimationFrame(loop)};meterRAF=requestAnimationFrame(loop)}
