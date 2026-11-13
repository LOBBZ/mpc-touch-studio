'use strict';
/* =====================================================================
   Effecten: per spoor EQ (laag/mid/hoog), compressor, reverb- en delay-send.
   Master-bussen: reverb (convolver) en tempo-gesynchroniseerde delay.
   Werkt live én in de WAV-export (OfflineAudioContext).
   ===================================================================== */
const FX_DEFAULT=()=>({low:0,mid:0,midF:1200,high:0,comp:false,thr:-18,ratio:4,rev:0,dly:0});
const MASTER_FX_DEFAULT=()=>({revDecay:2.2,revLvl:100,dlyDiv:'1/8D',dlyFb:35,dlyLvl:100});
const DLY_DIVS={'1/16':.25,'1/8T':1/3,'1/8':.5,'1/8D':.75,'1/4':1,'1/4D':1.5};
function fxOf(t){if(!t.fx||typeof t.fx!=='object')t.fx=FX_DEFAULT();for(const [k,v] of Object.entries(FX_DEFAULT()))if(typeof t.fx[k]!==typeof v)t.fx[k]=v;return t.fx}
function masterFx(){if(!song.masterFx||typeof song.masterFx!=='object')song.masterFx=MASTER_FX_DEFAULT();for(const [k,v] of Object.entries(MASTER_FX_DEFAULT()))if(typeof song.masterFx[k]!==typeof v)song.masterFx[k]=v;if(!DLY_DIVS[song.masterFx.dlyDiv])song.masterFx.dlyDiv='1/8D';return song.masterFx}

function makeImpulse(c,decay){const sr=c.sampleRate,len=Math.max(1,Math.round(sr*decay)),b=c.createBuffer(2,len,sr);
 for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2)}return b}
const busCache=new WeakMap();
function getBuses(c,master){let b=busCache.get(c);if(b)return b;const mf=masterFx();
 const revIn=c.createGain(),conv=c.createConvolver(),revOut=c.createGain();conv.buffer=makeImpulse(c,mf.revDecay);revIn.connect(conv);conv.connect(revOut);revOut.gain.value=mf.revLvl/100*.8;revOut.connect(master);
 const dlyIn=c.createGain(),dl=c.createDelay(4),fb=c.createGain(),lp=c.createBiquadFilter(),dlyOut=c.createGain();lp.type='lowpass';lp.frequency.value=4500;
 dl.delayTime.value=60/state.bpm*DLY_DIVS[mf.dlyDiv];fb.gain.value=mf.dlyFb/100;dlyIn.connect(dl);dl.connect(lp);lp.connect(fb);fb.connect(dl);lp.connect(dlyOut);dlyOut.gain.value=mf.dlyLvl/100*.7;dlyOut.connect(master);
 b={revIn,conv,revOut,dlyIn,dl,fb,dlyOut,decay:mf.revDecay};busCache.set(c,b);return b}
function updateBuses(){if(!ctx)return;const b=busCache.get(ctx);if(!b)return;const mf=masterFx(),now=ctx.currentTime;
 if(Math.abs(b.decay-mf.revDecay)>.05){const nc=ctx.createConvolver();nc.buffer=makeImpulse(ctx,mf.revDecay);b.revIn.disconnect();b.revIn.connect(nc);nc.connect(b.revOut);try{b.conv.disconnect()}catch(e){}b.conv=nc;b.decay=mf.revDecay}
 b.revOut.gain.setTargetAtTime(mf.revLvl/100*.8,now,.03);b.dl.delayTime.setTargetAtTime(60/state.bpm*DLY_DIVS[mf.dlyDiv],now,.05);b.fb.gain.setTargetAtTime(mf.dlyFb/100,now,.03);b.dlyOut.gain.setTargetAtTime(mf.dlyLvl/100*.7,now,.03)}

function setComp(comp,f){if(f.comp){comp.threshold.value=f.thr;comp.ratio.value=f.ratio;comp.knee.value=6;comp.attack.value=.008;comp.release.value=.15}else{comp.threshold.value=0;comp.ratio.value=1;comp.knee.value=0}}
/* Spoorketen: inp → EQ → compressor → fader (g) → pan → master, met post-fader sends naar reverb en delay */
function buildTrackChain(c,t,master){const f=fxOf(t),inp=c.createGain();
 const lo=c.createBiquadFilter();lo.type='lowshelf';lo.frequency.value=180;lo.gain.value=f.low;
 const mid=c.createBiquadFilter();mid.type='peaking';mid.frequency.value=f.midF;mid.Q.value=.9;mid.gain.value=f.mid;
 const hi=c.createBiquadFilter();hi.type='highshelf';hi.frequency.value=6000;hi.gain.value=f.high;
 const comp=c.createDynamicsCompressor();setComp(comp,f);
 const g=c.createGain();g.gain.value=trackGainVal(t);
 inp.connect(lo);lo.connect(mid);mid.connect(hi);hi.connect(comp);comp.connect(g);
 let end=g,p=null;if(c.createStereoPanner){p=c.createStereoPanner();p.pan.value=t.pan/100;g.connect(p);end=p}end.connect(master);
 const bus=getBuses(c,master),rs=c.createGain(),ds=c.createGain();rs.gain.value=f.rev/100;ds.gain.value=f.dly/100;end.connect(rs);rs.connect(bus.revIn);end.connect(ds);ds.connect(bus.dlyIn);
 return{inp,lo,mid,hi,comp,g,p,rs,ds}}
function updateTrackFx(t){const n=liveTrackNodes.get(t.id);if(!n||!ctx)return;const f=fxOf(t),now=ctx.currentTime,s=(prm,v)=>prm.setTargetAtTime(v,now,.02);
 s(n.lo.gain,f.low);s(n.mid.gain,f.mid);s(n.mid.frequency,f.midF);s(n.hi.gain,f.high);setComp(n.comp,f);s(n.rs.gain,f.rev/100);s(n.ds.gain,f.dly/100);if(n.p)s(n.p.pan,t.pan/100)}

/* ---------- FX-paneel ---------- */
const FX_FIELDS=[
 ['low','Laag (180 Hz)',-12,12,.5,v=>`${v>0?'+':''}${v} dB`],
 ['mid','Mid',-12,12,.5,v=>`${v>0?'+':''}${v} dB`],
 ['midF','Mid-frequentie',200,5000,10,v=>v>=1000?(v/1000).toFixed(1)+' kHz':v+' Hz'],
 ['high','Hoog (6 kHz)',-12,12,.5,v=>`${v>0?'+':''}${v} dB`],
 ['thr','Comp. drempel',-50,0,1,v=>v+' dB'],
 ['ratio','Comp. ratio',1,20,.5,v=>v+':1'],
 ['rev','Reverb-send',0,100,1,v=>v+'%'],
 ['dly','Delay-send',0,100,1,v=>v+'%']];
function fxSlider(label,min,max,step,val,fmt,on){const w=document.createElement('label');w.className='fx-f';
 w.innerHTML='<span class="fx-l"></span><input type="range"><output></output>';w.querySelector('.fx-l').textContent=label;
 const r=w.querySelector('input'),o=w.querySelector('output');r.min=min;r.max=max;r.step=step;r.value=val;o.textContent=fmt(+val);
 r.oninput=()=>{o.textContent=fmt(+r.value);on(+r.value)};return w}
function renderFxPanel(){const box=$('#fx-body');if(!box)return;box.innerHTML='';const t=song.tracks.find(x=>x.id===selTrack);
 const sec=(title)=>{const s=document.createElement('div');s.className='fx-sec';const h=document.createElement('h3');h.textContent=title;s.append(h);box.append(s);return s};
 if(t){const f=fxOf(t),s=sec(`Spoor: ${t.name}`);
  s.append(fxSlider('Pan',-100,100,1,t.pan,v=>v===0?'C':(v<0?'L':'R')+Math.abs(v),v=>{t.pan=v;updateTrackFx(t);saveSongSoon()}));
  for(const [k,l,mn,mx,st,fmt] of FX_FIELDS){if(k==='thr')s.append(compToggle(t,f));s.append(fxSlider(l,mn,mx,st,f[k],fmt,v=>{f[k]=v;updateTrackFx(t);saveSongSoon()}))}
  const rb=document.createElement('button');rb.className='btn small';rb.textContent='FX resetten';rb.onclick=()=>{pushHistory();t.fx=FX_DEFAULT();t.pan=0;updateTrackFx(t);renderFxPanel();saveSongSoon()};s.append(rb)}
 const mf=masterFx(),m=sec('Master-effecten');
 m.append(fxSlider('Reverb-lengte',.3,6,.1,mf.revDecay,v=>v.toFixed(1)+' s',v=>{mf.revDecay=v;clearTimeout(renderFxPanel.t);renderFxPanel.t=setTimeout(updateBuses,250);saveSongSoon()}));
 m.append(fxSlider('Reverb-niveau',0,150,1,mf.revLvl,v=>v+'%',v=>{mf.revLvl=v;updateBuses();saveSongSoon()}));
 const dw=document.createElement('label');dw.className='fx-f';dw.innerHTML='<span class="fx-l">Delay-tijd</span><select></select><output></output>';
 const sel=dw.querySelector('select');for(const d of Object.keys(DLY_DIVS)){const o=document.createElement('option');o.value=d;o.textContent=d.replace('D',' punt').replace('T',' triool');sel.append(o)}sel.value=mf.dlyDiv;sel.onchange=()=>{mf.dlyDiv=sel.value;updateBuses();saveSongSoon()};m.append(dw);
 m.append(fxSlider('Delay-feedback',0,90,1,mf.dlyFb,v=>v+'%',v=>{mf.dlyFb=v;updateBuses();saveSongSoon()}));
 m.append(fxSlider('Delay-niveau',0,150,1,mf.dlyLvl,v=>v+'%',v=>{mf.dlyLvl=v;updateBuses();saveSongSoon()}))}
function compToggle(t,f){const w=document.createElement('label');w.className='fx-f fx-check';w.innerHTML='<span class="fx-l">Compressor</span><input type="checkbox"><output></output>';
 const c=w.querySelector('input'),o=w.querySelector('output');c.checked=f.comp;o.textContent=f.comp?'aan':'uit';c.onchange=()=>{f.comp=c.checked;o.textContent=f.comp?'aan':'uit';updateTrackFx(t);saveSongSoon()};return w}

$('#fx-panel').addEventListener('toggle',()=>{if($('#fx-panel').open)renderFxPanel()});
