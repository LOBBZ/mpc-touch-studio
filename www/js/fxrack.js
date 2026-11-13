'use strict';
/* =====================================================================
   FX-rek: tot 10 effect-slots per mixer-insert en op de master, zoals in FL.
   Ingebouwde pro-effecten (Web Audio, live én in de WAV-export):
   Pro EQ (8 banden, curve + analyzer) · Compressor · Multiband · Saturator ·
   De-esser · Gate · Transient · Reverb · Delay · Chorus/Flanger · Stereo Imager ·
   Utility · Limiter (lookahead, true-peak plafond)
   ===================================================================== */
const MAX_SLOTS=10;
const WL_URL='js/worklets.js';
const wlReady=new WeakMap();
function loadWorklets(c){if(!c||!c.audioWorklet)return Promise.resolve(false);if(wlReady.has(c))return wlReady.get(c);
 const p=c.audioWorklet.addModule(WL_URL).then(()=>{c._mtsWL=true;return true}).catch(e=>{console.warn('worklets',e);return false});wlReady.set(c,p);return p}
const hasWL=c=>!!(c&&c._mtsWL);
const dB=x=>Math.pow(10,x/20);
const fxHz=v=>v>=1000?(v/1000).toFixed(v>=10000?0:1)+' kHz':Math.round(v)+' Hz';
const fmtDb=v=>(v>0?'+':'')+(+v).toFixed(1)+' dB';
const fmtMs=v=>v>=1000?(v/1000).toFixed(2)+' s':(+v).toFixed(v<10?1:0)+' ms';
const fmtPct=v=>Math.round(v)+'%';

/* --- hulpjes --- */
function wetDry(c,mix){const inp=c.createGain(),out=c.createGain(),dry=c.createGain(),wet=c.createGain();inp.connect(dry);dry.connect(out);wet.connect(out);
 const set=m=>{const w=clamp(m,0,100)/100;dry.gain.value=Math.cos(w*Math.PI/2);wet.gain.value=Math.sin(w*Math.PI/2)};set(mix);return{inp,out,wet,set,dry}}
function lr4(c,type,f){const a=c.createBiquadFilter(),b=c.createBiquadFilter();for(const x of [a,b]){x.type=type;x.frequency.value=f;x.Q.value=Math.SQRT1_2}a.connect(b);return{inp:a,out:b,set:v=>{a.frequency.value=v;b.frequency.value=v}}}
function satCurve(type,drive){const n=2048,cu=new Float32Array(n),k=dB(drive);for(let i=0;i<n;i++){const x=(i/(n-1))*2-1,d=x*k;let y;
  if(type==='tube')y=d>=0?1-Math.exp(-d):-(1-Math.exp(d))*.85;else if(type==='hard')y=Math.max(-1,Math.min(1,d));else if(type==='fuzz')y=Math.sign(d)*(1-Math.exp(-Math.abs(d)*3));else y=Math.tanh(d);
  cu[i]=y/Math.max(.3,Math.tanh(Math.min(k,4)))*.9}return cu}
function makeIR(c,mode,decay,damp){const sr=c.sampleRate,len=Math.max(1,Math.floor(sr*Math.min(10,decay*1.2+.1))),b=c.createBuffer(2,len,sr);
 const M={room:{er:8,erLen:.04,bright:.7},chamber:{er:12,erLen:.06,bright:.75},hall:{er:14,erLen:.09,bright:.8},plate:{er:0,erLen:0,bright:1},vintage:{er:6,erLen:.05,bright:.45,grain:true},cathedral:{er:18,erLen:.14,bright:.6},spring:{er:0,erLen:0,bright:.9,spring:true}}[mode]||{er:10,erLen:.06,bright:.8};
 const dampA=Math.exp(-2*Math.PI*clamp(damp,500,20000)/sr);
 for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let y=0;
  for(let i=0;i<len;i++){const t=i/sr,env=Math.pow(1-i/len,1.6)*Math.exp(-3*t/Math.max(.1,decay));let n=Math.random()*2-1;if(M.grain)n=Math.round(n*24)/24;
   const a=Math.min(.995,dampA+(1-dampA)*(1-M.bright)+t/decay*.25*(1-dampA));y=a*y+(1-a)*n;d[i]=y*env*(M.spring?(1+.6*Math.sin(t*2*Math.PI*9)):1)}
  for(let k=0;k<M.er;k++){const at=Math.floor((.003+Math.random()*M.erLen)*sr);if(at<len)d[at]+=(Math.random()<.5?-1:1)*(.6-k*.03)}
  let pk=0;for(let i=0;i<len;i++)pk=Math.max(pk,Math.abs(d[i]));if(pk>0)for(let i=0;i<len;i++)d[i]/=pk*2.2}
 return b}

/* --- definities: params = [sleutel, label, min, max, stap, formaat, log?] of [sleutel, label, [opties]] --- */
const EQ_TYPES=[['bell','Bell'],['lowshelf','Low shelf'],['highshelf','High shelf'],['lowcut','Low cut'],['highcut','High cut'],['notch','Notch'],['bandpass','Band pass']];
const eqBand=(f,type='bell',on=false,g=0,q=1)=>({on,type,f,g,q,slope:24});
const FXT={
 eq:{name:'Pro EQ',icon:'〰️',def:()=>({bands:[eqBand(40,'lowcut'),eqBand(100,'lowshelf'),eqBand(250),eqBand(600),eqBand(1500),eqBand(4000),eqBand(9000,'highshelf'),eqBand(18000,'highcut')],out:0}),
  build(c,p,live){const inp=c.createGain(),out=c.createGain();let nodes=[],sig='';const an=live?c.createAnalyser():null;if(an){an.fftSize=4096;an.smoothingTimeConstant=.8;out.connect(an)}
   const structure=p=>p.bands.map(b=>b.on?b.type+(b.type.endsWith('cut')?b.slope:''):'-').join(',');
   const apply=p=>{let k=0;for(const b of p.bands){if(!b.on)continue;const n=b.type.endsWith('cut')?Math.max(1,b.slope/12):1;for(let j=0;j<n;j++){const f=nodes[k++];f.frequency.value=clamp(b.f,10,22000);
      if(b.type==='bell'||b.type==='lowshelf'||b.type==='highshelf')f.gain.value=clamp(b.g,-30,30);f.Q.value=b.type.endsWith('cut')?(n===1?b.q*.7071:Math.SQRT1_2):b.type.endsWith('shelf')?clamp(b.q,.1,4)*.7071:clamp(b.q,.05,40)}}out.gain.value=dB(p.out||0)};
   const rebuild=p=>{try{inp.disconnect()}catch(e){}nodes.forEach(n=>{try{n.disconnect()}catch(e){}});nodes=[];let last=inp;
    for(const b of p.bands){if(!b.on)continue;const n=b.type.endsWith('cut')?Math.max(1,b.slope/12):1;for(let j=0;j<n;j++){const f=c.createBiquadFilter();f.type={bell:'peaking',lowcut:'highpass',highcut:'lowpass'}[b.type]||b.type;last.connect(f);last=f;nodes.push(f)}}
    last.connect(out);sig=structure(p);apply(p)};
   rebuild(p);return{inp,out,an,nodes:()=>nodes,set(p){if(structure(p)!==sig)rebuild(p);else apply(p)}}}},
 comp:{name:'Compressor',icon:'🗜️',def:()=>({thr:-18,ratio:4,att:10,rel:120,knee:6,makeup:0,mix:100}),
  params:[['thr','Threshold',-60,0,.5,fmtDb],['ratio','Ratio',1,20,.1,v=>(+v).toFixed(1)+':1'],['att','Attack',.1,200,.1,fmtMs,1],['rel','Release',10,2000,1,fmtMs,1],['knee','Knee',0,30,.5,fmtDb],['makeup','Make-up',-12,24,.5,fmtDb],['mix','Mix (parallel)',0,100,1,fmtPct]],
  build(c,p){const w=wetDry(c,p.mix),cp=c.createDynamicsCompressor(),mk=c.createGain();w.inp.connect(cp);cp.connect(mk);mk.connect(w.wet);
   const set=p=>{cp.threshold.value=p.thr;cp.ratio.value=p.ratio;cp.attack.value=p.att/1000;cp.release.value=p.rel/1000;cp.knee.value=p.knee;mk.gain.value=dB(p.makeup);w.set(p.mix)};set(p);return{inp:w.inp,out:w.out,comp:cp,set}}},
 mb:{name:'Multiband',icon:'📶',def:()=>({lowF:200,highF:3000,lt:-20,lr:2.5,lg:0,mt:-20,mr:2,mg:0,ht:-20,hr:2,hg:0,att:15,rel:150}),
  params:[['lowF','Crossover laag',60,800,1,fxHz,1],['highF','Crossover hoog',1000,10000,10,fxHz,1],['lt','Laag threshold',-50,0,.5,fmtDb],['lr','Laag ratio',1,10,.1,v=>(+v).toFixed(1)+':1'],['lg','Laag gain',-12,12,.5,fmtDb],
   ['mt','Mid threshold',-50,0,.5,fmtDb],['mr','Mid ratio',1,10,.1,v=>(+v).toFixed(1)+':1'],['mg','Mid gain',-12,12,.5,fmtDb],['ht','Hoog threshold',-50,0,.5,fmtDb],['hr','Hoog ratio',1,10,.1,v=>(+v).toFixed(1)+':1'],['hg','Hoog gain',-12,12,.5,fmtDb],['att','Attack',.5,100,.5,fmtMs,1],['rel','Release',20,1000,1,fmtMs,1]],
  build(c,p){const inp=c.createGain(),out=c.createGain(),lo=lr4(c,'lowpass',p.lowF),m1=lr4(c,'highpass',p.lowF),m2=lr4(c,'lowpass',p.highF),hi=lr4(c,'highpass',p.highF);
   inp.connect(lo.inp);inp.connect(m1.inp);m1.out.connect(m2.inp);inp.connect(hi.inp);const bands=[lo.out,m2.out,hi.out].map(src=>{const cp=c.createDynamicsCompressor(),g=c.createGain();src.connect(cp);cp.connect(g);g.connect(out);cp.knee.value=6;return{cp,g}});
   const set=p=>{lo.set(p.lowF);m1.set(p.lowF);m2.set(p.highF);hi.set(p.highF);[['lt','lr','lg'],['mt','mr','mg'],['ht','hr','hg']].forEach(([t,r,g],i)=>{const b=bands[i];b.cp.threshold.value=p[t];b.cp.ratio.value=p[r];b.cp.attack.value=p.att/1000;b.cp.release.value=p.rel/1000;b.g.gain.value=dB(p[g])})};
   set(p);return{inp,out,set,comp:bands[1].cp}}},
 sat:{name:'Saturator',icon:'🔥',def:()=>({type:'tape',drive:6,tone:12000,mix:100,out:-2}),
  params:[['type','Karakter',[['tape','Tape'],['tube','Buis'],['hard','Hard clip'],['fuzz','Fuzz']]],['drive','Drive',0,36,.5,fmtDb],['tone','Toon',1000,20000,10,fxHz,1],['mix','Mix',0,100,1,fmtPct],['out','Output',-24,12,.5,fmtDb]],
  build(c,p){const w=wetDry(c,p.mix),ws=c.createWaveShaper(),lp=c.createBiquadFilter(),og=c.createGain();ws.oversample='4x';lp.type='lowpass';w.inp.connect(ws);ws.connect(lp);lp.connect(og);og.connect(w.wet);
   let key='';const set=p=>{const k=p.type+p.drive;if(k!==key){ws.curve=satCurve(p.type,p.drive);key=k}lp.frequency.value=p.tone;og.gain.value=dB(p.out);w.set(p.mix)};set(p);return{inp:w.inp,out:w.out,set}}},
 deess:{name:'De-esser',icon:'🐍',def:()=>({f:6500,thr:-28,range:8}),
  params:[['f','Frequentie',3000,12000,10,fxHz,1],['thr','Threshold',-60,0,.5,fmtDb],['range','Sterkte',1,20,.5,v=>(+v).toFixed(1)+':1']],
  build(c,p){const inp=c.createGain(),out=c.createGain(),lo=lr4(c,'lowpass',p.f),hi=lr4(c,'highpass',p.f),cp=c.createDynamicsCompressor();inp.connect(lo.inp);inp.connect(hi.inp);lo.out.connect(out);hi.out.connect(cp);cp.connect(out);
   cp.attack.value=.001;cp.release.value=.06;cp.knee.value=3;const set=p=>{lo.set(p.f);hi.set(p.f);cp.threshold.value=p.thr;cp.ratio.value=p.range};set(p);return{inp,out,comp:cp,set}}},
 gate:{name:'Gate',icon:'🚪',wl:true,def:()=>({thr:-45,range:-60,att:1,hold:30,rel:120}),
  params:[['thr','Threshold',-90,0,.5,fmtDb],['range','Bereik',-90,0,1,fmtDb],['att','Attack',.05,50,.05,fmtMs,1],['hold','Hold',0,500,1,fmtMs],['rel','Release',5,2000,1,fmtMs,1]],
  build(c,p){if(!hasWL(c))return passThru(c);const n=new AudioWorkletNode(c,'mts-gate',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
   const set=p=>{const P=n.parameters;P.get('threshold').value=p.thr;P.get('range').value=p.range;P.get('attack').value=p.att;P.get('hold').value=p.hold;P.get('release').value=p.rel};set(p);return{inp:n,out:n,set}}},
 trans:{name:'Transient',icon:'⚡',wl:true,def:()=>({att:30,sus:0,out:0}),
  params:[['att','Attack',-100,100,1,v=>(v>0?'+':'')+Math.round(v)+'%'],['sus','Sustain',-100,100,1,v=>(v>0?'+':'')+Math.round(v)+'%'],['out','Output',-24,24,.5,fmtDb]],
  build(c,p){if(!hasWL(c))return passThru(c);const n=new AudioWorkletNode(c,'mts-transient',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
   const set=p=>{const P=n.parameters;P.get('attack').value=p.att;P.get('sustain').value=p.sus;P.get('output').value=p.out};set(p);return{inp:n,out:n,set}}},
 reverb:{name:'Reverb',icon:'🌌',def:()=>({mode:'hall',decay:2.4,pre:20,damp:7000,lowcut:200,width:100,mix:22}),
  params:[['mode','Ruimte',[['room','Room'],['chamber','Chamber'],['hall','Hall'],['plate','Plate'],['vintage','Vintage (80s)'],['cathedral','Kathedraal'],['spring','Spring']]],['decay','Lengte',.2,10,.05,v=>(+v).toFixed(2)+' s',1],
   ['pre','Pre-delay',0,250,1,fmtMs],['damp','Demping (hoog)',1000,20000,10,fxHz,1],['lowcut','Low cut',20,1000,1,fxHz,1],['width','Breedte',0,200,1,fmtPct],['mix','Mix',0,100,1,fmtPct]],
  build(c,p){const w=wetDry(c,p.mix),pre=c.createDelay(1),cv=c.createConvolver(),hp=c.createBiquadFilter(),wid=imagerNet(c);hp.type='highpass';w.inp.connect(pre);pre.connect(cv);cv.connect(hp);hp.connect(wid.inp);wid.out.connect(w.wet);
   let key='',tm=0;const set=p=>{pre.delayTime.value=p.pre/1000;hp.frequency.value=p.lowcut;wid.set(p.width,0);w.set(p.mix);const k=p.mode+'|'+(+p.decay).toFixed(2)+'|'+Math.round(p.damp);
    if(k!==key){key=k;clearTimeout(tm);const go=()=>{cv.buffer=makeIR(c,p.mode,p.decay,p.damp)};if(c instanceof OfflineAudioContext||!cv.buffer)go();else tm=setTimeout(go,180)}};set(p);return{inp:w.inp,out:w.out,set}}},
 delay:{name:'Delay',icon:'🔁',def:()=>({div:'1/8D',fb:35,ping:true,tone:6000,mix:20}),
  params:[['div','Tijd',Object.keys(typeof DLY_DIVS!=='undefined'?DLY_DIVS:{'1/8':.5}).map(d=>[d,d.replace('D',' punt').replace('T',' triool')])],['fb','Feedback',0,95,1,fmtPct],['ping','Ping-pong',[['true','Aan'],['false','Uit']]],['tone','Toon',500,20000,10,fxHz,1],['mix','Mix',0,100,1,fmtPct]],
  build(c,p){const w=wetDry(c,p.mix),sp=c.createChannelSplitter(2),mg=c.createChannelMerger(2),dl=c.createDelay(4),dr=c.createDelay(4),fl=c.createGain(),fr=c.createGain(),tl=c.createBiquadFilter(),tr=c.createBiquadFilter(),sum=c.createGain(),xl=c.createGain(),xr=c.createGain();
   tl.type=tr.type='lowpass';w.inp.connect(sp);sp.connect(sum,0);sp.connect(sum,1);sum.gain.value=.5;
   sum.connect(dl);dl.connect(tl);tl.connect(mg,0,0);dr.connect(tr);tr.connect(mg,0,1);tl.connect(fl);tr.connect(fr);mg.connect(w.wet);
   const set=p=>{const ping=String(p.ping)==='true',sec=(DLY_DIVS[p.div]||.5)*60/state.bpm;dl.delayTime.value=dr.delayTime.value=Math.min(4,sec);tl.frequency.value=tr.frequency.value=p.tone;fl.gain.value=fr.gain.value=p.fb/100;
    try{fl.disconnect();fr.disconnect()}catch(e){}if(ping){fl.connect(dr);fr.connect(dl);sum.disconnect();sum.connect(dl)}else{fl.connect(dl);fr.connect(dr);sum.disconnect();sum.connect(dl);sum.connect(dr)}w.set(p.mix)};
   set(p);return{inp:w.inp,out:w.out,set}}},
 chorus:{name:'Chorus / Flanger',icon:'🌀',def:()=>({mode:'chorus',rate:.8,depth:3,mix:40,fb:0}),
  params:[['mode','Soort',[['chorus','Chorus'],['flanger','Flanger']]],['rate','Snelheid',.05,8,.01,v=>(+v).toFixed(2)+' Hz',1],['depth','Diepte',.1,10,.1,fmtMs],['fb','Feedback',0,90,1,fmtPct],['mix','Mix',0,100,1,fmtPct]],
  build(c,p){const w=wetDry(c,p.mix),sp=c.createChannelSplitter(2),mg=c.createChannelMerger(2),dl=[c.createDelay(.1),c.createDelay(.1)],lfo=c.createOscillator(),lfo2=c.createOscillator(),dg=[c.createGain(),c.createGain()],fb=[c.createGain(),c.createGain()];
   w.inp.connect(sp);for(let i=0;i<2;i++){sp.connect(dl[i],i);dl[i].connect(mg,0,i);dg[i].connect(dl[i].delayTime);dl[i].connect(fb[i]);fb[i].connect(dl[i])}lfo.connect(dg[0]);lfo2.connect(dg[1]);mg.connect(w.wet);lfo.start();lfo2.start();
   const set=p=>{const fl=p.mode==='flanger',base=fl?.003:.014;lfo.frequency.value=lfo2.frequency.value=p.rate;dl.forEach(d=>d.delayTime.value=base);dg.forEach(g=>g.gain.value=Math.min(base*.95,p.depth/1000/(fl?3:1)));fb.forEach(g=>g.gain.value=fl?p.fb/100:p.fb/300);w.set(p.mix)};
   lfo2.detune.value=0;set(p);return{inp:w.inp,out:w.out,set,stop:()=>{try{lfo.stop();lfo2.stop()}catch(e){}}}}},
 imager:{name:'Stereo Imager',icon:'↔️',def:()=>({width:110,bassMono:120}),
  params:[['width','Breedte',0,200,1,fmtPct],['bassMono','Bas mono onder',20,400,1,v=>v<=20?'uit':fxHz(v),1]],
  build(c,p){const n=imagerNet(c);const set=p=>n.set(p.width,p.bassMono>20?p.bassMono:0);set(p);return{inp:n.inp,out:n.out,set}}},
 util:{name:'Utility',icon:'🎚️',def:()=>({gain:0,mono:'false',phase:'false'}),
  params:[['gain','Gain',-36,24,.5,fmtDb],['mono','Mono',[['false','Uit'],['true','Aan']]],['phase','Fase omdraaien',[['false','Uit'],['true','Aan']]]],
  build(c,p){const n=imagerNet(c),g=c.createGain();n.out.connect(g);const set=p=>{n.set(String(p.mono)==='true'?0:100,0);g.gain.value=dB(p.gain)*(String(p.phase)==='true'?-1:1)};set(p);return{inp:n.inp,out:g,set}}},
 limiter:{name:'Limiter',icon:'🧱',wl:true,def:()=>({gain:0,ceil:-1,rel:80}),
  params:[['gain','Gain (luidheid)',-12,30,.1,fmtDb],['ceil','Plafond',-12,0,.1,v=>(+v).toFixed(1)+' dBTP'],['rel','Release',5,1000,1,fmtMs,1]],
  build(c,p){if(!hasWL(c)){const g=c.createGain(),cp=c.createDynamicsCompressor();g.connect(cp);cp.threshold.value=-1;cp.ratio.value=20;cp.attack.value=.001;cp.release.value=.08;const set=p=>{g.gain.value=dB(p.gain);cp.threshold.value=p.ceil};set(p);return{inp:g,out:cp,set,comp:cp}}
   const n=new AudioWorkletNode(c,'mts-limiter',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});const r={inp:n,out:n,gr:0};n.port.onmessage=e=>{r.gr=e.data};
   r.set=p=>{const P=n.parameters;P.get('gain').value=p.gain;P.get('ceiling').value=p.ceil;P.get('release').value=p.rel};r.set(p);return r}}};
function passThru(c){const g=c.createGain();return{inp:g,out:g,set(){},missing:true}}
function imagerNet(c){const inp=c.createGain(),out=c.createGain(),sp=c.createChannelSplitter(2),mg=c.createChannelMerger(2),mid=c.createGain(),side=c.createGain(),sideW=c.createGain(),hp=c.createBiquadFilter(),inv=c.createGain(),l=c.createGain(),r=c.createGain(),sideN=c.createGain();
 inp.channelCountMode='explicit';inp.channelCount=2;inp.connect(sp);sp.connect(mid,0);sp.connect(mid,1);mid.gain.value=.5;sp.connect(side,0);sp.connect(inv,1);inv.gain.value=-1;inv.connect(side);side.gain.value=.5;
 hp.type='highpass';hp.Q.value=Math.SQRT1_2;side.connect(hp);hp.connect(sideW);
 mid.connect(l);mid.connect(r);sideW.connect(l);sideW.connect(sideN);sideN.gain.value=-1;sideN.connect(r);l.connect(mg,0,0);r.connect(mg,0,1);mg.connect(out);
 return{inp,out,set:(w,bm)=>{sideW.gain.value=clamp(w,0,200)/100;hp.frequency.value=bm>0?bm:1}}}

/* --- slots --- */
const newSlot=type=>({type,on:true,p:FXT[type].def(),id:Math.random().toString(36).slice(2,8)});
function sanitizeSlots(a){if(!Array.isArray(a))return[];return a.filter(s=>s&&FXT[s.type]).slice(0,MAX_SLOTS).map(s=>{const d=FXT[s.type].def(),p={...d,...(s.p&&typeof s.p==='object'?s.p:{})};
 if(s.type==='eq'){p.bands=Array.isArray(p.bands)&&p.bands.length?p.bands.slice(0,8).map(b=>({...eqBand(1000),...b})):d.bands}return{type:s.type,on:s.on!==false,p,id:s.id||Math.random().toString(36).slice(2,8),ai:!!s.ai,label:s.label?String(s.label).slice(0,24):undefined}})}
/* Keten tussen twee knooppunten bouwen; geeft een object terug dat je kunt herbouwen */
function buildSlotChain(c,slots,live){const inp=c.createGain(),out=c.createGain();const ch={inp,out,mods:new Map()};
 ch.rebuild=slots=>{try{inp.disconnect()}catch(e){}ch.mods.forEach(m=>{try{m.out.disconnect()}catch(e){}m.stop&&m.stop()});ch.mods.clear();let last=inp;
  for(const s of slots||[]){if(!s.on)continue;const def=FXT[s.type];if(!def)continue;let m;try{m=def.build(c,s.p,live)}catch(e){console.warn('fx',s.type,e);continue}last.connect(m.inp);last=m.out;ch.mods.set(s.id,m)}last.connect(out)};
 ch.rebuild(slots);return ch}

/* --- live: insert- en master-ketens --- */
const liveChains=new Map();/* sleutel: insert-id of 'master' */
const slotsOk=new WeakSet();
function slotsOf(key){if(key==='master'){const mf=masterFx();if(!slotsOk.has(mf)){mf.slots=sanitizeSlots(mf.slots);slotsOk.add(mf)}return mf.slots}const s=insById(key);if(!s)return[];if(!Array.isArray(s.slots))s.slots=[];return s.slots}
function fxStructureChanged(key){const ch=liveChains.get(key);if(ch)ch.rebuild(slotsOf(key))}
function fxParamChanged(key,slot){const ch=liveChains.get(key);const m=ch&&ch.mods.get(slot.id);if(m)m.set(slot.p);else if(ch)ch.rebuild(slotsOf(key))}
let masterChainLive=null;
function setupMasterChain(c,dest){const ch=buildSlotChain(c,slotsOf('master'),true);ch.out.connect(dest);liveChains.set('master',ch);masterChainLive=ch;
 loadWorklets(c).then(ok=>{if(ok){ch.rebuild(slotsOf('master'));liveChains.forEach((x,k)=>{if(k!=='master')x.rebuild(slotsOf(k))})}});return ch.inp}
function resetFxChains(){liveChains.forEach((ch,k)=>{if(k!=='master')liveChains.delete(k)});if(masterChainLive)masterChainLive.rebuild(slotsOf('master'))}

/* --- UI in de mixer --- */
const FXUI={sel:null};
function renderSlotRack(box,key){const slots=slotsOf(key),wrap=document.createElement('div');wrap.className='fx-sec fx-rack';
 wrap.innerHTML=`<h3>${key==='master'?'Master-effecten':'Effect-slots'} <small class="muted">${slots.length}/${MAX_SLOTS}</small></h3><div class="slot-list"></div>
  <div class="slot-add"><select class="btn small" aria-label="Effect toevoegen"><option value="">+ Effect toevoegen…</option>${Object.entries(FXT).map(([k,d])=>`<option value="${k}">${d.icon} ${d.name}</option>`).join('')}</select></div><div class="slot-edit"></div>`;
 const list=wrap.querySelector('.slot-list');
 slots.forEach((s,i)=>{const d=FXT[s.type],r=document.createElement('div');r.className='slot'+(FXUI.sel===s.id?' sel':'')+(s.on?'':' off');
  r.innerHTML=`<button class="led${s.on?' on':''}" title="Aan/uit" aria-label="Aan/uit"></button><button class="slot-name">${d.icon} ${s.label||d.name}${s.ai?' <span class="ai-tag">AI</span>':''}</button><button class="tb" data-a="up" aria-label="Omhoog">▲</button><button class="tb" data-a="down" aria-label="Omlaag">▼</button><button class="tb x" data-a="del" aria-label="Verwijderen">✕</button>`;
  r.querySelector('.led').onclick=()=>{s.on=!s.on;fxStructureChanged(key);saveSongSoon();renderInsertFx()};
  r.querySelector('.slot-name').onclick=()=>{FXUI.sel=FXUI.sel===s.id?null:s.id;renderInsertFx()};
  r.querySelector('[data-a=up]').onclick=()=>{if(i>0){[slots[i-1],slots[i]]=[slots[i],slots[i-1]];fxStructureChanged(key);saveSongSoon();renderInsertFx()}};
  r.querySelector('[data-a=down]').onclick=()=>{if(i<slots.length-1){[slots[i+1],slots[i]]=[slots[i],slots[i+1]];fxStructureChanged(key);saveSongSoon();renderInsertFx()}};
  r.querySelector('[data-a=del]').onclick=()=>{pushHistory();slots.splice(i,1);if(FXUI.sel===s.id)FXUI.sel=null;fxStructureChanged(key);saveSongSoon();renderInsertFx()};
  list.append(r)});
 if(!slots.length)list.innerHTML='<p class="hint" style="margin:4px 0">Nog geen effecten. Kies hieronder een effect, of laat 🤖 AI Mix het doen.</p>';
 const add=wrap.querySelector('.slot-add select');add.onchange=()=>{const t=add.value;add.value='';if(!t)return;if(slots.length>=MAX_SLOTS){toast(`Maximaal ${MAX_SLOTS} effecten per insert`);return}
  pushHistory();const s=newSlot(t);slots.push(s);FXUI.sel=s.id;const ac=ensureAudio();if(FXT[t].wl&&ac)loadWorklets(ac).then(()=>fxStructureChanged(key));fxStructureChanged(key);saveSongSoon();renderInsertFx()};
 box.append(wrap);const sel=slots.find(s=>s.id===FXUI.sel);if(sel)renderSlotEditor(wrap.querySelector('.slot-edit'),key,sel)}
function renderSlotEditor(box,key,s){const d=FXT[s.type];box.innerHTML='';const h=document.createElement('div');h.className='slot-head';h.innerHTML=`<b>${d.icon} ${d.name}</b>`;
 const rs=document.createElement('button');rs.className='btn small';rs.textContent='Reset';rs.onclick=()=>{pushHistory();s.p=d.def();fxStructureChanged(key);saveSongSoon();renderInsertFx()};h.append(rs);box.append(h);
 if(s.type==='eq'){renderEqEditor(box,key,s);return}
 const ch=()=>{fxParamChanged(key,s);saveSongSoon()};
 for(const pr of d.params){const [k,l]=pr;if(Array.isArray(pr[2])){const w=document.createElement('label');w.className='fx-f';w.innerHTML=`<span class="fx-l">${l}</span><select class="btn small"></select><output></output>`;const se=w.querySelector('select');
   for(const [v,t] of pr[2])se.add(new Option(t,v));se.value=String(s.p[k]);se.onchange=()=>{s.p[k]=se.value;ch()};box.append(w);continue}
  const [,,mn,mx,st,fmt,log]=pr;box.append(log?fxSliderLog(l,mn,mx,s.p[k],fmt,v=>{s.p[k]=v;ch()}):fxSlider(l,mn,mx,st,s.p[k],fmt,v=>{s.p[k]=v;ch()}))}
 if(d.wl&&!hasWL(ctx))box.append(Object.assign(document.createElement('p'),{className:'hint',textContent:'Dit effect gebruikt een AudioWorklet; het wordt actief zodra de audio gestart is.'}))}
function fxSliderLog(label,mn,mx,val,fmt,on){const L=Math.log(mn),H=Math.log(mx);const w=fxSlider(label,0,1000,1,Math.round((Math.log(clamp(val,mn,mx))-L)/(H-L)*1000),v=>fmt(Math.exp(L+(H-L)*v/1000)),v=>on(+Math.exp(L+(H-L)*v/1000).toPrecision(4)));return w}

/* Pro EQ-editor: curve met sleepbare punten, analyzer erachter, bandtabel */
const EQV={drag:null,band:0,raf:0};
const EQ_LO=20,EQ_HI=20000,EQ_DB=24;
function renderEqEditor(box,key,s){const wrap=document.createElement('div');wrap.className='eq-ed';
 wrap.innerHTML=`<canvas class="eq-cv"></canvas><div class="eq-bands"></div><div class="eq-detail"></div>`;box.append(wrap);
 const cv=wrap.querySelector('.eq-cv');const ch=()=>{fxParamChanged(key,s);saveSongSoon()};
 const bandsEl=wrap.querySelector('.eq-bands');
 const renderBands=()=>{bandsEl.innerHTML='';s.p.bands.forEach((b,i)=>{const x=document.createElement('button');x.className='chip'+(i===EQV.band?' active':'')+(b.on?'':' dim');x.textContent=`${i+1} ${EQ_TYPES.find(t=>t[0]===b.type)[1]}`;x.onclick=()=>{EQV.band=i;renderBands();renderDetail();draw()};bandsEl.append(x)})};
 const det=wrap.querySelector('.eq-detail');
 const renderDetail=()=>{det.innerHTML='';const b=s.p.bands[EQV.band];if(!b)return;
  const row=document.createElement('div');row.className='eq-row';row.innerHTML=`<label class="small-l"><input type="checkbox"${b.on?' checked':''}> Band ${EQV.band+1} aan</label><select class="btn small">${EQ_TYPES.map(([v,t])=>`<option value="${v}"${v===b.type?' selected':''}>${t}</option>`).join('')}</select>${b.type.endsWith('cut')?`<select class="btn small eq-slope">${[12,24,36,48].map(v=>`<option${v===b.slope?' selected':''}>${v}</option>`).join('')}</select><span class="muted">dB/oct</span>`:''}`;
  row.querySelector('input').onchange=e=>{b.on=e.target.checked;fxStructureChanged(key);saveSongSoon();renderBands();draw()};
  row.querySelector('select').onchange=e=>{b.type=e.target.value;b.on=true;fxStructureChanged(key);saveSongSoon();renderBands();renderDetail();draw()};
  const sl=row.querySelector('.eq-slope');if(sl)sl.onchange=e=>{b.slope=+e.target.value;fxStructureChanged(key);saveSongSoon();draw()};det.append(row);
  det.append(fxSliderLog('Frequentie',EQ_LO,EQ_HI,b.f,fxHz,v=>{b.f=v;ch();draw()}));
  if(!b.type.endsWith('cut')&&b.type!=='notch'&&b.type!=='bandpass')det.append(fxSlider('Gain',-EQ_DB,EQ_DB,.1,b.g,fmtDb,v=>{b.g=v;ch();draw()}));
  det.append(fxSliderLog('Q',.1,30,b.q,v=>(+v).toFixed(2),v=>{b.q=v;ch();draw()}));
  det.append(fxSlider('Output',-24,24,.1,s.p.out||0,fmtDb,v=>{s.p.out=v;ch()}))};
 const W=()=>cv.clientWidth,H=()=>cv.clientHeight;
 const fx=f=>Math.log(f/EQ_LO)/Math.log(EQ_HI/EQ_LO)*W(),xf=x=>EQ_LO*Math.pow(EQ_HI/EQ_LO,clamp(x/W(),0,1)),gy=g=>H()/2-g/EQ_DB*(H()/2-10),yg=y=>clamp((H()/2-y)/(H()/2-10)*EQ_DB,-EQ_DB,EQ_DB);
 const pts=()=>s.p.bands.map((b,i)=>({i,b,x:fx(b.f),y:b.type.endsWith('cut')||b.type==='notch'||b.type==='bandpass'?H()/2:gy(b.g)}));
 const resp=()=>{/* respons via een offline set biquads (zelfde formules als de echte EQ) */const N=256,fr=new Float32Array(N);for(let i=0;i<N;i++)fr[i]=EQ_LO*Math.pow(EQ_HI/EQ_LO,i/(N-1));
  const tot=new Float32Array(N),ac=ensureAudio();if(!ac)return{fr,tot};const mag=new Float32Array(N),ph=new Float32Array(N);
  for(const b of s.p.bands){if(!b.on)continue;const n=b.type.endsWith('cut')?Math.max(1,b.slope/12):1,f=ac.createBiquadFilter();f.type={bell:'peaking',lowcut:'highpass',highcut:'lowpass'}[b.type]||b.type;f.frequency.value=b.f;f.gain.value=b.g;
   f.Q.value=b.type.endsWith('cut')?(n===1?b.q*.7071:Math.SQRT1_2):b.type.endsWith('shelf')?clamp(b.q,.1,4)*.7071:b.q;f.getFrequencyResponse(fr,mag,ph);for(let i=0;i<N;i++)tot[i]+=n*20*Math.log10(Math.max(1e-6,mag[i]))}
  return{fr,tot}};
 const draw=()=>{const dpr=devicePixelRatio||1,w=W(),h=H();if(!w)return;cv.width=w*dpr;cv.height=h*dpr;const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle='#14191c';g.fillRect(0,0,w,h);g.strokeStyle='#2c353a';g.lineWidth=1;g.font='9px system-ui';g.fillStyle='#6b777d';
  for(const f of [50,100,200,500,1000,2000,5000,10000]){const x=fx(f);g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();g.fillText(fxHz(f).replace(' ',''),x+2,h-3)}
  for(const d of [-18,-12,-6,0,6,12,18]){const y=gy(d);g.strokeStyle=d===0?'#45525a':'#262e33';g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();g.fillText((d>0?'+':'')+d,2,y-2)}
  const ch=liveChains.get(key),m=ch&&ch.mods.get(s.id);if(m&&m.an&&ctx){const an=m.an,buf=new Float32Array(an.frequencyBinCount);an.getFloatFrequencyData(buf);g.beginPath();
   for(let x=0;x<w;x+=2){const f=xf(x),bin=Math.min(buf.length-1,Math.round(f/(ctx.sampleRate/2)*buf.length)),v=buf[bin]+(Math.log2(f/1000)*4.5);const y=h-((v+100)/90)*h;x?g.lineTo(x,y):g.moveTo(x,y)}
   g.lineTo(w,h);g.lineTo(0,h);g.closePath();g.fillStyle='#9bd94a1c';g.fill()}
  const {fr,tot}=resp();g.beginPath();for(let i=0;i<fr.length;i++){const x=fx(fr[i]),y=gy(clamp(tot[i],-EQ_DB*1.2,EQ_DB*1.2));i?g.lineTo(x,y):g.moveTo(x,y)}g.strokeStyle='#ffb35c';g.lineWidth=2;g.stroke();
  g.lineTo(w,gy(0));g.lineTo(0,gy(0));g.closePath();g.fillStyle='#ff9a2e22';g.fill();
  for(const p of pts()){g.beginPath();g.arc(p.x,p.y,p.i===EQV.band?9:7,0,7);g.fillStyle=p.b.on?(p.i===EQV.band?'#ffb35c':'#e8edf2'):'#4a555b';g.fill();g.fillStyle='#14191c';g.font='bold 9px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(p.i+1,p.x,p.y+.5);g.textAlign='left';g.textBaseline='alphabetic'}};
 cv.addEventListener('pointerdown',e=>{const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let best=null,bd=26;for(const p of pts()){const d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=p}}
  if(!best){/* leeg: dichtstbijzijnde uitgeschakelde band hierheen */const free=s.p.bands.map((b,i)=>({b,i})).filter(o=>!o.b.on);if(!free.length)return;const o=free.reduce((a,z)=>Math.abs(Math.log(z.b.f/xf(x)))<Math.abs(Math.log(a.b.f/xf(x)))?z:a);
   o.b.on=true;if(o.b.type.endsWith('cut'))o.b.type='bell';o.b.f=xf(x);o.b.g=yg(y);pushHistory();fxStructureChanged(key);best={i:o.i,b:o.b}}
  else pushHistory();EQV.band=best.i;EQV.drag={id:e.pointerId,b:best.b};cv.setPointerCapture(e.pointerId);renderBands();renderDetail();draw()});
 cv.addEventListener('pointermove',e=>{const d=EQV.drag;if(!d||d.id!==e.pointerId)return;const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;d.b.f=+xf(x).toPrecision(4);
  if(!(d.b.type.endsWith('cut')||d.b.type==='notch'||d.b.type==='bandpass'))d.b.g=Math.round(yg(y)*10)/10;fxParamChanged(key,s);draw()});
 const end=e=>{if(!EQV.drag)return;EQV.drag=null;saveSongSoon();renderDetail()};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
 cv.addEventListener('wheel',e=>{const b=s.p.bands[EQV.band];if(!b)return;e.preventDefault();b.q=clamp(b.q*(e.deltaY<0?1.1:1/1.1),.1,30);fxParamChanged(key,s);draw();renderDetail()},{passive:false});
 cv.addEventListener('dblclick',()=>{const b=s.p.bands[EQV.band];if(!b)return;b.on=!b.on;fxStructureChanged(key);saveSongSoon();renderBands();draw()});
 renderBands();renderDetail();requestAnimationFrame(draw);
 cancelAnimationFrame(EQV.raf);const loop=()=>{if(!cv.isConnected)return;if(playing)draw();EQV.raf=requestAnimationFrame(loop)};EQV.raf=requestAnimationFrame(loop)}
