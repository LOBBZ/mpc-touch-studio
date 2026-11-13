'use strict';
/* =====================================================================
   Audiosporen: zang/instrument opnemen via microfoon of audio-interface.
   Clip-events op een audiospoor: [tick, 2, clipId, gain]
   PCM wordt per clip bewaard in IndexedDB (sleutel 'clip:<id>').
   ===================================================================== */
const clips=new Map(); // id → {buf, peaks, dur}
const PEAK_STEP=256;
function computePeaks(buf){const d=buf.getChannelData(0),n=Math.ceil(d.length/PEAK_STEP),p=new Float32Array(n);
 for(let i=0;i<n;i++){let m=0;const end=Math.min(d.length,(i+1)*PEAK_STEP);for(let j=i*PEAK_STEP;j<end;j++){const v=d[j]<0?-d[j]:d[j];if(v>m)m=v}p[i]=m}return p}
function addClip(id,buf){const c={buf,peaks:computePeaks(buf),dur:buf.duration};clips.set(id,c);return c}
const secToTicks=s=>s*state.bpm/60*PPQ;
const clipTicks=id=>{const c=clips.get(id);return c?secToTicks(c.dur):0};
const recAudioTrack=()=>song.tracks.find(t=>t.arm&&t.type==='audio')||null;

async function loadClipRecord(key,item){try{const ac=ensureAudio();if(!ac||!item||!item.pcm)return;const pcm=item.pcm instanceof Float32Array?item.pcm:new Float32Array(item.pcm);
 const buf=ac.createBuffer(1,pcm.length,item.sr||ac.sampleRate);buf.copyToChannel?buf.copyToChannel(pcm,0):buf.getChannelData(0).set(pcm);addClip(String(key).slice(5),buf)}catch(e){console.warn('Clip niet geladen',key,e)}}
async function gcClips(){try{if(!db)return;const used=new Set();for(const t of song.tracks)for(const c of t.clips||[])if(c.kind==='audio')used.add(c.clipId);
 for(const id of [...clips.keys()])if(!used.has(id)){clips.delete(id);await dbDelete('clip:'+id)}}catch(e){}}

/* ---------- Opnemen ---------- */
const rec={stream:null,src:null,proc:null,sink:null,chunks:[],len:0,active:false,startTick:0,trackId:null,level:0};
function micBlockedReason(){if(window.self!==window.top)return'De microfoon werkt niet in de online claude.ai-versie. Gebruik de app uit de zip (Chrome/Edge, iPhone via https, Windows- of Android-app).';
 if(!window.isSecureContext&&location.protocol!=='file:')return'Microfoon vereist https (of localhost).';return''}
async function ensureMic(){if(rec.stream&&rec.stream.active)return true;const why=micBlockedReason();
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast(why||'Microfoon-opname wordt in deze browser niet ondersteund',null,6000);return false}
 try{rec.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});toast('Microfoon klaar — gebruik een koptelefoon om terugkoppeling te voorkomen',null,4000);return true}
 catch(e){toast(why||('Geen toegang tot de microfoon: '+(e.message||e.name)),null,6000);return false}}
function recLatencySec(){if(state.recLatency>=0)return state.recLatency/1000;const c=ctx;let l=(c.baseLatency||0)+(c.outputLatency||0);
 try{const s=rec.stream.getAudioTracks()[0].getSettings();if(s.latency)l+=s.latency;else l+=.012}catch(e){l+=.012}return clamp(l,0,.4)}
function audioRecStart(){const tr=recAudioTrack();if(!tr||!ctx)return;if(!rec.stream||!rec.stream.active){warnNoMic();return}
 rec.src=ctx.createMediaStreamSource(rec.stream);rec.proc=ctx.createScriptProcessor(4096,1,1);rec.sink=ctx.createGain();rec.sink.gain.value=0;
 rec.chunks=[];rec.len=0;rec.active=true;rec.trackId=tr.id;rec.startTick=Math.max(0,songTickAt(ctx.currentTime));
 rec.proc.onaudioprocess=e=>{if(!rec.active)return;const d=e.inputBuffer.getChannelData(0);rec.chunks.push(new Float32Array(d));rec.len+=d.length;let m=0;for(let i=0;i<d.length;i+=16){const v=Math.abs(d[i]);if(v>m)m=v}rec.level=m};
 rec.src.connect(rec.proc);rec.proc.connect(rec.sink);rec.sink.connect(ctx.destination)}
let micWarned=0;function warnNoMic(){if(Date.now()-micWarned>4000){micWarned=Date.now();toast('Het audiospoor is gearmd, maar de microfoon is niet actief. Tik R opnieuw aan.')}}
/* Stopt de opname en geeft het clip-event terug (of null) */
function audioRecStop(){if(!rec.active)return null;rec.active=false;try{rec.src.disconnect();rec.proc.disconnect();rec.sink.disconnect()}catch(e){}
 const total=rec.len,sr=ctx.sampleRate,trim=Math.min(total,Math.round(recLatencySec()*sr)),n=total-trim;
 if(n<sr*.05){rec.chunks=[];return null}
 const pcm=new Float32Array(n);let o=-trim;for(const c of rec.chunks){if(o+c.length>0){const from=Math.max(0,-o);pcm.set(c.subarray(from),Math.max(0,o))}o+=c.length}
 rec.chunks=[];const buf=ctx.createBuffer(1,n,sr);buf.getChannelData(0).set(pcm);
 const id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);addClip(id,buf);
 if(db)dbWrite('clip:'+id,{sr,pcm}).catch(()=>toast('Opname kon niet permanent bewaard worden (opslag vol?)'));
 const tr=song.tracks.find(t=>t.id===rec.trackId);return tr?{tr,ev:[Math.round(rec.startTick),2,id,1]}:null}
function recClipTicks(){return rec.active?secToTicks(rec.len/(ctx?ctx.sampleRate:44100)):0}

/* ---------- Afspelen ---------- */
let songSources=[];
/* e = [tick, 2, clipId, gain, offsetTicks, lengteTicks] */
function playClip(dest,e,t,offset=0){const c=clips.get(e[2]);if(!c||!ctx)return;const o=ticksToSec(e[4]||0)+offset,l=(e[5]!=null?ticksToSec(e[5]):c.dur-(o-offset))-offset;if(o>=c.dur||l<=0.005)return;
 const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=c.buf;g.gain.value=e[3]??1;s.connect(g);g.connect(dest);s.onended=()=>{s.disconnect();g.disconnect()};
 const at=Math.max(t,ctx.currentTime);s.start(at,o,Math.min(l,c.dur-o));if(songSources.length>48)songSources=songSources.filter(x=>x.end>ctx.currentTime);songSources.push({s,end:at+l})}
function stopClipSources(){const now=ctx?ctx.currentTime:0;for(const x of songSources)if(x.end>now)try{x.s.stop()}catch(e){}songSources=[]}
/* Bij starten midden in een clip: speel vanaf de juiste plek */
function startOverlappingClips(t){for(const tr of song.tracks){if(tr.type!=='audio'||!trackAudible(tr))continue;const dest=liveTrackOut(tr);
 for(const e of tr.events){if(e[0]>=songPos)break;const end=e[0]+(e[5]!=null?e[5]:clipTicks(e[2]));if(end>songPos)playClip(dest,e,t,ticksToSec(songPos-e[0]))}}}

/* Clips tekenen (tijdlijn en editor). X: tick → x-positie */
function drawClips(g,ev,y,h,X,t0,t1,color,alpha,selSet,waveOnly){g.globalAlpha=alpha;const W=g.canvas.width/(window.devicePixelRatio||1);
 for(const e of ev){const c=clips.get(e[2]),full=c?secToTicks(c.dur):PPQ,offT=e[4]||0,len=e[5]!=null?e[5]:full-offT;if(e[0]>t1||e[0]+len<t0)continue;
  const x=X(e[0]),w=Math.max(2,X(e[0]+len)-x),top=y+3,hh=h-6;g.fillStyle=color;
  if(!waveOnly){g.fillStyle=color+'30';g.fillRect(x,top,w,hh);g.fillStyle=color;g.fillRect(x,top,w,2)}
  if(c){const n=c.peaks.length,mid=top+hh/2,amp=(hh-6)/2*Math.min(2,e[3]??1),f0=offT/full,f1=(offT+len)/full;
   const a=Math.max(0,Math.floor(-x)),b=Math.min(Math.ceil(w),Math.ceil(W-x));
   for(let i=a;i<b;i++){const p0=Math.floor((f0+(f1-f0)*i/w)*n),p1=Math.max(p0+1,Math.floor((f0+(f1-f0)*(i+1)/w)*n));let m=0;for(let j=p0;j<p1&&j<n;j++)if(c.peaks[j]>m)m=c.peaks[j];const hgt=Math.max(1,m*amp);g.fillRect(x+i,mid-hgt,1,hgt*2)}}
  else{g.fillStyle='#ff6577';g.font='10px system-ui';g.fillText('clip ontbreekt',x+4,top+12)}
  if(selSet&&selSet.has(e)){g.strokeStyle='#fff';g.lineWidth=1.5;g.strokeRect(x+.75,top+.75,w-1.5,hh-1.5)}}
 g.globalAlpha=1}
