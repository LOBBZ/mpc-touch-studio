/* Sample-browser zoals in FL Studio: links een boom met je pads, instrumenten, opnames en eigen bestanden.
   ▶ = beluisteren, → Pad = op de geselecteerde pad zetten, → Playlist = als audioclip op de playlist.
   Op een computer kun je items ook naar de playlist of een pad slepen. */
const BR={open:false,q:'',files:[],folders:{pads:true,inst:false,rec:true,files:true},prev:null};
const brEl={box:$('#browser'),list:$('#br-list'),q:$('#br-q'),btn:$('#br-btn'),files:$('#br-files'),dir:$('#br-dir')};
const brEsc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function brToggle(on=!BR.open){BR.open=on;brEl.box.hidden=!on;document.body.classList.toggle('br-open',on);brEl.btn.classList.toggle('active',on);
 if(on)brRender();setTimeout(()=>{if(typeof layoutTimeline==='function'&&tl.heads){layoutTimeline();drawTimeline()}if(typeof drawEd==='function')drawEd()},30)}

function brStopPreview(){if(BR.prev){try{BR.prev.stop()}catch(e){}BR.prev=null}}
function brPlayBuf(buf){const ac=ensureAudio();if(!ac||!buf)return;brStopPreview();const s=ac.createBufferSource();s.buffer=buf;
 const g=ac.createGain();g.gain.value=.9;s.connect(g);g.connect(typeof masterNode!=='undefined'&&masterNode?masterNode:ac.destination);s.start();s.onended=()=>{if(BR.prev===s)BR.prev=null;try{g.disconnect()}catch(e){}};BR.prev=s}

/* Pad-geluid (eigen sample of ingebouwde drum) offline renderen naar een buffer */
async function brRenderPad(b,i){const ac=ensureAudio(),sr=ac.sampleRate,k=slotKey(b,i),sb=sampleBuffers.get(k);
 const dur=Math.min(30,sb?sb.duration+.05:1.6),off=new OfflineAudioContext(2,Math.ceil(sr*dur),sr);
 const was=state.mutes[k];state.mutes[k]=false;try{soundAt(off,b,i,0,.95,off.destination,0)}finally{if(was)state.mutes[k]=was}
 const buf=await off.startRendering();let end=buf.length;const L=buf.getChannelData(0),R=buf.getChannelData(1);
 while(end>sr*.05&&Math.abs(L[end-1])<1e-4&&Math.abs(R[end-1])<1e-4)end--;
 if(end===buf.length)return buf;const out=ac.createBuffer(2,end,sr);out.getChannelData(0).set(L.subarray(0,end));out.getChannelData(1).set(R.subarray(0,end));return out}

async function brFileBuf(f){if(f.buf)return f.buf;const ac=ensureAudio();f.buf=await decode(ac,await f.file.arrayBuffer());return f.buf}

/* Buffer als nieuwe audioclip op de playlist zetten (stereo blijft stereo) */
function brPlaceBuffer(buf,name,t,tick){const ac=ensureAudio();if(!buf)return;
 const id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);addClip(id,buf);
 if(db){const rec={sr:buf.sampleRate,pcm:new Float32Array(buf.getChannelData(0))};if(buf.numberOfChannels>1)rec.pcmR=new Float32Array(buf.getChannelData(1));dbWrite('clip:'+id,rec).catch(()=>toast('Kon de clip niet permanent bewaren (opslag vol?)'))}
 const len=Math.max(T16,Math.round(secToTicks(buf.duration)));tick=Math.max(0,Math.round((tick??song.locate??0)/T16)*T16);
 if(!t)t=freeTrackFor(tick,tick+len);pushHistory();
 const c={id:newClipId(),kind:'audio',start:tick,len,off:0,clipId:id,gain:1,mute:false,name:String(name||'Sample').slice(0,40)};t.clips.push(c);
 rebuildFlat(t);if(typeof PL!=='undefined'){PL.sel.clear();PL.sel.add(c)}saveSongSoon();drawSongUI();
 toast(`“${c.name}” staat op ${t.name}, maat ${Math.floor(tick/BAR)+1}`);return c}

/* Items van de boom */
function brItems(){const it={pads:[],inst:[],rec:[],files:[]};
 for(let b=0;b<4;b++)for(let i=0;i<16;i++){const k=slotKey(b,i);it.pads.push({src:'pad',key:k,b,i,name:nameFor(b,i),tag:BANKS[b]+String(i+1).padStart(2,'0'),own:sampleBuffers.has(k)})}
 for(const [k,l] of BUILTIN_INSTS)it.inst.push({src:'inst',key:k,name:l,tag:'synth'});
 for(const u of userInsts.values())it.inst.push({src:'inst',key:'u:'+u.id,name:u.name,tag:'★ sampler'});
 const seen=new Set();for(const t of song.tracks)for(const c of t.clips)if(c.kind==='audio'&&clips.has(c.clipId)&&!seen.has(c.clipId)){seen.add(c.clipId);it.rec.push({src:'rec',key:c.clipId,name:c.name||'Opname',tag:clips.get(c.clipId).dur.toFixed(1)+'s'})}
 BR.files.forEach((f,n)=>it.files.push({src:'file',key:String(n),name:f.name,tag:f.path||''}));return it}

const BR_FOLDERS=[['pads','🥁 Pads (A–D)'],['inst','🎹 Instrumenten'],['rec','🎙️ Opnames & clips'],['files','📂 Mijn bestanden']];
function brRender(){if(!BR.open)return;const q=BR.q.trim().toLowerCase(),items=brItems();let h='';
 for(const [f,label] of BR_FOLDERS){let list=items[f];if(q)list=list.filter(x=>(x.name+' '+x.tag).toLowerCase().includes(q));
  const open=BR.folders[f]||!!q;h+=`<button class="br-folder${open?' open':''}" data-folder="${f}">${open?'▾':'▸'} ${label} <small>${list.length}</small></button>`;
  if(!open)continue;
  if(f==='files'&&!BR.files.length)h+=`<div class="br-empty">Tik op <b>+ Bestanden</b> of <b>+ Map</b> hierboven om je eigen samples (wav, mp3, aif, flac…) te bekijken.</div>`;
  if(f==='rec'&&!list.length&&!q)h+=`<div class="br-empty">Nog geen audio-opnames in dit nummer.</div>`;
  for(const x of list){const sel=x.src==='pad'&&x.b===state.activeBank&&x.i===selectedPad,inst=x.src==='inst'&&state.instrument===x.key;
   h+=`<div class="br-item${sel||inst?' cur':''}" draggable="${x.src!=='inst'}" data-src="${x.src}" data-key="${brEsc(x.key)}">
    <button class="br-play" title="Beluisteren" aria-label="Beluister ${brEsc(x.name)}">▶</button>
    <span class="br-name"${x.own?' data-own':''}>${brEsc(x.name)}<small>${brEsc(x.tag)}</small></span>
    ${x.src==='inst'?'<button class="br-act" data-act="inst">Kies</button>':''}
    ${x.src==='pad'?'<button class="br-act" data-act="selpad" title="Deze pad selecteren">Pad</button>':''}
    ${x.src==='file'?'<button class="br-act" data-act="topad" title="Op de geselecteerde pad zetten">→ Pad</button>':''}
    ${x.src!=='inst'?'<button class="br-act" data-act="topl" title="Als audioclip op de playlist (bij de gele startmarkering)">→ Playlist</button>':''}</div>`}}
 brEl.list.innerHTML=h;
 $('#br-target').textContent=`Pad: ${BANKS[state.activeBank]}${String(selectedPad+1).padStart(2,'0')} · Instrument: ${instLabel(state.instrument)}`}

async function brBufferOf(src,key){if(src==='pad'){const [b,i]=key.split(':').map(Number);return brRenderPad(b,i)}
 if(src==='rec'){const c=clips.get(key);return c&&c.buf}if(src==='file')return brFileBuf(BR.files[+key]);return null}
function brNameOf(src,key){if(src==='pad'){const [b,i]=key.split(':').map(Number);return nameFor(b,i)}if(src==='file')return BR.files[+key].name.replace(/\.[^.]+$/,'');
 for(const t of song.tracks)for(const c of t.clips)if(c.clipId===key)return c.name||'Opname';return 'Clip'}

async function brAction(src,key,act){try{ensureAudio();
 if(act==='play'){if(src==='pad'){const [b,i]=key.split(':').map(Number);brStopPreview();const ac=ensureAudio();soundAt(ac,b,i,ac.currentTime,.85,typeof liveDrumDest==='function'?liveDrumDest():masterNode,0);flashPad&&b===state.activeBank&&flashPad(b,i);return}
  if(src==='inst'){const old=state.instrument;state.instrument=key;instNoteOn(60,100,true);setTimeout(()=>{instNoteOff(60,true);state.instrument=old},450);return}
  brPlayBuf(await brBufferOf(src,key));return}
 if(act==='inst'){state.instrument=key;save();if(typeof renderInstChips==='function')renderInstChips();if(typeof drawKeys==='function')drawKeys();brRender();toast('Instrument: '+instLabel(key));return}
 if(act==='selpad'){const [b,i]=key.split(':').map(Number);if(b!==state.activeBank)setBank(b);selectedPad=i;highlightSelected();updateSelected();brRender();return}
 if(act==='topad'){const f=BR.files[+key];const name=await loadSampleInto(state.activeBank,selectedPad,f.file);drawPads();updateSelected();drawSequencer();drawMixer();save();brRender();toast(`${name} → pad ${BANKS[state.activeBank]}${String(selectedPad+1).padStart(2,'0')}`);return}
 if(act==='topl'){const buf=await brBufferOf(src,key);brPlaceBuffer(buf,brNameOf(src,key))}}
 catch(e){console.warn(e);toast('Dat lukte niet: '+(e&&e.message||e))}}

brEl.list.addEventListener('click',e=>{const fo=e.target.closest('.br-folder');if(fo){BR.folders[fo.dataset.folder]=!BR.folders[fo.dataset.folder];brRender();return}
 const it=e.target.closest('.br-item');if(!it)return;const b=e.target.closest('button');
 brAction(it.dataset.src,it.dataset.key,b?(b.dataset.act||'play'):'play')});
brEl.list.addEventListener('dblclick',e=>{const it=e.target.closest('.br-item');if(it&&it.dataset.src!=='inst')brAction(it.dataset.src,it.dataset.key,'topl')});

/* Slepen (computer): naar de playlist = audioclip op die plek, naar een pad = sample op die pad */
brEl.list.addEventListener('dragstart',e=>{const it=e.target.closest('.br-item');if(!it)return;e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-mpcts',JSON.stringify({src:it.dataset.src,key:it.dataset.key}));e.dataTransfer.setData('text/plain',it.textContent.trim())});
const brPayload=e=>{try{return JSON.parse(e.dataTransfer.getData('application/x-mpcts'))}catch(x){return null}};
const brIsOurs=e=>[...(e.dataTransfer?.types||[])].includes('application/x-mpcts');
const brIsFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
tl.canvas.addEventListener('dragover',e=>{if(brIsOurs(e)||brIsFiles(e)){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
tl.canvas.addEventListener('drop',async e=>{if(!brIsOurs(e)&&!brIsFiles(e))return;e.preventDefault();const {x,y}=tlPos(e),t=laneAt(y),tick=tlTick(x);
 try{if(brIsOurs(e)){const p=brPayload(e);if(p&&p.src!=='inst')brPlaceBuffer(await brBufferOf(p.src,p.key),brNameOf(p.src,p.key),t,tick);return}
  let tk=tick;for(const f of [...e.dataTransfer.files].filter(brAudioFile)){const c=brPlaceBuffer(await decode(ensureAudio(),await f.arrayBuffer()),f.name.replace(/\.[^.]+$/,''),t,tk);if(c)tk=c.start+c.len}}
 catch(x){toast('Kon dit niet op de playlist zetten')}});
const brPadGrid=$("#pad-grid");
brPadGrid.addEventListener('dragover',e=>{if((brIsOurs(e)||brIsFiles(e))&&e.target.closest('.pad')){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
brPadGrid.addEventListener('drop',async e=>{const pad=e.target.closest('.pad');if(!pad)return;e.preventDefault();const i=+pad.dataset.index,b=state.activeBank;
 try{let file=null;if(brIsOurs(e)){const p=brPayload(e);if(p&&p.src==='file')file=BR.files[+p.key].file;else if(p&&(p.src==='rec'||p.src==='pad')){const buf=await brBufferOf(p.src,p.key);file=new File([encodeWAV(buf,16)],brNameOf(p.src,p.key)+'.wav',{type:'audio/wav'})}}
  else file=[...e.dataTransfer.files].find(brAudioFile);
  if(!file)return;const name=await loadSampleInto(b,i,file);selectedPad=i;drawPads();updateSelected();drawSequencer();drawMixer();save();brRender();toast(`${name} → pad ${BANKS[b]}${String(i+1).padStart(2,'0')}`)}
 catch(x){toast('Kon dit niet op de pad zetten')}});

const brAudioFile=f=>/^audio\//.test(f.type)||/\.(wav|mp3|ogg|flac|m4a|aif|aiff|caf|opus)$/i.test(f.name);
function brAddFiles(list){const add=[...list].filter(brAudioFile).sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name,undefined,{numeric:true}));
 if(!add.length){toast('Geen audiobestanden gevonden');return}
 for(const f of add){if(f.size>60*1024*1024)continue;BR.files.push({file:f,name:f.name,path:(f.webkitRelativePath||'').split('/').slice(0,-1).join('/'),buf:null})}
 BR.folders.files=true;brRender();toast(`${add.length} bestand${add.length>1?'en':''} in de browser — ▶ om te luisteren`)}
brEl.files.onchange=()=>{brAddFiles(brEl.files.files);brEl.files.value=''};
brEl.dir.onchange=()=>{brAddFiles(brEl.dir.files);brEl.dir.value=''};
$('#br-add').onclick=()=>brEl.files.click();$('#br-add-dir').onclick=()=>brEl.dir.click();
brEl.q.oninput=()=>{BR.q=brEl.q.value;brRender()};
brEl.btn.onclick=()=>brToggle();$('#br-close').onclick=()=>brToggle(false);
document.addEventListener('keydown',e=>{if(e.altKey&&(e.key==='F8'||e.code==='F8')){e.preventDefault();brToggle()}});
