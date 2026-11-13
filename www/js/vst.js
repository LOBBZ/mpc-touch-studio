'use strict';
/* =====================================================================
   🔌 VST3 via de bridge (Windows / Mac): je eigen plugins (Pro-Q 4,
   Valhalla, sonible, iZotope, Waves …) laden, hun venster openen op de pc,
   parameters bedienen, instellingen bewaren en sporen of de hele master
   erdoorheen renderen. De AI kan zijn EQ/compressie naar herkenbare
   plugins (zoals Pro-Q / Pro-C) sturen.
   ===================================================================== */
const VST={status:null,list:[],inst:new Map(),open:new Set(),filter:'',busy:false};
const vstBase=()=>(state.vstUrl||'http://127.0.0.1:8765').replace(/\/+$/,'');
async function vstCall(route,body,opt={}){const r=await fetch(vstBase()+route,{method:route==='/vst/status'?'GET':'POST',headers:{'content-type':opt.binary?'application/octet-stream':'application/json','x-pin':state.vstPin||''},body:opt.binary?body:(body?JSON.stringify(body):undefined)});
 if(opt.binary){if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||('HTTP '+r.status));return{buf:await r.arrayBuffer(),frames:+r.headers.get('x-frames'),ch:+r.headers.get('x-channels')||2}}
 const j=await r.json().catch(()=>({error:'Ongeldig antwoord'}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
function vstChain(key){const o=key==='master'?masterFx():insById(key);if(!o)return[];if(!Array.isArray(o.vst))o.vst=[];return o.vst}
async function vstEnsure(key,i){const e=vstChain(key)[i];if(!e)throw new Error('plugin ontbreekt');const k=e.uid||(e.uid=Math.random().toString(36).slice(2,9));let id=VST.inst.get(k);
 if(id){try{await vstCall('/vst/info',{id});return id}catch(x){VST.inst.delete(k)}}
 const r=await vstCall('/vst/load',{path:e.path,name:e.name,state:e.state||null});if(r.choose)throw new Error('kies een plugin uit de bundel');VST.inst.set(k,r.id);e.params=r.params;return r.id}
async function vstConnect(){try{VST.status=await vstCall('/vst/status');if(!VST.status.available){toast('Bridge gevonden, maar VST3 staat uit: installeer pedalboard (zie uitleg)',null,5000)}
  else{const r=await vstCall('/vst/scan');VST.list=r.plugins||[];toast(`Bridge verbonden: ${VST.list.length} plugins gevonden`)}}
 catch(e){VST.status={error:e.message};toast('Geen verbinding met de bridge: '+e.message,null,5000)}renderInsertFx()}

function renderVstPanel(box,key){const w=document.createElement('div');w.className='fx-sec vst-panel';const chain=vstChain(key),st=VST.status;
 const on=st&&st.available;
 w.innerHTML=`<h3>🔌 VST3-plugins <small class="muted">${key==='master'?'master':'insert '+key} · via de bridge op je pc</small></h3>
  <div class="vst-row"><input class="btn small" id="vst-url" style="width:190px" value="${esc(vstBase())}" aria-label="Bridge-adres"><input class="btn small" id="vst-pin" style="width:90px" inputmode="numeric" maxlength="6" placeholder="PIN" value="${esc(state.vstPin||'')}" aria-label="Koppelcode">
   <button class="btn small" id="vst-conn">${on?'↻ Opnieuw zoeken':'Verbinden'}</button><span class="muted">${st?(on?`✅ pedalboard ${esc(st.pedalboard)} · ${VST.list.length} plugins`:`⚠️ ${esc(st.error||'VST3 niet beschikbaar')}`):''}</span></div>
  ${!on?`<p class="hint">Zo werkt het op Windows: start de bridge (<b>bridge\\start_windows.bat</b>, installeert vanzelf <code>pedalboard</code>), vul de PIN in die de bridge toont en klik Verbinden. De plugins draaien op je pc; hun eigen venster opent daar. Op Android/iPhone kan dit alleen als je de app opent via het http-adres van de bridge.</p>`:''}
  ${on?`<div class="vst-row"><input class="btn small" id="vst-q" placeholder="Zoek plugin (Pro-Q, Valhalla, Ozone…)" value="${esc(VST.filter)}" style="flex:1;min-width:160px"><select class="btn small" id="vst-pick" style="max-width:260px"></select><button class="btn small good" id="vst-add">+ Toevoegen</button></div>`:''}
  <div class="vst-chain"></div>
  ${chain.length?`<div class="vst-row">${key==='master'?'<button class="btn good" id="vst-render-master">🎚️ Master door VST3 → WAV</button>':'<button class="btn good" id="vst-freeze">🧊 Insert door VST3 renderen (freeze)</button>'}<span class="muted" id="vst-prog"></span></div>`:''}`;
 box.append(w);
 w.querySelector('#vst-url').onchange=e=>{state.vstUrl=e.target.value.trim();save()};w.querySelector('#vst-pin').onchange=e=>{state.vstPin=e.target.value.trim();save()};
 w.querySelector('#vst-conn').onclick=()=>{state.vstUrl=w.querySelector('#vst-url').value.trim();state.vstPin=w.querySelector('#vst-pin').value.trim();save();vstConnect()};
 if(on){const pick=w.querySelector('#vst-pick'),fill=()=>{const q=VST.filter.toLowerCase();pick.innerHTML='';let g=null,og=null;
   for(const [i,p] of VST.list.entries()){if(q&&!(p.name+' '+p.vendor).toLowerCase().includes(q))continue;if(p.vendor!==g){g=p.vendor;og=document.createElement('optgroup');og.label=g||'Overig';pick.append(og)}og.append(new Option(`${p.name}${p.kind==='AU'?' (AU)':''}`,i))}
   if(!pick.options.length)pick.add(new Option('Niets gevonden',''))};fill();
  w.querySelector('#vst-q').oninput=e=>{VST.filter=e.target.value;fill()};
  w.querySelector('#vst-add').onclick=async()=>{const p=VST.list[+pick.value];if(!p)return;try{let r=await vstCall('/vst/load',{path:p.path});
    if(r.choose){const nm=r.choose.length===1?r.choose[0]:prompt('Deze bundel bevat meerdere plugins. Welke?\n'+r.choose.join('\n'),r.choose[0]);if(!nm)return;r=await vstCall('/vst/load',{path:p.path,name:nm})}
    pushHistory();const e={path:p.path,name:r.name,uid:Math.random().toString(36).slice(2,9),params:r.params};VST.inst.set(e.uid,r.id);chain.push(e);
    const s=await vstCall('/vst/state',{id:r.id}).catch(()=>({}));if(s.state)e.state=s.state;saveSongSoon();renderInsertFx();toast(`${r.name} geladen (${r.params.length} parameters)`)}catch(x){toast('Laden mislukt: '+x.message,null,5000)}}}
 const list=w.querySelector('.vst-chain');
 chain.forEach((e,i)=>{const row=document.createElement('div');row.className='vst-plug';const open=VST.open.has(e.uid);
  row.innerHTML=`<span>${i+1}</span><b>${esc(e.name)}</b>${e.state?'<span class="muted" title="Instellingen opgeslagen in je project">💾</span>':''}<button class="btn small" data-a="ed">🪟 Venster</button><button class="btn small" data-a="pull" title="Huidige instellingen van de plugin in je project bewaren">↻ Ophalen</button><button class="btn small" data-a="par">${open?'▾':'▸'} Parameters</button>${aiTargetable(e)?'<button class="btn small" data-a="ai">🤖 AI → plugin</button>':''}<button class="tb x" data-a="del" aria-label="Verwijderen">✕</button>`;
  row.addEventListener('click',async ev=>{const a=ev.target.closest('[data-a]')?.dataset.a;if(!a)return;try{
   if(a==='ed'){const id=await vstEnsure(key,i);await vstCall('/vst/editor',{id});toast(`Het venster van ${e.name} opent op je pc. Klaar? Klik ↻ Ophalen om de instellingen te bewaren.`,null,5000)}
   if(a==='pull'){const id=await vstEnsure(key,i);const s=await vstCall('/vst/state',{id});if(s.state)e.state=s.state;e.params=(await vstCall('/vst/params',{id})).params;saveSongSoon();renderInsertFx();toast('Instellingen van '+e.name+' bewaard')}
   if(a==='par'){if(open)VST.open.delete(e.uid);else{VST.open.add(e.uid);const id=await vstEnsure(key,i);e.params=(await vstCall('/vst/params',{id})).params}renderInsertFx()}
   if(a==='ai'){await aiToPlugin(key,i)}
   if(a==='del'){pushHistory();const id=VST.inst.get(e.uid);if(id)vstCall('/vst/unload',{id}).catch(()=>{});chain.splice(i,1);saveSongSoon();renderInsertFx()}}
   catch(x){toast(e.name+': '+x.message,null,5000)}});
  list.append(row);if(open&&e.params)list.append(vstParamList(key,i,e))});
 const fz=w.querySelector('#vst-freeze');if(fz)fz.onclick=()=>vstFreeze(key);const rm=w.querySelector('#vst-render-master');if(rm)rm.onclick=vstRenderMaster}
function vstParamList(key,i,e){const d=document.createElement('div');d.className='vst-params';const q=document.createElement('input');q.className='btn small';q.placeholder='Zoek parameter…';q.style.width='100%';d.append(q);
 const box=document.createElement('div');d.append(box);let tm=0;
 const draw=()=>{box.innerHTML='';const f=q.value.toLowerCase();for(const p of e.params.filter(p=>!f||p.name.toLowerCase().includes(f)).slice(0,150)){
   const w=fxSlider(p.name,0,1000,1,Math.round((p.raw??0)*1000),()=>p.text+(p.units&&!String(p.text).endsWith(p.units)?' '+p.units:''),v=>{p.raw=v/1000;clearTimeout(tm);tm=setTimeout(async()=>{try{const id=await vstEnsure(key,i);const r=await vstCall('/vst/set',{id,changes:[{key:p.key,raw:p.raw}]});
     const n=r.params.find(x=>x.key===p.key);if(n){p.text=n.text;const o=w.querySelector('output');if(o)o.textContent=n.text+(n.units&&!String(n.text).endsWith(n.units)?' '+n.units:'')}e.state=null}catch(x){toast(x.message)}},60)});box.append(w)}
  if(e.params.length>150&&!f)box.append(Object.assign(document.createElement('p'),{className:'hint',textContent:`${e.params.length} parameters — zoek om de rest te zien.`}))};
 q.oninput=draw;draw();return d}

/* ---------- AI → plugin (best effort op parameternamen) ---------- */
const PROQ_SHAPE={bell:'Bell',lowshelf:'Low Shelf',highshelf:'High Shelf',lowcut:'Low Cut',highcut:'High Cut',notch:'Notch',bandpass:'Band Pass'};
function aiTargetable(e){const ks=(e.params||[]).map(p=>p.key);return ks.some(k=>/^band_?1_frequency$/.test(k))||ks.some(k=>/threshold/.test(k))}
async function aiToPlugin(key,i){const e=vstChain(key)[i],id=await vstEnsure(key,i),ks=(e.params||[]).map(p=>p.key),slots=key==='master'?slotsOf('master'):slotsOf(key);
 const eq=slots.find(s=>s.type==='eq'&&s.ai)||slots.find(s=>s.type==='eq'),cp=slots.find(s=>s.type==='comp'&&s.ai)||slots.find(s=>s.type==='comp'),ch=[];
 if(ks.some(k=>/^band_?1_frequency$/.test(k))){if(!eq){toast('Doe eerst AI Mix/Master (of zet een Pro EQ in de slots): die EQ wordt naar de plugin gekopieerd');return}
  const us=k=>ks.includes(k)?k:ks.find(x=>x.replace(/_/g,'')===k.replace(/_/g,''));let n=0;
  for(const b of eq.p.bands.filter(b=>b.on).slice(0,24)){n++;const P=f=>us(`band_${n}_${f}`);if(P('used'))ch.push({key:P('used'),value:true});if(P('enabled'))ch.push({key:P('enabled'),value:true});
   if(P('shape'))ch.push({key:P('shape'),value:PROQ_SHAPE[b.type]||'Bell'});ch.push({key:P('frequency'),value:Math.round(b.f)});if(P('gain')&&!b.type.endsWith('cut'))ch.push({key:P('gain'),value:+b.g.toFixed(1)});if(P('q'))ch.push({key:P('q'),value:+b.q.toFixed(2)})}
  eq.on=false;fxStructureChanged(key)}
 else if(cp){const f=re=>ks.find(k=>re.test(k));const m=[[/^threshold/,cp.p.thr],[/^ratio/,cp.p.ratio],[/^attack/,cp.p.att],[/^release/,cp.p.rel],[/^knee/,cp.p.knee],[/make_?up|^output_gain|^gain$/,cp.p.makeup],[/^(dry_wet|mix)/,cp.p.mix]];
  for(const [re,v] of m){const k=f(re);if(k)ch.push({key:k,value:v})}cp.on=false;fxStructureChanged(key)}
 if(!ch.length){toast('Geen bruikbare parameters gevonden in deze plugin');return}
 const r=await vstCall('/vst/set',{id,changes:ch.filter(c=>c.key)});e.params=r.params;const s=await vstCall('/vst/state',{id}).catch(()=>({}));if(s.state)e.state=s.state;saveSongSoon();renderInsertFx();
 toast(`🤖 ${ch.length-r.errors.length} instellingen naar ${e.name} gestuurd${r.errors.length?` (${r.errors.length} niet herkend)`:''}. De ingebouwde ${eq&&!eq.on?'EQ':'compressor'} is uitgezet om dubbel werk te voorkomen.`,null,6000)}

/* ---------- renderen ---------- */
async function vstProcess(key,buf,tail=2,prog){const ids=[];for(let i=0;i<vstChain(key).length;i++)ids.push(await vstEnsure(key,i));
 const ch=buf.numberOfChannels,n=buf.length,pl=new Float32Array(ch*n);for(let c=0;c<ch;c++)pl.set(buf.getChannelData(c),c*n);prog&&prog('door de plugins op je pc…');
 const r=await vstCall(`/vst/process?ids=${ids.join(',')}&ch=${ch}&sr=${buf.sampleRate}&tail=${tail}`,pl.buffer,{binary:true});const f=new Float32Array(r.buf),fr=r.frames,ac=ensureAudio(),out=ac.createBuffer(ch,fr,buf.sampleRate);
 for(let c=0;c<ch;c++)out.getChannelData(c).set(f.subarray(c*fr,(c+1)*fr));return out}
async function vstFreeze(key){if(VST.busy)return;const tr=song.tracks.filter(t=>t.insert===key&&t.events.length&&!t.mute);if(!tr.length){toast('Er stuurt geen (niet-gedempt) spoor naar deze insert');return}
 VST.busy=true;const P=t=>{const el=$('#vst-prog');if(el)el.textContent=t};
 try{P('renderen…');const buf=await renderMix({tracks:tr,master:false,limiter:false,progress:p=>P(`renderen… ${p}%`)});const out=await vstProcess(key,buf,2,P);
  pushHistory();const t=newTrack('audio');t.name=`${insById(key).name} (VST)`.slice(0,20);t.insert=0;for(const x of tr)x.mute=true;brPlaceBuffer(out,t.name,t,0);
  saveSong();drawSongUI();P('');toast(`Gerenderd naar spoor “${t.name}”; de originele sporen zijn gedempt (zet ze terug met M)`,null,5000)}
 catch(e){P('');toast('VST3-render mislukt: '+e.message,null,6000)}finally{VST.busy=false}}
async function vstRenderMaster(){if(VST.busy)return;VST.busy=true;const P=t=>{const el=$('#vst-prog');if(el)el.textContent=t};
 try{P('mix renderen…');const buf=await renderMix({limiter:false,progress:p=>P(`mix renderen… ${p}%`)});const out=await vstProcess('master',buf,1,P);
  const L=measureLUFS(out),T=measurePeaks(out).tp;P(`${L.toFixed(1)} LUFS · ${T.toFixed(1)} dBTP`);
  if(await deliver(encodeWAV(out,wavFmt().bits),`MPC_Touch_Master_VST_${state.bpm}bpm.wav`))toast(`Master via VST3 geëxporteerd: ${L.toFixed(1)} LUFS, ${T.toFixed(1)} dBTP`,null,5000)}
 catch(e){P('');toast('Master-render mislukt: '+e.message,null,6000)}finally{VST.busy=false}}

/* Windows-app (Electron) geeft het adres en de PIN van de meegeleverde bridge mee */
(()=>{try{const q=new URLSearchParams(location.search),b=q.get('bridge'),pin=q.get('pin');if(b&&/^\d{6}$/.test(pin||'')){state.vstUrl=b;state.vstPin=pin;save();
 let n=0;const tryIt=()=>vstCall('/vst/status').then(st=>{VST.status=st;if(st.available)return vstCall('/vst/scan').then(r=>{VST.list=r.plugins||[];if(currentTab==='mixer')renderInsertFx()})}).catch(()=>{if(++n<10)setTimeout(tryIt,1500)});setTimeout(tryIt,1200)}}catch(e){}})();
