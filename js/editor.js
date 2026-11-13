'use strict';
/* =====================================================================
   Editor voor het geselecteerde spoor:
   - instrumentspoor: piano roll (A0–C8)
   - drumspoor: drumgrid met de 16 pads van de actieve bank
   - audiospoor: clips met golfvorm
   Bewerken: tekenen, verwijderen, verplaatsen, lengte, selecteren,
   kopiëren/plakken/dupliceren, quantize, transponeren, velocity.
   ===================================================================== */
const ED={tool:'draw',sel:new Set(),clip:null,drag:null,lastTrack:null,velHist:false,target:null};
const GRIDS={'1/4':PPQ,'1/8':PPQ/2,'1/8T':PPQ/3,'1/16':T16,'1/16T':PPQ/6,'1/32':PPQ/8,'off':1};
const ED_RULER=22,ED_LBL=58,PR_HI=108,PR_LO=21;
const edEl={scroll:$('#ed-scroll'),spacer:$('#ed-spacer'),canvas:$('#ed-canvas')};
/* De editor bewerkt één notenclip uit de playlist (zoals de piano roll in FL). Doel = schijn-spoor met de clip-noten. */
function edTrack(){const T=ED.target;if(!T)return null;let tr=T._track,c=T._clip;if(!song.tracks.includes(tr)||!tr.clips.includes(c)){tr=song.tracks.find(x=>x.id===T.id);c=tr&&tr.clips.find(x=>'c'+x.id===T.key&&x.kind==='notes');if(!c){ED.target=null;return null}T._track=tr;T._clip=c}
 T.events=c.events;T.color=tr.color;T.inst=tr.inst;T.name=`${tr.name} · ${c.name||'clip'}`;T.base=c.start;return T}
function edOpenClip(tr,c,quiet){if(c.kind!=='notes')return;ED.sel.clear();ED.target={id:tr.id,key:'c'+c.id,type:tr.type,color:tr.color,inst:tr.inst,name:'',events:c.events,base:c.start,_track:tr,_clip:c};
 const p=$('#ed-panel');renderEditor();if(!quiet){p.open=true;layoutEd();drawEd();p.scrollIntoView({behavior:'smooth',block:'nearest'})}}
const edBase=()=>ED.target?ED.target._clip.start:0;
const gridTicks=()=>GRIDS[state.edGrid]||T16;
const edPPT=()=>state.edZoom/BAR;
const rowH=t=>t.type==='drums'?26:t.type==='audio'?120:14;
const rowCount=t=>t.type==='drums'?16:t.type==='audio'?1:PR_HI-PR_LO+1;
const BLACK=new Set([1,3,6,8,10]);
function edClearSel(){ED.sel.clear()}
function edVisible(){return currentTab==='song'&&$('#ed-panel').open&&!!edTrack()}

/* Geometrie */
function evRow(t,e){return t.type==='drums'?e[3]:t.type==='audio'?0:PR_HI-e[2]}
function evLen(t,e){return t.type==='inst'?e[4]:t.type==='audio'?clipTicks(e[2])||PPQ:T16}
function evShown(t,e){return t.type!=='drums'||e[2]===state.activeBank}
function vx(tick){return ED_LBL+tick*edPPT()-edEl.scroll.scrollLeft}
function vy(row,t){return ED_RULER+row*rowH(t)-edEl.scroll.scrollTop}
function xToTick(x){return Math.max(0,(x-ED_LBL+edEl.scroll.scrollLeft)/edPPT())}
function yToRow(y,t){return Math.floor((y-ED_RULER+edEl.scroll.scrollTop)/rowH(t))}
function evRect(t,e){const x=vx(e[0]),w=Math.max(t.type==='drums'?8:4,evLen(t,e)*edPPT()-(t.type==='drums'?2:1)),y=vy(evRow(t,e),t)+1,h=rowH(t)-2;return{x,y,w,h}}
function snapTick(tk){const g=gridTicks();return Math.max(0,Math.round(tk/g)*g)}
function floorTick(tk){const g=gridTicks();return Math.max(0,Math.floor(tk/g)*g)}

function layoutEd(){const t=edTrack();if(!t)return;const cl0=t._clip,bars=Math.max(8,Math.ceil((Math.max(cl0.len,cl0.cLen||0)+BAR*4)/BAR));
 edEl.spacer.style.width=(ED_LBL+bars*state.edZoom)+'px';edEl.spacer.style.height=(ED_RULER+rowCount(t)*rowH(t))+'px';
 const sc=edEl.scroll,w=sc.clientWidth,h=sc.clientHeight,dpr=window.devicePixelRatio||1,c=edEl.canvas;
 c.style.width=w+'px';c.style.height=h+'px';c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
 if(ED.lastTrack!==t.key){ED.lastTrack=t.key;sc.scrollLeft=0;sc.scrollTop=t.type==='inst'?Math.max(0,(PR_HI-76)*rowH(t)-h/2+ED_RULER):0}}
function drawEd(){const t=edTrack(),c=edEl.canvas;if(!t||!c.width)return;const g=c.getContext('2d'),dpr=window.devicePixelRatio||1,W=c.width/dpr,H=c.height/dpr;g.setTransform(dpr,0,0,dpr,0,0);
 const ppt=edPPT(),rh=rowH(t),rows=rowCount(t),t0=xToTick(ED_LBL),t1=xToTick(W);
 g.fillStyle='#0d1520';g.fillRect(0,0,W,H);
 const r0=Math.max(0,yToRow(ED_RULER,t)),r1=Math.min(rows-1,yToRow(H,t));
 for(let r=r0;r<=r1;r++){const y=vy(r,t);let col='#0f1823';if(t.type==='inst'){const n=PR_HI-r;col=BLACK.has(n%12)?'#0b121b':'#111a26';if(n%12===0){g.fillStyle='#1f2b3a';g.fillRect(ED_LBL,y+rh-1,W,1)}}else col=r%2?'#0f1823':'#121c29';
  g.fillStyle=col;g.fillRect(ED_LBL,y,W,rh-(t.type==='inst'&&(PR_HI-r)%12===0?1:0));if(t.type==='drums'){g.fillStyle='#1b2635';g.fillRect(ED_LBL,y+rh-1,W,1)}}
 const gt=gridTicks(),gpx=gt*ppt;
 for(let tk=Math.floor(t0/gt)*gt;tk<=t1;tk+=gt>1?gt:PPQ/4){const x=Math.round(vx(tk));if(x<ED_LBL)continue;const bar=tk%BAR===0,beat=tk%PPQ===0;if(!bar&&!beat&&gpx<7)continue;
  g.fillStyle=bar?'#34465c':beat?'#223146':'#17212f';g.fillRect(x,ED_RULER,1,H-ED_RULER)}
 g.save();g.beginPath();g.rect(ED_LBL,ED_RULER,W-ED_LBL,H-ED_RULER);g.clip();
 if(t.type==='audio'){drawClips(g,t.events,vy(0,t),rh,vx,t0,t1,t.color,1,ED.sel);if(rec.active&&rec.trackId===t.id){const x=vx(rec.startTick),w=recClipTicks()*ppt;g.fillStyle='#ff657740';g.fillRect(x,vy(0,t)+3,w,rh-6)}}
 else{const ev=t.events;let i=lowerBound(ev,t0-BAR*4);for(;i<ev.length;i++){const e=ev[i];if(e[0]>t1)break;if(!evShown(t,e))continue;const r=evRect(t,e);if(r.x+r.w<ED_LBL||r.y+r.h<ED_RULER||r.y>H)continue;
   const vel=t.type==='inst'?e[3]:e[4];g.globalAlpha=.45+.55*vel/127;g.fillStyle=t.color;g.fillRect(r.x,r.y,r.w,r.h);g.globalAlpha=1;
   if(t.type==='inst'&&r.w>10){g.fillStyle='#0008';g.fillRect(r.x+r.w-3,r.y+2,2,r.h-4)}
   if(t.type==='drums'&&e[5]){g.fillStyle='#0b1018';g.fillRect(r.x+2,r.y+2,4,4)}
   if(ED.sel.has(e)){g.strokeStyle='#ffffff';g.lineWidth=1.5;g.strokeRect(r.x+.75,r.y+.75,r.w-1.5,r.h-1.5)}}
  const cl=t._clip,endX=vx(cl.len);if(endX<W){g.fillStyle='#0b121bcc';g.fillRect(Math.max(ED_LBL,endX),ED_RULER,W,H)}g.fillStyle='#ffb94c';g.fillRect(Math.round(endX),ED_RULER,2,H)}
 const d=ED.drag;if(d&&d.mode==='band'){g.fillStyle='#65dfcf22';g.strokeStyle='#65dfcf';const x=Math.min(d.x0,d.x1),y=Math.min(d.y0,d.y1);g.fillRect(x,y,Math.abs(d.x1-d.x0),Math.abs(d.y1-d.y0));g.strokeRect(x+.5,y+.5,Math.abs(d.x1-d.x0),Math.abs(d.y1-d.y0))}
 g.restore();
 // labels
 g.fillStyle='#141d2a';g.fillRect(0,ED_RULER,ED_LBL,H);g.fillStyle='#303e4f';g.fillRect(ED_LBL-1,0,1,H);
 g.font='600 10px system-ui,sans-serif';g.textBaseline='middle';
 for(let r=r0;r<=r1;r++){const y=vy(r,t);if(y+rh<ED_RULER)continue;
  if(t.type==='inst'){const n=PR_HI-r;g.fillStyle=BLACK.has(n%12)?'#1b2330':'#d9e2ee';g.fillRect(0,y,ED_LBL-14,rh-1);if(n%12===0){g.fillStyle='#43526a';g.fillText(noteLabel(n),4,y+rh/2)}}
  else if(t.type==='drums'){g.fillStyle='#c6d4e5';g.fillText(`${r+1} ${nameFor(state.activeBank,r)}`.slice(0,10),5,y+rh/2)}
  else{g.fillStyle='#c6d4e5';g.fillText('Audio',6,y+rh/2)}}
 // liniaal
 g.fillStyle='#16202d';g.fillRect(0,0,W,ED_RULER);g.fillStyle='#303e4f';g.fillRect(0,ED_RULER-1,W,1);g.fillStyle='#91a5b9';
 let every=1;while(state.edZoom*every<40)every*=2;
 for(let b=Math.floor(t0/BAR);b*BAR<=t1;b++){if(b%every)continue;const x=vx(b*BAR);if(x<ED_LBL-1)continue;g.fillRect(Math.round(x),ED_RULER-6,1,5);g.fillText(String(b+1),x+3,ED_RULER/2)}
 g.fillStyle='#141d2a';g.fillRect(0,0,ED_LBL,ED_RULER);g.fillStyle='#91a5b9';g.fillText(t.type==='drums'?'BANK '+BANKS[state.activeBank]:'',5,ED_RULER/2);
 const lx=vx(song.locate-edBase());if(lx>=ED_LBL){g.fillStyle='#ffb94c';g.beginPath();g.moveTo(lx-5,0);g.lineTo(lx+5,0);g.lineTo(lx,8);g.closePath();g.fill()}
 const px=vx(songPlayTick()-edBase());if(px>=ED_LBL){g.fillStyle=recording&&playing&&state.songMode?'#ff6577':'#65dfcf';g.fillRect(Math.round(px),0,2,H)}}

function renderEditor(){const t=edTrack(),title=$('#ed-title');if(!title)return;
 title.textContent=t?`— ${t.name} (${t.type==='drums'?'drumgrid':'piano roll'})`:'— dubbeltik een notenclip in de playlist';
 $$('#ed-tool .chip').forEach(c=>c.classList.toggle('active',c.dataset.tool===ED.tool));$('#ed-grid').value=state.edGrid;
 $('#ed-audio').hidden=!(t&&t.type==='audio');$('#lat').value=state.recLatency;$('#lat-val').textContent=state.recLatency<0?'auto':state.recLatency+' ms';
 $('#ed-hint').textContent=!t?'':t.type==='audio'?'Tik op een clip om te selecteren, sleep om te verplaatsen. Vel-schuif = clip-volume. Opnemen: arm het audiospoor (R), ● Rec en ▶ Play.':
  (t.type==='drums'?'Rijen = de 16 pads van de actieve bank (wissel bank bij Pads). ':'')+'Teken: tik op een leeg vak = noot, tik op een noot = weg. Sleep een noot om te verplaatsen'+(t.type==='inst'?', sleep de rechterrand voor de lengte':'')+'. Sleep op een lege plek om te scrollen; tik links op een rij om te luisteren.';
 updateSelUI();layoutEd();drawEd()}
function updateSelUI(){const t=edTrack(),v=$('#ed-vel'),o=$('#ed-vel-val');if(!t){o.textContent='—';return}
 const sel=[...ED.sel];if(!sel.length){o.textContent='—';return}
 if(t.type==='audio'){const g=sel.reduce((a,e)=>a+(e[3]??1),0)/sel.length;v.value=Math.round(g*63.5);o.textContent=Math.round(g*100)+'%'}
 else{const k=t.type==='inst'?3:4,a=Math.round(sel.reduce((s,e)=>s+e[k],0)/sel.length);v.value=a;o.textContent=a}}
function trackEdited(t){t.events.sort((a,b)=>a[0]-b[0]);if(t._clip){const c=t._clip;c.events=t.events;
  const end=t.events.reduce((m,e)=>Math.max(m,e[0]+(e[1]===1?e[4]:T16)),0),need=Math.max(BAR,Math.ceil(end/BAR)*BAR),old=c.cLen||c.len;c.cLen=Math.max(old,need);if(c.len<=old&&c.len<c.cLen)c.len=c.cLen;rebuildFlat(t._track)}saveSongSoon();layoutTimeline();drawTimeline();drawEd();updateSelUI();updateSongTime()}

/* Hit-test */
function hitTest(t,x,y){if(t.type==='audio'){const yy=vy(0,t);if(y<yy||y>yy+rowH(t))return null;for(let i=t.events.length-1;i>=0;i--){const e=t.events[i],x0=vx(e[0]),x1=vx(e[0]+evLen(t,e));if(x>=x0&&x<=x1)return{e,edge:false}}return null}
 const tk=xToTick(x),ev=t.events;let i=Math.min(ev.length,lowerBound(ev,tk+1))-1;
 for(;i>=0;i--){const e=ev[i];if(!evShown(t,e))continue;const r=evRect(t,e);if(r.x+r.w<x-200)break;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return{e,edge:t.type==='inst'&&r.w>14&&x>r.x+r.w-9}}return null}
const edPos=ev=>{const r=edEl.canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top}};
function audition(t,e){if(t.type==='drums')triggerPad(e[2],e[3],e[4],null,{flash:false,songPlay:true});else if(t.type==='inst'){const n=e[2],tg=liveInstTarget();const v=makeVoice(ensureAudio(),liveTrackOut(t._track||t),n,e[3],ctx.currentTime+.003,t.inst);v.release(ctx.currentTime+.25)}}

edEl.canvas.addEventListener('pointerdown',ev=>{const t=edTrack();if(!t)return;ensureAudio();const {x,y}=edPos(ev);
 if(y<ED_RULER){setLocate(edBase()+xToTick(x));drawEd();return}
 if(x<ED_LBL){const r=yToRow(y,t);if(t.type==='drums'&&r>=0&&r<16)triggerPad(state.activeBank,r,105,null,{songPlay:true});else if(t.type==='inst'&&r>=0)audition(t,[0,1,PR_HI-r,100,0]);return}
 try{edEl.canvas.setPointerCapture(ev.pointerId)}catch(e){}
 ED.drag={id:ev.pointerId,x0:x,y0:y,x1:x,y1:y,sl:edEl.scroll.scrollLeft,st:edEl.scroll.scrollTop,hit:hitTest(t,x,y),moved:false,mode:null,mouse:ev.pointerType==='mouse',shift:ev.shiftKey||ev.metaKey}});
edEl.canvas.addEventListener('pointermove',ev=>{const d=ED.drag,t=edTrack();if(!d||d.id!==ev.pointerId||!t)return;const {x,y}=edPos(ev),dx=x-d.x0,dy=y-d.y0;
 if(!d.moved){if(Math.hypot(dx,dy)<5)return;d.moved=true;
  if(d.hit){d.mode=d.hit.edge?'resize':'move';pushHistory();if(!ED.sel.has(d.hit.e)){if(!d.shift)ED.sel.clear();ED.sel.add(d.hit.e)}d.orig=new Map([...ED.sel].map(e=>[e,e.slice()]))}
  else d.mode=ED.tool==='select'&&d.mouse?'band':'pan'}
 if(d.mode==='pan'){edEl.scroll.scrollLeft=d.sl-dx;edEl.scroll.scrollTop=d.st-dy;return}
 if(d.mode==='band'){d.x1=x;d.y1=y;drawEd();return}
 const ppt=edPPT(),ho=d.orig.get(d.hit.e);
 if(d.mode==='move'){const ns=state.edGrid==='off'?Math.max(0,Math.round(ho[0]+dx/ppt)):snapTick(ho[0]+dx/ppt),dt=ns-ho[0],dr=Math.round(dy/rowH(t));
  let minStart=Infinity;for(const o of d.orig.values())minStart=Math.min(minStart,o[0]);const dtc=Math.max(dt,-minStart);
  for(const [e,o] of d.orig){e[0]=o[0]+dtc;if(t.type==='inst')e[2]=clamp(o[2]-dr,PR_LO,PR_HI);else if(t.type==='drums')e[3]=clamp(o[3]+dr,0,15)}
  if(d.lastDr!==dr&&t.type!=='audio'){d.lastDr=dr;audition(t,d.hit.e)}drawEd();drawTimeline()}
 if(d.mode==='resize'){const end=snapTick(ho[0]+ho[4]+dx/ppt),delta=end-(ho[0]+ho[4]),minL=Math.max(PPQ/16,gridTicks()>1?gridTicks():T16/2);
  for(const [e,o] of d.orig)if(t.type==='inst')e[4]=Math.max(minL,o[4]+delta);drawEd();drawTimeline()}});
function edPointerEnd(ev){const d=ED.drag,t=edTrack();if(!d||d.id!==ev.pointerId)return;ED.drag=null;if(!t)return;
 if(!d.moved){edTap(t,d)}
 else if(d.mode==='move'||d.mode==='resize')trackEdited(t);
 else if(d.mode==='band'){const x0=Math.min(d.x0,d.x1),x1=Math.max(d.x0,d.x1),y0=Math.min(d.y0,d.y1),y1=Math.max(d.y0,d.y1);if(!d.shift)ED.sel.clear();
  for(const e of t.events){if(!evShown(t,e))continue;const r=evRect(t,e);if(r.x<x1&&r.x+r.w>x0&&r.y<y1&&r.y+r.h>y0)ED.sel.add(e)}drawEd()}
 updateSelUI()}
['pointerup','pointercancel'].forEach(n=>edEl.canvas.addEventListener(n,edPointerEnd));
edEl.canvas.addEventListener('contextmenu',e=>e.preventDefault());
function edTap(t,d){const {x0:x,y0:y,hit}=d;
 if(ED.tool==='select'||t.type==='audio'){if(hit){if(d.shift){ED.sel.has(hit.e)?ED.sel.delete(hit.e):ED.sel.add(hit.e)}else{ED.sel.clear();ED.sel.add(hit.e)}if(t.type!=='audio')audition(t,hit.e)}else if(!d.shift)ED.sel.clear();drawEd();updateSelUI();return}
 pushHistory();
 if(hit){t.events=t.events.filter(e=>e!==hit.e);ED.sel.delete(hit.e);trackEdited(t);return}
 const tk=state.edGrid==='off'?Math.round(xToTick(x)):floorTick(xToTick(x)),r=yToRow(y,t);if(r<0||r>=rowCount(t)){undoStack.pop();return}
 let e;if(t.type==='inst')e=[tk,1,PR_HI-r,100,Math.max(gridTicks()>1?gridTicks():T16,PPQ/16)];else e=[tk,0,state.activeBank,r,105,0];
 t.events.push(e);ED.sel.clear();ED.sel.add(e);audition(t,e);trackEdited(t)}

/* Bewerkingen */
function needSel(){if(!ED.sel.size){toast('Selecteer eerst noten (⬚ Selecteer of Alles)');return false}return true}
function edAll(){const t=edTrack();if(!t)return;ED.sel=new Set(t.events.filter(e=>evShown(t,e)));drawEd();updateSelUI();toast(`${ED.sel.size} geselecteerd`,null,1200)}
function edCopy(){const t=edTrack();if(!t||!needSel())return;const sel=[...ED.sel].sort((a,b)=>a[0]-b[0]);ED.clip={type:t.type,base:sel[0][0],events:sel.map(e=>e.slice())};toast(`${sel.length} gekopieerd`,null,1200)}
function edInsert(t,evs){pushHistory();for(const e of evs)t.events.push(e);ED.sel=new Set(evs);trackEdited(t)}
function edPaste(){const t=edTrack();if(!t)return;if(!ED.clip){toast('Klembord is leeg');return}if(ED.clip.type!==t.type){toast('Plakken kan alleen op een spoor van hetzelfde type');return}
 const at=Math.max(0,song.locate-edBase());edInsert(t,ED.clip.events.map(e=>{const n=e.slice();n[0]=e[0]-ED.clip.base+at;return n}));toast('Geplakt op de startpositie',null,1200)}
function edDup(){const t=edTrack();if(!t||!needSel())return;const sel=[...ED.sel];const s0=Math.min(...sel.map(e=>e[0])),s1=Math.max(...sel.map(e=>e[0]+evLen(t,e)));
 const shift=Math.max(BAR,Math.ceil((s1-Math.floor(s0/BAR)*BAR)/BAR)*BAR);edInsert(t,sel.map(e=>{const n=e.slice();n[0]+=shift;return n}))}
function edDel(){const t=edTrack();if(!t||!needSel())return;pushHistory();t.events=t.events.filter(e=>!ED.sel.has(e));ED.sel.clear();trackEdited(t);if(t.type==='audio')gcClipsLater()}
function edQuant(){const t=edTrack();if(!t)return;const g=gridTicks();if(g<=1){toast('Kies eerst een raster (niet “vrij”)');return}const tg=ED.sel.size?[...ED.sel]:t.events.filter(e=>evShown(t,e));if(!tg.length)return;
 pushHistory();for(const e of tg)e[0]=Math.max(0,Math.round(e[0]/g)*g);trackEdited(t);toast(`${tg.length} noten gequantized op ${state.edGrid}`,null,1500)}
function edShift(dir,big){const t=edTrack();if(!t||t.type==='audio'||!needSel())return;pushHistory();
 for(const e of ED.sel){if(t.type==='inst')e[2]=clamp(e[2]+dir*(big?12:1),PR_LO,PR_HI);else e[3]=clamp(e[3]+dir*-1,0,15)}trackEdited(t);const f=[...ED.sel][0];if(f)audition(t,f)}

$$('#ed-tool .chip').forEach(c=>c.onclick=()=>{ED.tool=c.dataset.tool;renderEditor()});
$('#ed-grid').onchange=e=>{state.edGrid=e.target.value;save();drawEd()};
$('#ed-zin').onclick=()=>edZoom(1.5);$('#ed-zout').onclick=()=>edZoom(1/1.5);
function edZoom(f){const sc=edEl.scroll,W=sc.clientWidth,center=(sc.scrollLeft+W/2-ED_LBL)/edPPT();state.edZoom=clamp(Math.round(state.edZoom*f),40,1200);layoutEd();sc.scrollLeft=Math.max(0,center*edPPT()-W/2+ED_LBL);drawEd();save()}
$('#ed-all').onclick=edAll;$('#ed-copy').onclick=edCopy;$('#ed-paste').onclick=edPaste;$('#ed-dup').onclick=edDup;$('#ed-del').onclick=edDel;$('#ed-quant').onclick=edQuant;
$('#ed-up').onclick=e=>edShift(1,e.shiftKey);$('#ed-down').onclick=e=>edShift(-1,e.shiftKey);
$('#ed-vel').oninput=e=>{const t=edTrack();if(!t||!ED.sel.size)return;if(!ED.velHist){pushHistory();ED.velHist=true}const v=+e.target.value;
 for(const s of ED.sel){if(t.type==='audio')s[3]=Math.round(v/63.5*100)/100;else if(t.type==='inst')s[3]=v;else s[4]=v}updateSelUI();if(t._track)rebuildFlat(t._track);drawEd();drawTimeline();saveSongSoon()};
$('#ed-vel').onchange=()=>{ED.velHist=false};
$('#lat').oninput=e=>{state.recLatency=+e.target.value;$('#lat-val').textContent=state.recLatency<0?'auto':state.recLatency+' ms';save()};
$('#ed-panel').addEventListener('toggle',()=>{if($('#ed-panel').open){layoutEd();drawEd()}});
let edQ=false;edEl.scroll.addEventListener('scroll',()=>{if(edQ)return;edQ=true;requestAnimationFrame(()=>{edQ=false;drawEd()})},{passive:true});
window.addEventListener('resize',()=>{if(edVisible()){layoutEd();drawEd()}});

/* Sneltoetsen (Mac: ⌘, Windows: Ctrl) — alleen in het Song-tabblad */
window.addEventListener('keydown',e=>{if(currentTab!=='song')return;const tg=e.target;if(tg&&tg.closest&&tg.closest('input:not([type=range]),select,textarea'))return;const mod=e.metaKey||e.ctrlKey;
 if(mod&&e.code==='KeyZ'){e.preventDefault();e.shiftKey?redo():undo();return}
 if(mod&&e.code==='KeyY'){e.preventDefault();redo();return}
 if(mod&&e.code==='KeyC'){e.preventDefault();edCopy();return}
 if(mod&&e.code==='KeyV'){e.preventDefault();edPaste();return}
 if(mod&&e.code==='KeyD'){e.preventDefault();edDup();return}
 if(mod&&e.code==='KeyA'){e.preventDefault();edAll();return}
 if(!mod&&(e.code==='Delete'||e.code==='Backspace')&&ED.sel.size){e.preventDefault();edDel();return}
 if(!mod&&(e.code==='ArrowUp'||e.code==='ArrowDown')&&ED.sel.size){e.preventDefault();edShift(e.code==='ArrowUp'?1:-1,e.shiftKey)}});
