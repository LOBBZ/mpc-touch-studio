'use strict';
/* High-end geluiden: echte opgenomen instrumenten (multi-sample, velocity-lagen) en drumkits.
   Bron: VCSL + VSCO-2-CE (CC0, ook commercieel vrij) en eigen ontworpen synth-drums — zie samples/CREDITS.txt.
   Samples worden pas geladen als je ze gebruikt en daarna offline bewaard door de service worker. */
const HQ={manifest:null,mp:null,inst:new Map(),loading:new Map()};
const HQ_FALLBACK={grand:'piano',fmep:'epiano',tsax:'brass',vibes:'bell',marimba:'bell',harp:'pluck',kalimba:'bell',ensemble:'strings',pizz:'pluck',upbass:'bass',trumpet:'brass',horn:'brass',flute:'flute'};
const HQ_GAIN={grand:2,marimba:2,harp:1.5,horn:1.3,flute:1.2,tsax:1.2,fmep:.6};
function hqManifest(){if(!HQ.mp)HQ.mp=fetch('samples/manifest.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(m=>HQ.manifest=m).catch(e=>{HQ.mp=null;throw e});return HQ.mp}
function hqLoad(id){if(HQ.inst.has(id))return Promise.resolve(HQ.inst.get(id));if(HQ.loading.has(id))return HQ.loading.get(id);
 const p=(async()=>{const m=await hqManifest(),d=m.instruments[id];if(!d)throw Error('onbekend instrument '+id);const ac=ensureAudio();
  const zones=await Promise.all(d.zones.map(async z=>{const r=await fetch(`samples/inst/${id}/${z.f}`);if(!r.ok)throw Error('sample ontbreekt: '+z.f);return{root:z.root,v:z.v,buf:await decode(ac,await r.arrayBuffer())}}));
  const vels=[...new Set(zones.map(z=>z.v))].sort((a,b)=>a-b);
  const u={id,name:d.name,mode:d.mode,release:d.release,vels,layers:vels.map(v=>zones.filter(z=>z.v===v).sort((a,b)=>a.root-b.root))};HQ.inst.set(id,u);return u})();
 HQ.loading.set(id,p);p.catch(()=>{}).finally(()=>HQ.loading.delete(id));return p}
/* Alle high-end instrumenten die een lijst nodig heeft (bijv. voor export) eerst laden */
async function hqPreload(list){const ids=[...new Set((list||[]).filter(v=>typeof v==='string'&&v.startsWith('s:')).map(v=>v.slice(2)))];
 await Promise.all(ids.map(id=>hqLoad(id).catch(e=>{console.warn('HQ',id,e)})))}
function hqVoice(c,dest,note,vel,at,inst){const id=String(inst).slice(2),u=HQ.inst.get(id);if(!u){hqLoad(id).catch(()=>{});return null}
 let li=u.vels.findIndex(v=>vel<=v);if(li<0)li=u.vels.length-1;const L=u.layers[li];let z=L[0],bd=1e9;
 for(const q of L){const d=Math.abs(note-q.root)+(note<q.root?.1:0);if(d<bd){bd=d;z=q}}
 const s=c.createBufferSource(),g=c.createGain();s.buffer=z.buf;s.playbackRate.value=2**((note-z.root)/12);
 const lo=u.vels.length>1&&li>0?u.vels[li-1]:0,top=u.vels[li],rel=clamp((vel-lo)/Math.max(1,top-lo),0,1);
 const loud=(.55+.45*rel)*Math.pow(clamp(vel/127,0,1),.55)*.95*(HQ_GAIN[id]||1);
 g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(loud,at+.002);s.connect(g);g.connect(dest);s.onended=()=>{s.disconnect();g.disconnect()};s.start(at);let stopped=false;
 return{release(t){if(stopped||u.mode==='oneshot')return;stopped=true;t=Math.max(t,at+.01);g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(loud,t);g.gain.setTargetAtTime(0,t,Math.max(.02,u.release/3));try{s.stop(t+u.release*3+.05)}catch(e){}}}}
function hqFallback(inst){return HQ_FALLBACK[String(inst).slice(2)]||'piano'}

/* Exports/bounces wachten tot de samples er zijn */
if(typeof renderMix==='function'){const _rm=renderMix;renderMix=async function(o){await hqPreload([state.instrument,...(song&&song.tracks||[]).map(t=>t.inst)]);return _rm(o)}}
/* Gekozen instrumenten alvast op de achtergrond laden */
setInterval(()=>{try{hqPreload([state.instrument,...(typeof song!=='undefined'&&song.tracks||[]).map(t=>t.inst)])}catch(e){}},1500);

/* Drumkits op de pads */
async function hqFillKits(){const sel=$('#hq-kit');if(!sel)return;try{const m=await hqManifest();sel.innerHTML='<option value="">Kies een kit…</option>'+Object.entries(m.kits).map(([k,v])=>`<option value="${k}">${esc(v.name)}</option>`).join('')}catch(e){sel.innerHTML='<option value="">(kits niet beschikbaar offline)</option>'}}
async function hqLoadKit(kit){const m=await hqManifest(),k=m.kits[kit];if(!k)return;const b=state.activeBank;
 const used=k.pads.some((_,i)=>sampleBuffers.has(slotKey(b,i)));if(used&&!confirm(`${k.name} laden op bank ${'ABCD'[b]||b+1}? De huidige samples op deze bank worden vervangen.`))return;
 toast('Kit laden…');let n=0;
 await Promise.all(k.pads.map(async(p,i)=>{try{const r=await fetch(`samples/kits/${kit}/${p.f}`);if(!r.ok)throw 0;const f=new File([await r.blob()],p.name+'.mp3',{type:'audio/mpeg'});await loadSampleInto(b,i,f);n++}catch(e){}}));
 drawPads();updateSelected();drawSequencer();drawMixer();save();toast(`${k.name}: ${n} pads geladen`)}
$('#hq-kit-load')&&($('#hq-kit-load').onclick=()=>{const v=$('#hq-kit').value;if(!v){toast('Kies eerst een kit');return}hqLoadKit(v).catch(e=>toast('Kit laden mislukt: '+e.message))});
hqFillKits();

/* Transport: terugspoelen / pauze / vooruitspoelen (1 maat; in PAT-modus naar begin / volgende maat van het patroon) */
function transportSeek(dir){const wasPlaying=playing;
 if(state.songMode){const cur=wasPlaying?songPlayTick():(paused?songPos:song.locate);
  let t=dir<0?Math.floor((cur-BAR*.15)/BAR)*BAR:(Math.floor(cur/BAR)+1)*BAR;t=Math.max(0,t);
  if(wasPlaying)pauseTransport();setLocate(t);songPos=t;playCounter=Math.round(t/T16);if(wasPlaying){paused=true;startTransport()}}
 else{const len=state.stepLength||16;if(wasPlaying)pauseTransport();
  playCounter=dir<0?0:(Math.floor(playCounter/16)+1)*16%Math.max(16,len);if(wasPlaying)startTransport();else{paused=true;updateTransport()}}
 toast(dir<0?'⏪ Terug':'⏩ Vooruit')}
$('#rew').onclick=()=>transportSeek(-1);$('#fwd').onclick=()=>transportSeek(1);$('#pause').onclick=()=>{if(playing)pauseTransport()};
window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target;if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]'))return;
 if(e.key===','){e.preventDefault();transportSeek(-1)}else if(e.key==='.'){e.preventDefault();transportSeek(1)}});

/* AI-chatassistent standaard verborgen (aan te zetten bij DAW/MIDI) */
function applyAsstVisible(){let on=false;try{on=localStorage.getItem('mpcts-showasst')==='1'}catch(e){}const b=$('#asst-btn');if(b)b.style.display=on?'':'none';const c=$('#show-asst');if(c)c.checked=on;if(!on){const p=$('#asst');if(p)p.hidden=true}}
$('#show-asst')&&($('#show-asst').onchange=e=>{try{localStorage.setItem('mpcts-showasst',e.target.checked?'1':'0')}catch(x){}applyAsstVisible()});
applyAsstVisible();
