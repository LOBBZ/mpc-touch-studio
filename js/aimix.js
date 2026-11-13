'use strict';
/* =====================================================================
   🤖 AI Mix & AI Master
   Analyse: LUFS (ITU-R BS.1770 / EBU R128, K-weging + gating), true peak
   (4× interpolatie rond de pieken), spectrum per terts, crest factor,
   stereocorrelatie. Daarna een beslismodel dat — zoals een mengtechnicus —
   gain staging, EQ (low cut, modder, resonanties, presence, ruimte maken
   tussen kick/bas en zang/keys), compressie, de-essing, saturatie, panning
   en reverb/delay-sends instelt. AI Master meet de mix tegen een
   genre-doelcurve en luidheidsdoel en bouwt EQ → multiband → glue →
   tape → imager → limiter, met de limiter-gain iteratief gemeten tot het
   LUFS-doel is gehaald.
   ===================================================================== */
const AI={busy:false,report:'',ab:null,last:null};
const BANDS3=[25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000];

/* ---------- metingen ---------- */
function biquadCoefs(type,f0,sr,Q,gainDb){const A=Math.pow(10,gainDb/40),w=2*Math.PI*f0/sr,cs=Math.cos(w),sn=Math.sin(w),al=sn/(2*Q);let b0,b1,b2,a0,a1,a2;
 if(type==='hs'){const s=2*Math.sqrt(A)*al;b0=A*((A+1)+(A-1)*cs+s);b1=-2*A*((A-1)+(A+1)*cs);b2=A*((A+1)+(A-1)*cs-s);a0=(A+1)-(A-1)*cs+s;a1=2*((A-1)-(A+1)*cs);a2=(A+1)-(A-1)*cs-s}
 else{b0=(1+cs)/2;b1=-(1+cs);b2=(1+cs)/2;a0=1+al;a1=-2*cs;a2=1-al}
 return[b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]}
function biquadRun(x,c){const [b0,b1,b2,a1,a2]=c,y=new Float32Array(x.length);let x1=0,x2=0,y1=0,y2=0;for(let i=0;i<x.length;i++){const v=x[i],o=b0*v+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=v;y2=y1;y1=o;y[i]=o}return y}
function measureLUFS(buf){const sr=buf.sampleRate,hs=biquadCoefs('hs',1681.974,sr,.7071752,3.99984),hp=biquadCoefs('hp',38.1355,sr,.500327,0);
 const chs=[];for(let c=0;c<Math.min(2,buf.numberOfChannels);c++)chs.push(biquadRun(biquadRun(buf.getChannelData(c),hs),hp));
 const blk=Math.round(sr*.4),hop=Math.round(sr*.1),z=[];for(let s=0;s+blk<=buf.length;s+=hop){let sum=0;for(const d of chs){let a=0;for(let i=s;i<s+blk;i++)a+=d[i]*d[i];sum+=a/blk}z.push(sum)}
 if(!z.length)return -70;const L=v=>-0.691+10*Math.log10(Math.max(1e-12,v));let g=z.filter(v=>L(v)>-70);if(!g.length)return -70;
 const rel=L(g.reduce((a,b)=>a+b,0)/g.length)-10;g=g.filter(v=>L(v)>rel);return g.length?L(g.reduce((a,b)=>a+b,0)/g.length):-70}
function measurePeaks(buf){let pk=0,ss=0,n=0;const chs=[];for(let c=0;c<Math.min(2,buf.numberOfChannels);c++){const d=buf.getChannelData(c);chs.push(d);for(let i=0;i<d.length;i++){const a=Math.abs(d[i]);if(a>pk)pk=a;ss+=d[i]*d[i]}n+=d.length}
 let tp=pk;const lim=pk*.7;for(const d of chs)for(let i=1;i<d.length-2;i++){if(Math.abs(d[i])<lim&&Math.abs(d[i+1])<lim)continue;const y0=d[i-1],y1=d[i],y2=d[i+1],y3=d[i+2];
  for(let k=1;k<4;k++){const t=k/4,v=y1+.5*t*(y2-y0+t*(2*y0-5*y1+4*y2-y3+t*(3*(y1-y2)+y3-y0)));if(Math.abs(v)>tp)tp=Math.abs(v)}}
 const rms=Math.sqrt(ss/Math.max(1,n)),db=v=>20*Math.log10(Math.max(1e-9,v));return{peak:db(pk),tp:db(tp),rms:db(rms),crest:db(pk)-db(rms)}}
function fftInPlace(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
 for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}}
function measureSpectrum(buf,frames=96){const N=4096,sr=buf.sampleRate,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,pow=new Float64Array(N/2),win=new Float32Array(N);
 for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));const re=new Float32Array(N),im=new Float32Array(N);const span=Math.max(0,buf.length-N),step=Math.max(N,Math.floor(span/frames));let used=0;
 for(let s=0;s<=span;s+=step){let e=0;for(let i=0;i<N;i++){const v=(L[s+i]+R[s+i])*.5;re[i]=v*win[i];im[i]=0;e+=v*v}if(e/N<1e-8)continue;fftInPlace(re,im);for(let k=0;k<N/2;k++)pow[k]+=re[k]*re[k]+im[k]*im[k];used++}
 const out=BANDS3.map(fc=>{const lo=fc/Math.pow(2,1/6),hi=fc*Math.pow(2,1/6);let s=0,c=0;for(let k=Math.max(1,Math.floor(lo/sr*N));k<=Math.min(N/2-1,Math.ceil(hi/sr*N));k++){s+=pow[k];c++}return 10*Math.log10(Math.max(1e-12,s/Math.max(1,used)))});
 let cen=0,tot=0;for(let k=1;k<N/2;k++){cen+=k*sr/N*pow[k];tot+=pow[k]}return{bands:out,centroid:tot?cen/tot:1000,silent:!used}}
function measureStereo(buf){if(buf.numberOfChannels<2)return{corr:1,side:-60};const L=buf.getChannelData(0),R=buf.getChannelData(1);let lr=0,ll=0,rr=0,ss=0,mm=0;const st=Math.max(1,Math.floor(L.length/400000));
 for(let i=0;i<L.length;i+=st){lr+=L[i]*R[i];ll+=L[i]*L[i];rr+=R[i]*R[i];const m=(L[i]+R[i])/2,s=(L[i]-R[i])/2;mm+=m*m;ss+=s*s}return{corr:ll&&rr?lr/Math.sqrt(ll*rr):1,side:10*Math.log10(Math.max(1e-12,ss/Math.max(1e-12,mm)))}}
function analyze(buf){const pk=measurePeaks(buf),sp=measureSpectrum(buf);return{lufs:measureLUFS(buf),...pk,...sp,...measureStereo(buf),dur:buf.duration}}
const bandAvg=(a,f0,f1)=>{let s=0,c=0;BANDS3.forEach((f,i)=>{if(f>=f0&&f<=f1){s+=a.bands[i];c++}});return c?s/c:-120};
function loudestWindow(buf,sec=30){const sr=buf.sampleRate,w=Math.min(buf.length,Math.floor(sec*sr)),d=buf.getChannelData(0),hop=Math.floor(sr);let best=0,bv=-1;
 for(let s=0;s+w<=buf.length;s+=hop*4){let e=0;for(let i=s;i<s+w;i+=64)e+=d[i]*d[i];if(e>bv){bv=e;best=s}}return{start:best,len:w}}
function sliceBuffer(buf,start,len){const c=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(buf.numberOfChannels,1,buf.sampleRate),b=c.createBuffer(buf.numberOfChannels,len,buf.sampleRate);
 for(let ch=0;ch<buf.numberOfChannels;ch++)b.getChannelData(ch).set(buf.getChannelData(ch).subarray(start,start+len));return b}
/* Een buffer door een slot-keten sturen (snel: geen sporen opnieuw renderen) */
async function processThrough(buf,slots,pre=0){const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,off=new OAC(2,buf.length,buf.sampleRate);await loadWorklets(off);
 const src=off.createBufferSource(),g=off.createGain();src.buffer=buf;g.gain.value=dB(pre);const ch=buildSlotChain(off,slots,false);src.connect(g);g.connect(ch.inp);ch.out.connect(off.destination);src.start(0);return renderOffline(off)}

/* ---------- rollen ---------- */
const ROLE_NAMES={drums:'Drums',bass:'Bas',vocal:'Zang',lead:'Lead',keys:'Keys',pad:'Pad/strijkers',other:'Overig'};
const ROLE_OFFSET={drums:0,bass:-1.5,vocal:1,lead:-3,keys:-4.5,pad:-7,other:-5};
function roleOf(t,a){const n=t.name.toLowerCase();
 if(/zang|vocal|vox|rap|stem|lead ?voc|koor/.test(n))return 'vocal';if(/kick|drum|beat|perc|hat|snare|clap/.test(n))return 'drums';if(/bass|bas\b|808|sub/.test(n))return 'bass';
 if(t.type==='drums')return 'drums';
 if(t.type==='inst'){const i=t.inst;if(['bass','sub808'].includes(i))return 'bass';if(['piano','epiano','organ','guitar'].includes(i))return 'keys';if(['strings','pad','choir'].includes(i))return 'pad';return 'lead'}
 if(a){if(a.centroid<260)return 'bass';if(t.type==='audio')return 'vocal'}return 'other'}

/* ---------- AI Mix ---------- */
function eqFrom(bands){const p=FXT.eq.def();const order=[...bands].slice(0,8);p.bands=order.map(b=>({...eqBand(1000),...b,on:true}));while(p.bands.length<8)p.bands.push(eqBand([60,150,400,1000,2500,6000,12000,18000][p.bands.length]));return p}
function aiSlot(type,p,label){const s=newSlot(type);s.p={...s.p,...p};s.ai=true;s.label=label;return s}
async function aiMix(){if(AI.busy)return;const tr=song.tracks.filter(t=>t.events.length&&!t.mute);if(!tr.length){toast('Er staat nog niets in de playlist om te mixen');return}
 AI.busy=true;aiStatus('Sporen analyseren…');ensureAudio();pushHistory();const rep=[];
 try{
  /* 1. elk spoor een eigen insert */
  const used=new Set(),free=()=>{for(const s of song.inserts)if(!used.has(s.id)&&!song.tracks.some(t=>t.insert===s.id&&!tr.includes(t)))return s.id;return 0};
  for(const t of tr){if(t.insert&&!used.has(t.insert)){used.add(t.insert);continue}const id=free();if(id){t.insert=id;used.add(id)}}
  /* 2. analyseren (max 150 s per spoor) */
  const res=[];let k=0;for(const t of tr){k++;aiStatus(`Analyse ${k}/${tr.length}: ${t.name}…`);
   const buf=await renderMix({tracks:[t],inserts:false,master:false,limiter:false,to:Math.min(150,ticksToSec(songLength())+1),rate:44100});const a=analyze(buf);if(a.silent||a.lufs<-65)continue;res.push({t,a,role:roleOf(t,a)})}
  if(!res.length)throw new Error('alle sporen zijn stil');
  const has=r=>res.some(x=>x.role===r),sameRole={};
  /* 3. beslissen per spoor */
  for(const {t,a,role} of res){const s=insById(t.insert);if(!s)continue;s.slots=(s.slots||[]).filter(x=>!x.ai);if(!s.name||/^Insert \d+$/.test(s.name))s.name=t.name.slice(0,16);
   const acts=[],eq=[],mean=bandAvg(a,200,5000),tilt=f=>-3*Math.log2(f/1000);/* verwacht: −3 dB/oct (roze-achtig) */
   const ex=f=>{const i=BANDS3.findIndex(x=>x>=f);return a.bands[Math.max(0,i)]-(mean+tilt(f))};
   const hpf={vocal:90,keys:110,pad:150,lead:140,drums:28,bass:28,other:100}[role];eq.push({type:'lowcut',f:hpf,slope:role==='drums'||role==='bass'?24:24,q:1});acts.push(`low cut ${fxHz(hpf)}`);
   let mudF=250,mud=-99;for(const f of [200,250,315,400,500])if(ex(f)>mud){mud=ex(f);mudF=f}
   if(mud>2.5&&role!=='bass'){const g=-Math.min(5,(mud-1.5)*.7);eq.push({type:'bell',f:mudF,g:+g.toFixed(1),q:1.2});acts.push(`modder ${fxHz(mudF)} ${g.toFixed(1)} dB`)}
   let resN=0;for(let i=14;i<BANDS3.length-3&&resN<2;i++){const nb=(a.bands[i-2]+a.bands[i-1]+a.bands[i+1]+a.bands[i+2])/4,d=a.bands[i]-nb;if(d>5){const g=-Math.min(4.5,d-2.5);eq.push({type:'bell',f:BANDS3[i],g:+g.toFixed(1),q:4.5});acts.push(`resonantie ${fxHz(BANDS3[i])} ${g.toFixed(1)} dB`);resN++;i+=2}}
   if(role==='vocal'){const pr=ex(3150);if(pr<1){eq.push({type:'bell',f:3400,g:2,q:.9});acts.push('presence +2 dB')}if(ex(10000)<0){eq.push({type:'highshelf',f:11000,g:1.5,q:.7});acts.push('lucht +1,5 dB')}}
   if((role==='keys'||role==='pad')&&has('vocal')){eq.push({type:'bell',f:2600,g:-2,q:1});acts.push('ruimte voor zang −2 dB @ 2,6 kHz')}
   if(role==='bass'){if(has('drums')){eq.push({type:'bell',f:55,g:-1.5,q:1.5});acts.push('ruimte voor kick @ 55 Hz')}eq.push({type:'bell',f:300,g:-2,q:1.1});if(ex(800)<-3){eq.push({type:'bell',f:900,g:1.5,q:1});acts.push('hoorbaarheid op kleine speakers +1,5 dB @ 900 Hz')}}
   if(role==='drums'&&has('bass')){eq.push({type:'bell',f:120,g:-1.5,q:1.4});acts.push('ruimte voor bas @ 120 Hz')}
   if(role==='lead'&&ex(10000)<-2){eq.push({type:'highshelf',f:9000,g:1.5,q:.7})}
   const slots=[aiSlot('eq',eqFrom(eq.slice(0,8)),'AI EQ')];
   /* compressie */
   const C={drums:[3,15,120],bass:[4,8,150],vocal:[3.5,4,90],lead:[2.5,10,140],keys:[2,20,200],pad:[1.8,30,250],other:[2.5,12,150]}[role];
   const thr=clamp(a.rms+Math.max(3,a.crest*.35),-50,-3),ratio=a.crest>18?C[0]+1:a.crest<9?Math.max(1.5,C[0]-1):C[0],mk=+clamp((1-1/ratio)*Math.max(0,a.peak-thr)*.35,0,8).toFixed(1);
   slots.push(aiSlot('comp',{thr:+thr.toFixed(1),ratio,att:C[1],rel:C[2],knee:role==='vocal'?4:8,makeup:mk,mix:role==='drums'?75:100},'AI Comp'));acts.push(`compressie ${ratio}:1 @ ${thr.toFixed(0)} dB`);
   if(role==='vocal'){slots.push(aiSlot('deess',{f:6500,thr:+clamp(a.rms+2,-50,-6).toFixed(1),range:6},'AI De-esser'));acts.push('de-esser')}
   if(role==='bass'){slots.push(aiSlot('sat',{type:'tape',drive:5,mix:35,tone:9000,out:-1.5},'AI Warmte'));acts.push('tape-saturatie (35%)')}
   if(role==='vocal'){slots.push(aiSlot('sat',{type:'tube',drive:3,mix:18,tone:14000,out:-.5},'AI Warmte'))}
   if(role==='drums'&&a.crest<12){slots.push(aiSlot('trans',{att:20,sus:-5,out:0},'AI Punch'));acts.push('transient +20%')}
   if(role==='pad'){slots.push(aiSlot('imager',{width:135,bassMono:150},'AI Breedte'));acts.push('stereo 135%')}
   /* luidheid: alles rond −20 LUFS + rol-offset, zodat de master headroom heeft */
   const want=-20+ROLE_OFFSET[role],delta=want-a.lufs-mk*.5,vol=clamp(Math.round(100*dB(delta)),8,125),rest=delta-20*Math.log10(vol/100);
   if(Math.abs(rest)>.5)slots.unshift(aiSlot('util',{gain:+clamp(rest,-36,24).toFixed(1)},'AI Gain'));
   s.slots=[...s.slots,...slots].slice(0,MAX_SLOTS);s.vol=vol;
   /* pan + sends */
   const n=sameRole[role]=(sameRole[role]||0)+1,centre=['drums','bass','vocal'].includes(role);
   s.pan=centre?0:clamp((n%2?-1:1)*({keys:25,pad:35,lead:15,other:20}[role]+(Math.ceil(n/2)-1)*12),-80,80);
   const f=fxOf(s);f.rev={vocal:18,keys:12,pad:22,lead:12,drums:4,bass:0,other:10}[role];f.dly={vocal:10,lead:8,keys:0,pad:0,drums:0,bass:0,other:4}[role];
   f.low=0;f.mid=0;f.high=0;f.comp=false;
   rep.push({t,role,a,acts,vol,pan:s.pan})}
  resetLiveInserts();song.tracks.forEach(t=>{if(typeof rerouteTrack==='function')rerouteTrack(t)});saveSong();renderMixer();
  AI.report=`<h4>🤖 AI Mix klaar</h4><table class="ai-t"><tr><th>Spoor</th><th>Rol</th><th>Gemeten</th><th>Fader</th><th>Wat er is gedaan</th></tr>${rep.map(r=>`<tr><td>${esc(r.t.name)}</td><td>${ROLE_NAMES[r.role]}</td><td>${r.a.lufs.toFixed(1)} LUFS · crest ${r.a.crest.toFixed(0)} dB</td><td>${dbStr(r.vol)}${r.pan?' · '+(r.pan<0?'L':'R')+Math.abs(r.pan):''}</td><td>${r.acts.join(', ')}</td></tr>`).join('')}</table>
   <p class="hint">Alles staat in de effect-slots van de inserts (gemarkeerd met <b>AI</b>) en is gewoon aan te passen. Niet goed? ↶ Ongedaan zet alles terug. Doe hierna <b>AI Master</b>.</p>`;
  aiStatus('');toast('AI Mix klaar: '+rep.length+' sporen ingesteld')}
 catch(e){console.error(e);aiStatus('');toast('AI Mix mislukt: '+(e.message||e))}finally{AI.busy=false;renderInsertFx()}}

/* ---------- AI Master ---------- */
const MASTER_TARGETS={ref:['Zoals de referentietrack',-14,-1],stream:['Streaming (Spotify/YouTube) −14 LUFS',-14,-1],apple:['Apple Music −16 LUFS',-16,-1],pop:['Pop/R&B −10 LUFS',-10,-1],hiphop:['Hip-hop/trap −9 LUFS',-9,-1],club:['Club/EDM −8 LUFS',-8,-.8],dyn:['Dynamisch (jazz/akoestisch) −16 LUFS',-16,-1.5]};
const GENRE_CURVES={/* dB t.o.v. −4,5 dB/oct, op 20 Hz…16 kHz terts-banden (geïnterpoleerd) */
 balanced:[[30,1],[60,1.5],[120,.5],[300,0],[1000,0],[3000,0],[8000,-.5],[14000,-1.5]],
 hiphop:[[30,3],[60,4],[120,2],[300,-.5],[1000,0],[3000,.5],[8000,0],[14000,-1]],
 edm:[[30,2],[60,3.5],[120,1.5],[300,-1],[1000,0],[3000,1],[8000,1],[14000,0]],
 pop:[[30,1],[60,2],[120,1],[300,-.5],[1000,0],[3000,1],[8000,.5],[14000,0]],
 rnb:[[30,2],[60,3],[120,1.5],[300,0],[1000,0],[3000,0],[8000,-.5],[14000,-1.5]],
 rock:[[30,0],[60,1],[120,1],[300,.5],[1000,.5],[3000,1],[8000,0],[14000,-1]],
 jazz:[[30,-1],[60,0],[120,.5],[300,.5],[1000,0],[3000,-.5],[8000,-1],[14000,-2]]};
const GENRE_NAMES={reference:'📎 Referentietrack',balanced:'Neutraal',hiphop:'Hip-hop / trap',edm:'EDM / dance',pop:'Pop',rnb:'R&B / soul',rock:'Rock',jazz:'Jazz / akoestisch'};
function curveAt(c,f){if(f<=c[0][0])return c[0][1];for(let i=1;i<c.length;i++)if(f<=c[i][0]){const [f0,v0]=c[i-1],[f1,v1]=c[i],t=Math.log(f/f0)/Math.log(f1/f0);return v0+(v1-v0)*t}return c[c.length-1][1]}
async function aiMaster(){if(AI.busy)return;if(!song.tracks.some(t=>t.events.length)){toast('Er staat nog niets in de playlist');return}
 const R=typeof AIC!=='undefined'&&AIC.ref;if((state.aiTarget==='ref'||state.aiGenre==='reference')&&!R){toast('Laad eerst een referentietrack (💬 assistent → 📎)');return}
 AI.busy=true;ensureAudio();pushHistory();const tg=state.aiTarget==='ref'?[`Zoals ${R.name}`,clamp(+R.lufs.toFixed(1),-18,-6),-1]:MASTER_TARGETS[state.aiTarget]||MASTER_TARGETS.stream,curve=state.aiGenre==='reference'?refCurve(R):GENRE_CURVES[state.aiGenre]||GENRE_CURVES.balanced;
 try{const ms=slotsOf('master');for(let i=ms.length-1;i>=0;i--)if(ms[i].ai)ms.splice(i,1);fxStructureChanged('master');
  aiStatus('Mix renderen…');const mix=await renderMix({limiter:false,progress:p=>aiStatus(`Mix renderen… ${p}%`)});aiStatus('Mix meten…');await idle();
  const A=analyze(mix);if(A.lufs<-60)throw new Error('de mix is stil');
  /* tonale balans: verschil met de doelcurve (genormaliseerd op 200 Hz–5 kHz) */
  const mean=bandAvg(A,200,5000),diffAt=f=>{const i=BANDS3.findIndex(x=>x>=f);const meas=A.bands[Math.max(0,i)]-mean+4.5*Math.log2(f/1000);return curveAt(curve,f)-meas};
  const reg=(f0,f1)=>{let s=0,c=0;for(const f of BANDS3)if(f>=f0&&f<=f1){s+=diffAt(f);c++}return c?s/c:0};
  const eq=[{type:'lowcut',f:25,slope:24,q:1}],acts=[],E=(type,f,d,q)=>{const g=+clamp(d*.6,-3.5,3.5).toFixed(1);if(Math.abs(g)>=.5){eq.push({type,f,g,q});acts.push(`${type==='bell'?'':type==='lowshelf'?'low shelf ':'high shelf '}${fxHz(f)} ${fmtDb(g)}`)}};
  E('lowshelf',90,reg(31,125),.7);E('bell',250,reg(160,400),.9);E('bell',900,reg(630,1250),.8);E('bell',3000,reg(2000,5000),.8);E('highshelf',10000,reg(8000,16000),.7);
  const loud=tg[1]>=-10,chain=[aiSlot('eq',eqFrom(eq),'AI Master-EQ')];
  if(loud)chain.push(aiSlot('mb',{lowF:180,highF:3500,lt:+(A.rms+3).toFixed(1),lr:2,lg:0,mt:+(A.rms+4).toFixed(1),mr:1.6,mg:0,ht:+(A.rms+2).toFixed(1),hr:1.8,hg:0,att:20,rel:160},'AI Multiband'));
  chain.push(aiSlot('comp',{thr:+(A.rms+(loud?5:7)).toFixed(1),ratio:loud?2:1.5,att:30,rel:150,knee:10,makeup:0,mix:100},'AI Glue'));
  if(loud||state.aiGenre==='hiphop'||state.aiGenre==='rnb')chain.push(aiSlot('sat',{type:'tape',drive:2.5,mix:30,tone:16000,out:-.5},'AI Tape'));
  const widen=A.corr>.9?15:A.corr>.75?8:A.corr<.3?-15:0;chain.push(aiSlot('imager',{width:100+widen,bassMono:120},'AI Stereo'));
  const lim=aiSlot('limiter',{gain:0,ceil:tg[2],rel:loud?60:120},'AI Limiter');chain.push(lim);
  /* limiter-gain zoeken op het luidste stuk (snel), daarna controleren op de hele song */
  const w=loudestWindow(mix,30),ex=sliceBuffer(mix,w.start,w.len),exL=measureLUFS(ex);let gain=clamp(tg[1]-A.lufs,-6,24),outL=-70;
  for(let it=0;it<4;it++){lim.p.gain=+gain.toFixed(2);aiStatus(`Luidheid afstemmen (${it+1}/4)…`);const o=await processThrough(ex,chain);outL=measureLUFS(o);const err=tg[1]-(outL-(exL-A.lufs));if(Math.abs(err)<.25)break;gain=clamp(gain+err*.9,-12,30)}
  aiStatus('Eindcontrole op de hele song…');const fin=await processThrough(mix,chain),F={lufs:measureLUFS(fin),...measurePeaks(fin)};
  if(Math.abs(F.lufs-tg[1])>.6){lim.p.gain=+clamp(lim.p.gain+(tg[1]-F.lufs),-12,30).toFixed(2);const f2=await processThrough(mix,chain);Object.assign(F,{lufs:measureLUFS(f2),...measurePeaks(f2)})}
  ms.push(...chain.slice(0,MAX_SLOTS-ms.length));fxStructureChanged('master');syncLegacyLimiter();saveSong();
  AI.last={before:A.lufs,after:F.lufs};AI.ab=null;
  AI.report=`<h4>🎛️ AI Master klaar — ${tg[0]}, ${state.aiGenre==='reference'?'klank zoals '+esc(R.name):GENRE_NAMES[state.aiGenre]||'Neutraal'}</h4>
   <div class="ai-meters"><div><b>${A.lufs.toFixed(1)}</b><span>LUFS voor</span></div><div><b>${F.lufs.toFixed(1)}</b><span>LUFS na</span></div><div><b>${A.tp.toFixed(1)}</b><span>dBTP voor</span></div><div><b>${F.tp.toFixed(1)}</b><span>dBTP na</span></div><div><b>${F.crest.toFixed(1)}</b><span>dB dynamiek</span></div><div><b>${A.corr.toFixed(2)}</b><span>stereo-correlatie</span></div></div>
   <p>Keten: EQ (${acts.join(', ')||'geen correctie nodig'}) → ${loud?'multiband → ':''}glue-compressor → ${chain.some(s=>s.type==='sat')?'tape → ':''}stereo ${100+widen}% (bas mono &lt; 120 Hz) → limiter +${lim.p.gain.toFixed(1)} dB, plafond ${tg[2]} dBTP.</p>
   <p class="hint">Vergelijk met <b>A/B</b> (op gelijk volume, zo hoor je de klank en niet alleen ‘harder’). Exporteer met <b>↓ Song als WAV</b> in de Playlist (24-bit staat onder DAW / MIDI).</p>`;
  aiStatus('');toast(`AI Master: ${F.lufs.toFixed(1)} LUFS, ${F.tp.toFixed(1)} dBTP`)}
 catch(e){console.error(e);aiStatus('');toast('AI Master mislukt: '+(e.message||e))}finally{AI.busy=false;renderInsertFx()}}
function aiAB(){const ai=slotsOf('master').filter(s=>s.ai);if(!ai.length){toast('Eerst AI Master uitvoeren');return}const off=ai.every(s=>s.on);ai.forEach(s=>s.on=!off);fxStructureChanged('master');syncLegacyLimiter();
 if(masterNode&&AI.last){const comp=off?dB(AI.last.after-AI.last.before):1;masterNode.gain.setTargetAtTime(state.master/100*comp,ctx.currentTime,.03)}
 AI.ab=off?'B':null;renderInsertFx();toast(off?'B: zonder master (op gelijk volume)':'A: met AI Master',null,1400)}
function syncLegacyLimiter(){if(!window.legacyLim||!ctx)return;const has=slotsOf('master').some(s=>s.on&&s.type==='limiter');legacyLim.threshold.setTargetAtTime(has?0:-6,ctx.currentTime,.02);legacyLim.ratio.setTargetAtTime(has?1:7,ctx.currentTime,.02)}
const idle=()=>new Promise(r=>setTimeout(r,0));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function aiStatus(t){AI.status=t;const el=$('#ai-status');if(el){el.textContent=t;el.hidden=!t}}

/* ---------- paneel ---------- */
function renderAiPanel(box){const w=document.createElement('div');w.className='fx-sec ai-panel';
 w.innerHTML=`<h3>🤖 AI Mix &amp; Master</h3>
  <div class="btn-row"><button class="btn good" id="ai-mix">🤖 AI Mix (alle sporen)</button><button class="btn good" id="ai-master">🎛️ AI Master</button><button class="btn${AI.ab?' active':''}" id="ai-ab">A/B</button><button class="btn small" id="ai-undo">↶ Ongedaan</button></div>
  <div class="btn-row"><label class="small-l">Doel <select class="btn small" id="ai-target">${Object.entries(MASTER_TARGETS).map(([k,v])=>`<option value="${k}"${k===state.aiTarget?' selected':''}>${v[0]}</option>`).join('')}</select></label>
  <label class="small-l">Genre <select class="btn small" id="ai-genre">${Object.entries(GENRE_NAMES).map(([k,v])=>`<option value="${k}"${k===state.aiGenre?' selected':''}>${v}</option>`).join('')}</select></label></div>
  <p class="ai-status" id="ai-status"${AI.status?'':' hidden'}>${AI.status||''}</p><div class="ai-report">${AI.report}</div>`;
 box.append(w);
 w.querySelector('#ai-mix').onclick=aiMix;w.querySelector('#ai-master').onclick=aiMaster;w.querySelector('#ai-ab').onclick=aiAB;w.querySelector('#ai-undo').onclick=()=>{undo();resetLiveInserts();renderMixer()};
 w.querySelector('#ai-target').onchange=e=>{state.aiTarget=e.target.value;save()};w.querySelector('#ai-genre').onchange=e=>{state.aiGenre=e.target.value;save()}}
