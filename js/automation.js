'use strict';
/* =====================================================================
   Automation-clips (zoals FL Studio).
   clip: {kind:'auto', target, pts:[[relTick, v]] of [[relTick, x, y]] (tfx), mode (tfx)}
   Doelen: 'master:vol', 'ins:<n>:vol', 'ins:<n>:pan', 'tfx'
   ===================================================================== */
const AUTO_RE=/^(master:vol|ins:\d{1,2}:(vol|pan)|tfx)$/;
function sanitizeAutoClip(base,c){if(!AUTO_RE.test(c.target||''))return null;const tfx=c.target==='tfx';
 const pts=(Array.isArray(c.pts)?c.pts:[]).filter(p=>Array.isArray(p)&&isFinite(p[0])&&p[0]>=0).map(p=>tfx?[Math.round(p[0]),clamp(+p[1]||0,0,1),clamp(+p[2]||0,0,1)]:[Math.round(p[0]),clamp(+p[1]||0,0,1)]).sort((a,b)=>a[0]-b[0]);
 if(!pts.length)return null;return{...base,kind:'auto',target:c.target,pts,mode:tfx&&TFX_MODES[c.mode]?c.mode:'filter'}}
function autoLabel(c){const t=c.target;if(t==='master:vol')return'Master volume';if(t==='tfx')return`Touch FX ${TFX_MODES[c.mode]?.name||''}`;
 const m=/^ins:(\d+):(vol|pan)$/.exec(t);if(m){const s=insById(+m[1]);return`${s?s.name:'Insert '+m[1]} ${m[2]==='vol'?'volume':'pan'}`}return t}
function autoTargets(){const o=[['master:vol','Master volume'],['tfx','Touch FX']];for(const s of song.inserts){o.push([`ins:${s.id}:vol`,`${s.id} · ${s.name} volume`]);o.push([`ins:${s.id}:pan`,`${s.id} · ${s.name} pan`])}return o}
/* waarde op een relatieve tick (lineair tussen punten); lane 1 = waarde/X, 2 = Y */
function autoValueAt(c,rel,lane=1){const p=c.pts;if(!p.length)return .8;if(rel<=p[0][0])return p[0][lane];const L=p[p.length-1];if(rel>=L[0])return L[lane];
 let lo=0,hi=p.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(p[m][0]<=rel)lo=m;else hi=m}const a=p[lo],b=p[hi],f=(rel-a[0])/Math.max(1,b[0]-a[0]);return a[lane]+(b[lane]-a[lane])*f}
const autoMap={vol:v=>v*1.25,pan:v=>v*2-1,master:v=>v};
function autoParamLive(c){const t=c.target;if(t==='master:vol')return masterNode?{p:masterNode.gain,f:autoMap.master,rest:()=>state.master/100}:null;
 const m=/^ins:(\d+):(vol|pan)$/.exec(t);if(!m)return null;const s=insById(+m[1]);if(!s)return null;liveInsertIn(s.id);const n=liveInsertNodes.get(s.id);if(!n)return null;
 if(m[2]==='vol')return{p:n.g.gain,f:v=>insAudible(s)?autoMap.vol(v):0,rest:()=>insGainVal(s)};return n.p?{p:n.p.pan,f:autoMap.pan,rest:()=>s.pan/100}:null}
const activeAutos=new Map();let tfxAutoOwned=false;
function autoClips(){const out=[];for(const t of song.tracks){if(!trackAudible(t))continue;for(const c of t.clips)if(c.kind==='auto'&&!c.mute)out.push(c)}return out}
/* Elke scheduler-tik: param-ramps tot aan de horizon */
function autoTick(now,horizon){if(!songAnchor)return;const nowT=songTickAt(now),hzT=songTickAt(horizon);const seen=new Set();
 for(const c of autoClips()){const end=c.start+c.len;if(c.start>hzT||end<nowT)continue;seen.add(c);
  if(c.target==='tfx'){if(c.start<=nowT){const rel=nowT-c.start;TFX.x=autoValueAt(c,rel,1);TFX.y=autoValueAt(c,rel,2);if(state.tfxMode!==c.mode)tfxSetMode(c.mode);if(!TFX.active){tfxEngage();tfxAutoOwned=true}else tfxParams();if(!tfxEl.box.hidden)tfxUI()}continue}
  const P=autoParamLive(c);if(!P)continue;
  if(!activeAutos.has(c)){const t0=Math.max(now,songTimeAt(Math.max(nowT,c.start)));P.p.cancelScheduledValues(t0);P.p.setValueAtTime(P.f(autoValueAt(c,Math.max(nowT,c.start)-c.start)),t0);activeAutos.set(c,P)}
  const tEnd=Math.min(hzT,end);P.p.linearRampToValueAtTime(P.f(autoValueAt(c,tEnd-c.start)),songTimeAt(tEnd))}
 for(const [c,P] of activeAutos)if(!seen.has(c)){activeAutos.delete(c);try{P.p.cancelScheduledValues(now);P.p.setTargetAtTime(P.rest(),now,.02)}catch(e){}}
 if(tfxAutoOwned&&![...seen].some(c=>c.target==='tfx'&&c.start<=nowT)){tfxAutoOwned=false;if(TFX.pointer==null&&!TFX.latch)tfxRelease()}}
function autoRestore(){const now=ctx?ctx.currentTime:0;for(const [c,P] of activeAutos){try{P.p.cancelScheduledValues(now);P.p.setTargetAtTime(P.rest(),now,.02)}catch(e){}}activeAutos.clear();
 if(tfxAutoOwned){tfxAutoOwned=false;if(TFX.pointer==null&&!TFX.latch)tfxRelease()}}
/* WAV-export: automation op offline-nodes */
function autoScheduleOffline(route,master,base){for(const c of autoClips()){if(c.target==='tfx')continue;let p,f;
 if(c.target==='master:vol'){p=master.gain;f=autoMap.master}else{const m=/^ins:(\d+):(vol|pan)$/.exec(c.target),s=m&&insById(+m[1]);const n=s&&route.insNode(s.id);if(!n)continue;
  if(m[2]==='vol'){p=n.g.gain;f=v=>insAudible(s)?autoMap.vol(v):0}else{if(!n.p)continue;p=n.p.pan;f=autoMap.pan}}
 const T=tk=>base+ticksToSec(tk),rest=p.value;p.setValueAtTime(f(autoValueAt(c,0)),T(c.start));
 for(const q of c.pts)if(q[0]<=c.len)p.linearRampToValueAtTime(f(q[1]),T(c.start+q[0]));p.linearRampToValueAtTime(f(autoValueAt(c,c.len)),T(c.start+c.len));p.setValueAtTime(rest,T(c.start+c.len)+.001)}}

/* ---------- Opnemen van automation (faders, Touch FX) ---------- */
let tfxSeg=0;
function recAuto(key,vals,extra){if(!(take&&playing&&state.songMode&&ctx))return;const tk=Math.max(0,Math.round(songTickAt(ctx.currentTime)));
 if(!take.auto)take.auto=new Map();let r=take.auto.get(key);if(!r){r={pts:[],extra};take.auto.set(key,r)}const L=r.pts[r.pts.length-1];
 if(L&&tk-L[0]<12){L.splice(1,vals.length,...vals);return}r.pts.push([tk,...vals])}
function recTfxStart(){if(take&&playing&&state.songMode)tfxSeg++}
function commitAuto(t){if(!t.auto||!t.auto.size)return 0;let n=0;
 for(const [key,r] of t.auto){if(!r.pts.length)continue;const target=key.split('#')[0],s=Math.floor(r.pts[0][0]/PPQ)*PPQ,last=r.pts[r.pts.length-1][0],len=Math.max(PPQ,Math.ceil((last-s+1)/PPQ)*PPQ);
  const c={id:newClipId(),kind:'auto',target,mode:r.extra||'filter',start:s,len,off:0,mute:false,name:'',pts:r.pts.map(p=>[p[0]-s,...p.slice(1)])};
  if(target==='tfx')c.pts.push([Math.min(len-1,last-s+1),...r.pts[r.pts.length-1].slice(1)]);
  const tr=freeTrackFor(s,s+len);tr.clips.push(c);n++}return n}
function freeTrackFor(a,b){for(let k=3;k<song.tracks.length;k++){const t=song.tracks[k];if(!t.clips.some(c=>c.start<b&&c.start+c.len>a))return t}return newTrack('inst')}
function newAutoClip(t,tick){const id=t.insert||0;const target=id?`ins:${id}:vol`:'master:vol',v=id?.64:state.master/100;
 return{id:newClipId(),kind:'auto',target,mode:'filter',start:tick,len:BAR*2,off:0,mute:false,name:'',pts:[[0,v],[BAR*2,v]]}}

/* ---------- Tekenen in de playlist ---------- */
function drawAutoInClip(g,c,r,ppt,color){const p=c.pts;if(!p.length)return;const top=r.y+14,h=r.h-17,X=rel=>r.x+rel*ppt,Y=v=>top+(1-v)*h;
 const lanes=c.target==='tfx'?[1,2]:[1];lanes.forEach((ln,i)=>{g.strokeStyle=i?'#65dfcf':'#f4f8ff';g.lineWidth=1.5;g.beginPath();g.moveTo(X(0),Y(autoValueAt(c,0,ln)));
  for(const q of p)if(q[0]<=c.len)g.lineTo(X(q[0]),Y(q[ln]));g.lineTo(X(c.len),Y(autoValueAt(c,c.len,ln)));g.stroke()})}

/* ---------- Editor voor automation ---------- */
const AE={lane:1,sel:-1,drag:null};
function edOpenAuto(tr,c){ED.sel.clear();ED.target={id:tr.id,key:'a'+c.id,type:'auto',color:tr.color,inst:tr.inst,name:'',events:[],base:c.start,_track:tr,_clip:c};AE.sel=-1;AE.lane=1;
 const p=$('#ed-panel');renderEditor();p.open=true;layoutEd();drawEd();p.scrollIntoView({behavior:'smooth',block:'nearest'})}
function renderAutoBar(){const bar=$('#ed-auto-bar');if(!bar)return;const T=ED.target,on=!!(T&&T.type==='auto'&&edTrack());bar.hidden=!on;$$('.ed-notes-only').forEach(e=>e.hidden=on);if(!on)return;const c=T._clip;
 const sel=$('#ed-auto-target');sel.innerHTML='';for(const [v,l] of autoTargets())sel.add(new Option(l,v));sel.value=c.target;
 const ms=$('#ed-auto-mode');ms.hidden=c.target!=='tfx';ms.innerHTML='';for(const [k,v] of Object.entries(TFX_MODES))ms.add(new Option(v.name,k));ms.value=c.mode;
 $$('#ed-auto-lane .chip').forEach(b=>{b.classList.toggle('active',+b.dataset.lane===AE.lane);b.hidden=c.target!=='tfx'})}
function autoEdited(c){c.pts.sort((a,b)=>a[0]-b[0]);saveSongSoon();drawTimeline();drawEd()}
function drawAutoEd(g,t,W,H){const c=t._clip,ppt=edPPT(),top=ED_RULER+10,h=H-ED_RULER-20,Y=v=>top+(1-v)*h,Xr=rel=>vx(rel);
 g.fillStyle='#0f1823';g.fillRect(ED_LBL,ED_RULER,W,H);for(let i=0;i<=4;i++){g.fillStyle='#2f383d';g.fillRect(ED_LBL,Math.round(top+i*h/4),W,1)}
 const lanes=c.target==='tfx'?[1,2]:[1];
 for(const ln of lanes){const act=ln===AE.lane;g.strokeStyle=ln===2?'#65dfcf':t.color;g.globalAlpha=act?1:.35;g.lineWidth=2;g.beginPath();g.moveTo(Xr(0),Y(autoValueAt(c,0,ln)));
  for(const q of c.pts)g.lineTo(Xr(q[0]),Y(q[ln]));g.lineTo(Xr(c.len),Y(autoValueAt(c,c.len,ln)));g.stroke();
  if(act)c.pts.forEach((q,i)=>{g.fillStyle=i===AE.sel?'#ffffff':(ln===2?'#65dfcf':t.color);g.beginPath();g.arc(Xr(q[0]),Y(q[ln]),i===AE.sel?7:5,0,Math.PI*2);g.fill()});g.globalAlpha=1}
 g.fillStyle='#242c30';g.fillRect(0,ED_RULER,ED_LBL,H);g.fillStyle='#a5b2b8';g.font='600 10px system-ui,sans-serif';g.textBaseline='middle';
 const lab=c.target.endsWith(':pan')?['R','C','L']:['100%','50%','0%'];g.fillText(lab[0],6,top);g.fillText(lab[1],6,top+h/2);g.fillText(lab[2],6,top+h);
 const endX=vx(c.len);if(endX<W){g.fillStyle='#0b121bcc';g.fillRect(Math.max(ED_LBL,endX),ED_RULER,W,H)}g.fillStyle='#ffb94c';g.fillRect(Math.round(endX),ED_RULER,2,H)}
function autoHit(t,x,y){const c=t._clip,H=edEl.canvas.clientHeight,top=ED_RULER+10,h=H-ED_RULER-20;let best=-1,bd=14;
 c.pts.forEach((q,i)=>{const d=Math.hypot(vx(q[0])-x,top+(1-q[AE.lane])*h-y);if(d<bd){bd=d;best=i}});return best}
const autoYToV=y=>{const H=edEl.canvas.clientHeight,top=ED_RULER+10,h=H-ED_RULER-20;return clamp(1-(y-top)/h,0,1)};
function autoPointerDown(t,x,y,ev){const c=t._clip,i=autoHit(t,x,y);AE.drag={i,x0:x,y0:y,moved:false,sl:edEl.scroll.scrollLeft,id:ev.pointerId};
 if(i>=0){AE.sel=i;pushHistory()}drawEd()}
function autoPointerMove(t,x,y){const d=AE.drag;if(!d)return;if(!d.moved&&Math.hypot(x-d.x0,y-d.y0)<4)return;d.moved=true;const c=t._clip;
 if(d.i<0){edEl.scroll.scrollLeft=d.sl-(x-d.x0);return}const q=c.pts[d.i];q[0]=clamp(state.edGrid==='off'?Math.round(xToTick(x)):snapTick(xToTick(x)),0,c.len);q[AE.lane]=autoYToV(y);
 c.pts.sort((a,b)=>a[0]-b[0]);d.i=AE.sel=c.pts.indexOf(q);drawEd();drawTimeline()}
function autoPointerUp(t,x,y){const d=AE.drag;AE.drag=null;if(!d)return;const c=t._clip;
 if(d.moved){if(d.i>=0)autoEdited(c);return}
 if(d.i>=0){if(ED.tool==='draw'&&c.pts.length>1){c.pts.splice(d.i,1);AE.sel=-1;autoEdited(c)}else drawEd();return}
 if(ED.tool==='draw'){pushHistory();const tk=clamp(state.edGrid==='off'?Math.round(xToTick(x)):snapTick(xToTick(x)),0,c.len),v=autoYToV(y);
  const q=c.target==='tfx'?[tk,autoValueAt(c,tk,1),autoValueAt(c,tk,2)]:[tk,v];q[AE.lane]=v;c.pts.push(q);AE.sel=c.pts.length-1;autoEdited(c);AE.sel=c.pts.indexOf(q);drawEd()}}
$('#ed-auto-target').onchange=e=>{const T=ED.target;if(!T||T.type!=='auto')return;pushHistory();const c=T._clip,was=c.target;c.target=e.target.value;
 if(c.target==='tfx'&&was!=='tfx')c.pts=c.pts.map(p=>[p[0],p[1],.5]);if(c.target!=='tfx'&&was==='tfx')c.pts=c.pts.map(p=>[p[0],p[1]]);renderAutoBar();autoEdited(c)};
$('#ed-auto-mode').onchange=e=>{const T=ED.target;if(!T||T.type!=='auto')return;T._clip.mode=e.target.value;autoEdited(T._clip)};
$$('#ed-auto-lane .chip').forEach(b=>b.onclick=()=>{AE.lane=+b.dataset.lane;AE.sel=-1;renderAutoBar();drawEd()});
