'use strict';
/* =====================================================================
   Sampler: eigen instrumenten uit je eigen samples (multi-sample, over het
   hele klavier), trim & fade per pad, kit laden, slepen, WAV-formaat.
   Eigen instrumenten heten 'u:<id>' (in state.instrument en spoor.inst).
   ===================================================================== */
const userInsts=new Map(); // id → {id,name,mode,release,zones:[{root,name,buf,bytes}]}
const BUILTIN_INSTS=[['piano','Piano'],['bass','Bass'],['guitar','Gitaar'],['synth','Synth']];
const validInst=v=>BUILTIN_INSTS.some(([k])=>k===v)||/^u:\w+$/.test(v||'');
function instLabel(v){const b=BUILTIN_INSTS.find(([k])=>k===v);if(b)return b[1];const u=userInsts.get(String(v).slice(2));return u?u.name:'(ontbreekt)'}
function instOptionsHTML(){const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 return BUILTIN_INSTS.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')+[...userInsts.values()].map(u=>`<option value="u:${u.id}">★ ${esc(u.name)}</option>`).join('')}
function renderInstChips(){const box=$('#instrument-picks');if(!box)return;box.innerHTML='';
 const add=(val,label)=>{const b=document.createElement('button');b.className='chip'+(state.instrument===val?' active':'');b.dataset.instrument=val;b.textContent=label;
  b.onclick=()=>{state.instrument=val;$$('#instrument-picks .chip').forEach(x=>x.classList.toggle('active',x===b));renderUserInsts();save()};box.append(b)};
 for(const [k,l] of BUILTIN_INSTS)add(k,l);for(const u of userInsts.values())add('u:'+u.id,'★ '+u.name)}

/* Noot uit bestandsnaam: "Bas_E1", "Rhodes C#3", "piano-Ab4" (C4 = 60) */
function parseRoot(name){const m=/(?:^|[^a-z0-9])([a-g])(#|s|b)?(-?[0-8])(?![0-9])/i.exec(name.replace(/\.[^.]+$/,''));if(!m)return null;
 const pc={c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()]+(m[2]==='#'||m[2]==='s'?1:m[2]==='b'?-1:0);return clamp((+m[3]+1)*12+pc,0,127)}
function pickZone(u,note){let best=null,bd=1e9;for(const z of u.zones){const d=Math.abs(note-z.root)+(note<z.root?.1:0);if(d<bd){bd=d;best=z}}return best}
function makeSamplerVoice(c,dest,note,vel,at,inst){const u=userInsts.get(String(inst).slice(2));if(!u||!u.zones.length)return null;const z=pickZone(u,note);if(!z||!z.buf)return null;
 const s=c.createBufferSource(),g=c.createGain();s.buffer=z.buf;s.playbackRate.value=2**((note-z.root)/12);
 const loud=Math.pow(clamp(vel/127,0,1),1.4)*.9;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(loud,at+.003);
 s.connect(g);g.connect(dest);s.onended=()=>{s.disconnect();g.disconnect()};s.start(at);let stopped=false;
 return{release(t){if(stopped||u.mode==='oneshot')return;stopped=true;t=Math.max(t,at+.01);g.gain.cancelScheduledValues(t);g.gain.setTargetAtTime(0,t,Math.max(.01,u.release/3));try{s.stop(t+u.release*2.5+.05)}catch(e){}}}}

/* Opslag */
async function saveUserInst(u){if(!db)return;try{await dbWrite('uinst:'+u.id,{name:u.name,mode:u.mode,release:u.release,zones:u.zones.map(z=>({root:z.root,name:z.name,bytes:z.bytes}))})}catch(e){toast('Instrument kon niet permanent bewaard worden')}}
async function loadUserInstRecord(key,item){try{const ac=ensureAudio();if(!ac||!item||!Array.isArray(item.zones))return;const id=String(key).slice(6);
 const u={id,name:String(item.name||'Instrument').slice(0,20),mode:item.mode==='oneshot'?'oneshot':'hold',release:clamp(+item.release||.25,.01,3),zones:[]};
 for(const z of item.zones){try{u.zones.push({root:clamp(z.root|0,0,127),name:z.name||'sample',bytes:z.bytes,buf:await decode(ac,z.bytes.slice(0))})}catch(e){}}
 userInsts.set(id,u);renderInstChips();renderUserInsts();if(typeof drawSongUI==='function'&&currentTab==='song')renderHeads()}catch(e){console.warn('Instrument niet geladen',e)}}
async function addZones(u,files){const ac=ensureAudio();let n=0;
 for(const f of [...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))){try{if(f.size>40*1024*1024)throw Error('te groot');const bytes=await f.arrayBuffer();const buf=await decode(ac,bytes.slice(0));
  let root=parseRoot(f.name);if(root==null)root=u.zones.length?clamp(u.zones[u.zones.length-1].root+12,0,127):48;u.zones.push({root,name:f.name.replace(/\.[^.]+$/,'').slice(0,28),bytes,buf});n++}catch(e){toast(`${f.name}: kon niet geladen worden`)}}
 u.zones.sort((a,b)=>a.root-b.root);return n}
async function newUserInst(files){if(!files||!files.length)return;const id=Date.now().toString(36);const first=files[0].name.replace(/\.[^.]+$/,'').replace(/[_\- ]*[a-g][#sb]?-?\d$/i,'').slice(0,20)||'Mijn instrument';
 const u={id,name:first,mode:'hold',release:.25,zones:[]};const n=await addZones(u,files);if(!n)return;userInsts.set(id,u);await saveUserInst(u);
 state.instrument='u:'+id;save();renderInstChips();renderUserInsts();if(currentTab==='song'&&typeof renderHeads==='function')renderHeads();
 toast(`Instrument “${u.name}” gemaakt met ${n} sample${n>1?'s':''} — speel het op het klavier`,null,4000)}
async function deleteUserInst(u){userInsts.delete(u.id);try{await dbDelete('uinst:'+u.id)}catch(e){}if(state.instrument==='u:'+u.id)state.instrument='piano';save();renderInstChips();renderUserInsts();if(typeof renderHeads==='function')renderHeads()}

/* Lijst met eigen instrumenten */
function renderUserInsts(){const box=$('#ui-list');if(!box)return;box.innerHTML='';
 if(!userInsts.size){box.innerHTML='<p class="hint" style="margin:0 0 6px">Nog geen eigen instrumenten.</p>';return}
 const noteOpts=sel=>{let h='';for(let n=12;n<=108;n++)h+=`<option value="${n}"${n===sel?' selected':''}>${noteLabel(n)}</option>`;return h};
 for(const u of userInsts.values()){const d=document.createElement('div');d.className='ui-item'+(state.instrument==='u:'+u.id?' active':'');
  d.innerHTML=`<div class="ui-row"><input type="text" maxlength="20" aria-label="Naam"><button class="btn small" data-a="play">Speel</button></div>
   <div class="ui-row" style="margin-top:6px"><select data-a="mode" aria-label="Afspeelwijze"><option value="hold">Vasthouden</option><option value="oneshot">One-shot</option></select>
   <label class="ed-vel">Release <input type="range" min="0.01" max="3" step="0.01" data-a="rel"><output></output></label></div><div class="zones"></div>
   <div class="ui-row" style="margin-top:6px"><label class="btn small file-btn">＋ Sample<input type="file" multiple accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aif,.aiff,.caf" hidden></label><button class="btn small danger" data-a="del">Verwijder</button></div>`;
  const nm=d.querySelector('input[type=text]');nm.value=u.name;nm.onchange=()=>{u.name=nm.value.trim().slice(0,20)||u.name;saveUserInst(u);renderInstChips();if(typeof renderHeads==='function')renderHeads()};
  const md=d.querySelector('[data-a=mode]');md.value=u.mode;md.onchange=()=>{u.mode=md.value;saveUserInst(u)};
  const rl=d.querySelector('[data-a=rel]'),ro=rl.nextElementSibling;rl.value=u.release;ro.textContent=u.release.toFixed(2)+' s';rl.oninput=()=>{u.release=+rl.value;ro.textContent=u.release.toFixed(2)+' s'};rl.onchange=()=>saveUserInst(u);
  const zs=d.querySelector('.zones');
  u.zones.forEach((z,zi)=>{const r=document.createElement('div');r.className='ui-zone';r.innerHTML=`<span></span><select aria-label="Grondnoot">${noteOpts(z.root)}</select><button class="tb x" title="Sample verwijderen" style="border:0;background:none;color:#ff9ea6">✕</button>`;
   r.querySelector('span').textContent=z.name;const s=r.querySelector('select');s.onchange=()=>{z.root=+s.value;u.zones.sort((a,b)=>a.root-b.root);saveUserInst(u);renderUserInsts()};
   r.querySelector('button').onclick=()=>{u.zones.splice(zi,1);saveUserInst(u);renderUserInsts()};zs.append(r)});
  d.querySelector('[data-a=play]').onclick=()=>{state.instrument='u:'+u.id;renderInstChips();renderUserInsts();save();const ac=ensureAudio();[0,4,7,12].forEach((iv,k)=>{const n=(u.zones[0]?.root??48)+iv;makeSamplerVoice(ac,masterNode,n,100,ac.currentTime+.01+k*.18,'u:'+u.id)?.release(ac.currentTime+.01+k*.18+.5)})};
  d.querySelector('input[type=file]').onchange=async e=>{const n=await addZones(u,e.target.files);e.target.value='';if(n){await saveUserInst(u);renderUserInsts();toast(`${n} sample${n>1?'s':''} toegevoegd`)}};
  const del=d.querySelector('[data-a=del]');del.onclick=()=>confirmTap(del,'Zeker?',()=>deleteUserInst(u));
  box.append(d)}}
$('#ui-new').onchange=async e=>{await newUserInst(e.target.files);e.target.value=''};

/* ---------- Trim & fade per pad ---------- */
const trimPeaks=new WeakMap();
const curTrimKey=()=>slotKey(state.activeBank,selectedPad);
const getTrim=k=>state.trims[k]||{s:0,e:1,fi:0,fo:0};
function renderTrim(){const box=$('#trim-box');if(!box)return;const k=curTrimKey(),buf=sampleBuffers.get(k);box.hidden=!buf;if(!buf)return;
 const t=getTrim(k);$('#trim-fi').value=t.fi||0;$('#trim-fi-v').textContent=(t.fi||0)+' ms';$('#trim-fo').value=t.fo||0;$('#trim-fo-v').textContent=(t.fo||0)+' ms';drawTrim()}
function drawTrim(){const c=$('#trim-wave'),k=curTrimKey(),buf=sampleBuffers.get(k);if(!buf||!c.clientWidth)return;const dpr=window.devicePixelRatio||1,W=c.clientWidth,H=c.clientHeight;
 if(c.width!==Math.round(W*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr)}const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
 let p=trimPeaks.get(buf);if(!p){p=computePeaks(buf);trimPeaks.set(buf,p)}const t=getTrim(k),D=buf.duration,mid=H/2,n=p.length;
 g.fillStyle='#ffb94c';for(let x=0;x<W;x++){const a=Math.floor(x/W*n),b=Math.max(a+1,Math.floor((x+1)/W*n));let m=0;for(let j=a;j<b;j++)if(p[j]>m)m=p[j];const h=Math.max(1,m*(H/2-4));g.fillRect(x,mid-h,1,h*2)}
 const xs=t.s*W,xe=t.e*W;g.fillStyle='#0b121bcc';g.fillRect(0,0,xs,H);g.fillRect(xe,0,W-xe,H);
 const fiW=(t.fi||0)/1000/D*W,foW=(t.fo||0)/1000/D*W;g.strokeStyle='#65dfcf';g.lineWidth=1.5;g.beginPath();g.moveTo(xs,H-2);g.lineTo(xs+fiW,2);g.lineTo(xe-foW,2);g.lineTo(xe,H-2);g.stroke();
 for(const x of [xs,xe]){g.fillStyle='#fff1b2';g.fillRect(x-1,0,2,H);g.fillRect(x-6,0,12,8);g.fillRect(x-6,H-8,12,8)}
 $('#trim-info').textContent=`${(t.s*D).toFixed(3)}–${(t.e*D).toFixed(3)} s van ${D.toFixed(2)} s`}
let trimDrag=null;const trimCv=$('#trim-wave');
trimCv.addEventListener('pointerdown',e=>{const k=curTrimKey();if(!sampleBuffers.get(k))return;e.preventDefault();const r=trimCv.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1),t={...getTrim(k)};
 trimDrag={id:e.pointerId,which:Math.abs(f-t.s)<=Math.abs(f-t.e)?'s':'e',k};try{trimCv.setPointerCapture(e.pointerId)}catch(x){}moveTrim(e)});
function moveTrim(e){if(!trimDrag||e.pointerId!==trimDrag.id)return;const r=trimCv.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1),t={...getTrim(trimDrag.k)};
 if(trimDrag.which==='s')t.s=Math.min(f,t.e-.002);else t.e=Math.max(f,t.s+.002);state.trims[trimDrag.k]=t;drawTrim()}
trimCv.addEventListener('pointermove',moveTrim);
['pointerup','pointercancel'].forEach(n=>trimCv.addEventListener(n,e=>{if(!trimDrag||e.pointerId!==trimDrag.id)return;trimDrag=null;save();triggerPad(state.activeBank,selectedPad)}));
$('#trim-fi').oninput=e=>{const k=curTrimKey();state.trims[k]={...getTrim(k),fi:+e.target.value};$('#trim-fi-v').textContent=e.target.value+' ms';drawTrim();save()};
$('#trim-fo').oninput=e=>{const k=curTrimKey();state.trims[k]={...getTrim(k),fo:+e.target.value};$('#trim-fo-v').textContent=e.target.value+' ms';drawTrim();save()};
$('#trim-reset').onclick=()=>{delete state.trims[curTrimKey()];renderTrim();save()};
$('#trim-play').onclick=()=>triggerPad(state.activeBank,selectedPad);
$('#trim-auto').onclick=()=>{const k=curTrimKey(),buf=sampleBuffers.get(k);if(!buf)return;const d=buf.getChannelData(0),sr=buf.sampleRate;let pk=0;for(let i=0;i<d.length;i+=4){const v=Math.abs(d[i]);if(v>pk)pk=v}
 const thr=Math.max(.004,pk*.03);let a=0,b=d.length-1;while(a<d.length&&Math.abs(d[a])<thr)a++;while(b>a&&Math.abs(d[b])<thr*.5)b--;
 a=Math.max(0,a-Math.round(sr*.002));b=Math.min(d.length,b+Math.round(sr*.03));const t=getTrim(k);state.trims[k]={...t,s:a/d.length,e:b/d.length,fo:t.fo||15};renderTrim();save();triggerPad(state.activeBank,selectedPad);toast('Stilte weggehaald',null,1200)};
window.addEventListener('resize',()=>{if(!$('#trim-box').hidden)drawTrim()});

/* ---------- Kit laden & slepen ---------- */
$('#kit-files').onchange=async e=>{const f=[...e.target.files];e.target.value='';if(f.length===1){await uploadSample(f[0]);return}await loadKit(f,state.activeBank,0)};
const pg=$('#pad-grid');
pg.addEventListener('dragover',e=>{if(!e.dataTransfer||![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';$$('#pad-grid .pad').forEach(p=>p.classList.toggle('drop-hover',p===e.target.closest('.pad')))});
pg.addEventListener('dragleave',e=>{if(!pg.contains(e.relatedTarget))$$('#pad-grid .pad').forEach(p=>p.classList.remove('drop-hover'))});
pg.addEventListener('drop',async e=>{e.preventDefault();$$('#pad-grid .pad').forEach(p=>p.classList.remove('drop-hover'));const files=[...(e.dataTransfer?.files||[])];if(!files.length)return;
 const el=e.target.closest('.pad'),idx=el?+el.dataset.index:0;if(files.length===1){try{const name=await loadSampleInto(state.activeBank,idx,files[0]);selectedPad=idx;drawPads();updateSelected();drawSequencer();drawMixer();save();toast('Sample geladen: '+name)}catch(x){toast('Kon dit audiobestand niet openen')}}
 else await loadKit(files,state.activeBank,idx)});

/* ---------- WAV-formaat ---------- */
$$('.wav-fmt').forEach(s=>{s.value=state.wavFmt;s.onchange=()=>{state.wavFmt=s.value;$$('.wav-fmt').forEach(x=>x.value=s.value);save()}});
