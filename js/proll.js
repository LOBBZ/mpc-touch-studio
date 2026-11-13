'use strict';
/* =====================================================================
   Piano roll met de FL Studio-tools:
   ✏️ Teken · 🖌️ Penseel · ⬚ Selecteer · 🧽 Wis · 🔇 Demp · ✂️ Knip · 🎹 Stempel · 🔊 Speel
   Tools-menu: quantize (sterkte/eindes), legato, arpeggio, strum, chop, flip,
   randomize/humanize, glue, naar toonladder, octaaf erbij, velocity-rampen …
   Velocity-strook onderin, toonladder-markering, verticale zoom en knijp-zoom.
   ===================================================================== */
const PR={drag:null,touched:null};
const VEL_H=64;
const laneOn=t=>state.edVelLane&&(t.type==='inst'||t.type==='drums');
const muteIdx=t=>t.type==='inst'?5:6;
const isMuted=(t,e)=>!!e[muteIdx(t)];
function lastLen(){return Math.max(PPQ/16,ED.lastLen||(gridTicks()>1?gridTicks():T16))}

/* ---------- Tekenen (aangeroepen vanuit drawEd) ---------- */
function prDrawRows(g,t,W,r0,r1,rh){if(t.type!=='inst'||!state.edScaleHi)return;
 for(let r=r0;r<=r1;r++){const n=PR_HI-r;if(!inScale(n,TH.root,TH.scale))continue;const y=vy(r,t);g.fillStyle=((n-TH.root)%12+12)%12===0?'#9bd94a14':'#ffffff0b';g.fillRect(ED_LBL,y,W,rh-1)}}
function prNoteDeco(g,t,e,r){if(isMuted(t,e)){g.fillStyle='#171c1fcc';g.fillRect(r.x+1,r.y+1,r.w-2,r.h-2);g.strokeStyle='#a5b2b8';g.setLineDash([3,2]);g.lineWidth=1;g.strokeRect(r.x+.5,r.y+.5,r.w-1,r.h-1);g.setLineDash([])}
 if(t.type==='inst'&&r.w>28&&r.h>=11){g.fillStyle=isMuted(t,e)?'#a5b2b8':'#10150c';g.font=`600 ${Math.min(10,r.h-3)}px system-ui,sans-serif`;g.textBaseline='middle';g.fillText(noteLabel(e[2]),r.x+3,r.y+r.h/2)}}
function prKeyLabel(g,t,y,rh,n){if(!state.edScaleHi||!inScale(n,TH.root,TH.scale))return;g.fillStyle=((n-TH.root)%12+12)%12===0?'#6cc02c':'#ff9a2e';g.fillRect(ED_LBL-14,y+1,3,rh-2)}
function prDrawLane(g,t,W,H){if(!laneOn(t))return;const top=H-VEL_H,ppt=edPPT();
 g.fillStyle='#171c1f';g.fillRect(0,top,W,VEL_H);g.fillStyle='#434e55';g.fillRect(0,top,W,1);g.fillStyle='#a5b2b8';g.font='600 9px system-ui';g.textBaseline='top';g.fillText('VELOCITY',4,top+4);
 g.save();g.beginPath();g.rect(ED_LBL,top+1,W-ED_LBL,VEL_H);g.clip();const t0=xToTick(ED_LBL),t1=xToTick(W),ev=t.events,k=t.type==='inst'?3:4;
 for(let i=lowerBound(ev,t0-PPQ);i<ev.length;i++){const e=ev[i];if(e[0]>t1)break;if(!evShown(t,e))continue;const x=Math.round(vx(e[0]))+.5,h=(e[k]/127)*(VEL_H-12),y=top+VEL_H-4-h;
  g.strokeStyle=ED.sel.has(e)?'#ffffff':isMuted(t,e)?'#6b777d':t.color;g.lineWidth=2;g.beginPath();g.moveTo(x,top+VEL_H-4);g.lineTo(x,y);g.stroke();g.fillStyle=g.strokeStyle;g.beginPath();g.arc(x,y,3.2,0,7);g.fill()}
 g.restore()}

/* ---------- Bewerkingen ---------- */
function prTargets(t){return ED.sel.size?[...ED.sel]:t.events.filter(e=>evShown(t,e))}
function prRun(name,fn){const t=edTrack();if(!t||t.type==='audio'||t.type==='auto')return;const tg=prTargets(t);if(!tg.length){toast('Geen noten om te bewerken');return}
 pushHistory();const msg=fn(t,tg);trackEdited(t);if(msg!==false)toast(`${name}${typeof msg==='string'?': '+msg:''} (${tg.length} noten)`,null,1600)}
const byStart=a=>a.slice().sort((x,y)=>x[0]-y[0]||(x[2]-y[2]));
function groups(tg){const m=new Map();for(const e of tg){const k=e[0];if(!m.has(k))m.set(k,[]);m.get(k).push(e)}return [...m.entries()].sort((a,b)=>a[0]-b[0])}
const PR_TOOLS={
 quantize(t,tg){const g=gridTicks();if(g<=1){toast('Kies eerst een raster');return false}const str=state.edQStr/100;
  for(const e of tg){const q=Math.round(e[0]/g)*g;e[0]=Math.max(0,Math.round(e[0]+(q-e[0])*str));if(state.edQEnds&&t.type==='inst'){const end=e[0]+e[4],qe=Math.max(e[0]+g,Math.round(end/g)*g);e[4]=Math.round(e[4]+(qe-end)*str)}}
  return `${state.edGrid} · ${state.edQStr}%`},
 legato(t,tg){if(t.type!=='inst')return false;const st=[...new Set(tg.map(e=>e[0]))].sort((a,b)=>a-b);for(const e of tg){const nx=st.find(s=>s>e[0]);if(nx!=null)e[4]=nx-e[0]}},
 arp(t,tg){if(t.type!=='inst')return false;const step=gridTicks()>1?gridTicks():T16,out=[];
  for(const [st,ch] of groups(tg)){if(ch.length<2)continue;const len=Math.max(...ch.map(e=>e[4])),seq=ch.slice().sort((a,b)=>a[2]-b[2]);const mode=state.edArp;
   let order=mode==='down'?seq.slice().reverse():mode==='updown'?[...seq,...seq.slice(1,-1).reverse()]:mode==='random'?null:seq;
   t.events=t.events.filter(e=>!ch.includes(e));for(let k=0;k*step<len;k++){const src=order?order[k%order.length]:seq[Math.floor(Math.random()*seq.length)];out.push([st+k*step,1,src[2],src[3],Math.min(step,len-k*step)])}}
  if(!out.length){toast('Arpeggio: selecteer akkoorden (noten die tegelijk beginnen)');return false}t.events.push(...out);ED.sel=new Set(out);return state.edArp},
 strum(t,tg){if(t.type!=='inst')return false;const d=Math.round(PPQ/24);for(const [,ch] of groups(tg)){const s=ch.slice().sort((a,b)=>state.edArp==='down'?b[2]-a[2]:a[2]-b[2]);s.forEach((e,i)=>{e[0]+=i*d;e[4]=Math.max(PPQ/16,e[4]-i*d)})}},
 chop(t,tg){if(t.type!=='inst')return false;const step=gridTicks()>1?gridTicks():T16,out=[];for(const e of tg){if(e[4]<=step*1.01)continue;t.events=t.events.filter(x=>x!==e);for(let s=0;s<e[4];s+=step)out.push([e[0]+s,1,e[2],e[3],Math.min(step,e[4]-s)])}t.events.push(...out);ED.sel=new Set(out)},
 flipH(t,tg){const a=Math.min(...tg.map(e=>e[0])),b=Math.max(...tg.map(e=>e[0]+evLen(t,e)));for(const e of tg)e[0]=a+(b-(e[0]+evLen(t,e)))},
 flipV(t,tg){if(t.type==='inst'){const lo=Math.min(...tg.map(e=>e[2])),hi=Math.max(...tg.map(e=>e[2]));for(const e of tg)e[2]=clamp(hi-(e[2]-lo),PR_LO,PR_HI)}else for(const e of tg)e[3]=15-e[3]},
 randVel(t,tg){const k=t.type==='inst'?3:4;for(const e of tg)e[k]=clamp(Math.round(e[k]+(Math.random()*2-1)*24),20,127)},
 humanize(t,tg){const k=t.type==='inst'?3:4;for(const e of tg){e[0]=Math.max(0,Math.round(e[0]+(Math.random()*2-1)*PPQ/48));e[k]=clamp(Math.round(e[k]+(Math.random()*2-1)*12),20,127)}},
 glue(t,tg){if(t.type!=='inst')return false;const s=byStart(tg);let n=0;for(const e of s){if(!t.events.includes(e))continue;const nx=s.find(x=>x!==e&&x[2]===e[2]&&t.events.includes(x)&&Math.abs(x[0]-(e[0]+e[4]))<=PPQ/32);if(nx){e[4]=nx[0]+nx[4]-e[0];t.events=t.events.filter(x=>x!==nx);ED.sel.delete(nx);n++}}return n+' samengevoegd'},
 toScale(t,tg){if(t.type!=='inst')return false;for(const e of tg)e[2]=clamp(snapToScale(e[2],TH.root,TH.scale),PR_LO,PR_HI);return `${NOTE_NAMES[TH.root]} ${scaleOf(TH.scale)[1]}`},
 octUp(t,tg){if(t.type!=='inst')return false;const add=tg.filter(e=>e[2]+12<=PR_HI).map(e=>{const n=e.slice();n[2]+=12;return n});t.events.push(...add)},
 octDown(t,tg){if(t.type!=='inst')return false;const add=tg.filter(e=>e[2]-12>=PR_LO).map(e=>{const n=e.slice();n[2]-=12;return n});t.events.push(...add)},
 lenGrid(t,tg){if(t.type!=='inst')return false;const g=gridTicks()>1?gridTicks():T16;for(const e of tg)e[4]=g},
 lenHalf(t,tg){if(t.type!=='inst')return false;for(const e of tg)e[4]=Math.max(PPQ/16,Math.round(e[4]/2))},
 lenDouble(t,tg){if(t.type!=='inst')return false;for(const e of tg)e[4]=e[4]*2},
 cresc(t,tg){const k=t.type==='inst'?3:4,s=byStart(tg),a=s[0][0],b=s[s.length-1][0]||1;for(const e of s)e[k]=Math.round(40+80*(b>a?(e[0]-a)/(b-a):1))},
 decresc(t,tg){const k=t.type==='inst'?3:4,s=byStart(tg),a=s[0][0],b=s[s.length-1][0];for(const e of s)e[k]=Math.round(120-80*(b>a?(e[0]-a)/(b-a):1))},
 vel100(t,tg){const k=t.type==='inst'?3:4;for(const e of tg)e[k]=100},
 unmute(t,tg){for(const e of tg)e[muteIdx(t)]=0},
 dedupe(t,tg){const seen=new Set();let n=0;t.events=t.events.filter(e=>{if(!tg.includes(e))return true;const k=e[0]+':'+(t.type==='inst'?e[2]:e[2]+'/'+e[3]);if(seen.has(k)){n++;return false}seen.add(k);return true});return n+' dubbele weg'},
 invertSel(t){const all=t.events.filter(e=>evShown(t,e));ED.sel=new Set(all.filter(e=>!ED.sel.has(e)));drawEd();updateSelUI();return false}};
const PR_TOOL_NAMES={quantize:'Quantize',legato:'Legato',arp:'Arpeggio',strum:'Strum',chop:'Chop',flipH:'Flip horizontaal',flipV:'Flip verticaal',randVel:'Willekeurige velocity',humanize:'Humanize',glue:'Glue',toScale:'Naar toonladder',octUp:'Octaaf erbij (hoger)',octDown:'Octaaf erbij (lager)',lenGrid:'Lengte = raster',lenHalf:'Lengte ½',lenDouble:'Lengte ×2',cresc:'Crescendo',decresc:'Decrescendo',vel100:'Velocity 100',unmute:'Demping opheffen',dedupe:'Dubbele noten weg',invertSel:'Selectie omkeren'};
function prTool(k){if(k==='invertSel'){const t=edTrack();if(t)PR_TOOLS.invertSel(t);return}prRun(PR_TOOL_NAMES[k],PR_TOOLS[k])}

/* ---------- Aanwijzer: per tool ---------- */
function prLaneVel(y,H){return clamp(Math.round((H-4-y)/(VEL_H-12)*127),1,127)}
function prLaneApply(t,x0,v0,x1,v1){const k=t.type==='inst'?3:4,a=Math.min(x0,x1)-5,b=Math.max(x0,x1)+5;
 for(const e of t.events){if(!evShown(t,e))continue;if(ED.sel.size&&!ED.sel.has(e))continue;const x=vx(e[0]);if(x<a||x>b)continue;const f=x1===x0?1:clamp((x-x0)/(x1-x0),0,1);e[k]=clamp(Math.round(v0+(v1-v0)*f),1,127)}}
function prStampNotes(root){const s=state.edStamp||'c:maj7';if(s.startsWith('s:'))return{seq:scaleRun(root,s.slice(2),1,'up')};return{chord:chordNotes(root,s.slice(2),state.chVoicing)}}
function prPointerDown(t,x,y,ev){const H=edEl.canvas.clientHeight;
 if(laneOn(t)&&y>H-VEL_H){pushHistory();const v=prLaneVel(y,H);PR.drag={mode:'lane',id:ev.pointerId,x,v};prLaneApply(t,x,v,x,v);drawEd();return true}
 const tool=ED.tool;if(t.type==='audio'||['draw','select'].includes(tool))return false;
 const hit=hitTest(t,x,y),r=yToRow(y,t);
 if(tool==='paint'){if(hit)return false;if(r<0||r>=rowCount(t))return true;pushHistory();const tk=state.edGrid==='off'?Math.round(xToTick(x)):floorTick(xToTick(x)),L=t.type==='inst'?lastLen():Math.max(gridTicks(),T16);
  PR.drag={mode:'paint',id:ev.pointerId,row:r,start:tk,step:L,made:new Set([0])};prAddAt(t,r,tk,L);drawEd();return true}
 if(tool==='del'||tool==='mute'){pushHistory();PR.drag={mode:tool,id:ev.pointerId};PR.touched=new Set();prSweep(t,x,y);return true}
 if(tool==='play'){PR.drag={mode:'play',id:ev.pointerId,row:null};prPlayRow(t,r);return true}
 if(tool==='slice'){if(hit&&t.type==='inst'){const at=snapTick(xToTick(x)),e=hit.e;if(at>e[0]&&at<e[0]+e[4]){pushHistory();const n=e.slice();n[0]=at;n[4]=e[0]+e[4]-at;e[4]=at-e[0];t.events.push(n);trackEdited(t)}}return true}
 if(tool==='stamp'){if(t.type!=='inst'){toast('Stempel werkt in de piano roll (instrumentclip)');return true}if(r<0||r>=rowCount(t))return true;
  const root=PR_HI-r,tk=state.edGrid==='off'?Math.round(xToTick(x)):floorTick(xToTick(x)),L=lastLen(),st=prStampNotes(root);pushHistory();const add=[];
  if(st.chord)for(const n of st.chord)add.push([tk,1,clamp(n,PR_LO,PR_HI),100,L]);else st.seq.forEach((n,i)=>add.push([tk+i*L,1,clamp(n,PR_LO,PR_HI),100,L]));
  t.events.push(...add);ED.sel=new Set(add);trackEdited(t);playNotesTimed(st.chord||[root],.01,tickSec(L));return true}
 return false}
function prAddAt(t,r,tk,L){let e;if(t.type==='inst')e=[tk,1,PR_HI-r,100,L];else e=[tk,0,state.activeBank,r,105,0];
 if(t.events.some(x=>x[0]===tk&&(t.type==='inst'?x[2]===e[2]:x[2]===e[2]&&x[3]===e[3])))return;t.events.push(e);t.events.sort((a,b)=>a[0]-b[0]);audition(t,e)}
function prSweep(t,x,y){const h=hitTest(t,x,y);if(!h||PR.touched.has(h.e))return;PR.touched.add(h.e);
 if(PR.drag.mode==='del'){t.events=t.events.filter(e=>e!==h.e);t._clip.events=t.events;ED.sel.delete(h.e)}else{const k=muteIdx(t);if(t.type==='drums'&&h.e[5]==null)h.e[5]=0;h.e[k]=h.e[k]?0:1}drawEd()}
function prPlayRow(t,r){if(r==null||r<0||r>=rowCount(t)||PR.drag.row===r)return;PR.drag.row=r;if(t.type==='drums')triggerPad(state.activeBank,r,105,null,{songPlay:true,flash:false});else audition(t,[0,1,PR_HI-r,100,PPQ/2])}
function prPointerMove(t,x,y){const d=PR.drag,H=edEl.canvas.clientHeight;
 if(d.mode==='lane'){const v=prLaneVel(y,H);prLaneApply(t,d.x,d.v,x,v);d.x=x;d.v=v;drawEd();return}
 if(d.mode==='paint'){const tk=xToTick(x);if(tk<d.start)return;const k=Math.floor((tk-d.start)/d.step);let any=false;for(let j=0;j<=k;j++){if(d.made.has(j))continue;d.made.add(j);prAddAt(t,d.row,d.start+j*d.step,d.step);any=true}if(any)drawEd();return}
 if(d.mode==='del'||d.mode==='mute'){prSweep(t,x,y);return}
 if(d.mode==='play')prPlayRow(t,yToRow(y,t))}
function prPointerUp(t){const d=PR.drag;PR.drag=null;PR.touched=null;if(!t)return;if(d.mode==='play')return;if(d.mode==='lane'){updateSelUI()}trackEdited(t)}

/* ---------- Knijp-zoom (twee vingers) voor de piano roll én de playlist ---------- */
function attachPinch(el,{start,move,end}){const pts=new Map();let st=null;
 const dist=()=>{const [a,b]=[...pts.values()];return{dx:Math.abs(a.x-b.x),dy:Math.abs(a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2}};
 el.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pts.size===2){st=dist();start(st)}},true);
 el.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(st&&pts.size===2){const d=dist();move(st,d);e.stopImmediatePropagation()}},true);
 const up=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(st&&pts.size<2){st=null;end&&end();e.stopImmediatePropagation()}};
 el.addEventListener('pointerup',up,true);el.addEventListener('pointercancel',up,true);return{active:()=>!!st}}
const edPinch=attachPinch(edEl.canvas,{
 start(s){ED.drag=null;PR.drag=null;if(typeof AE!=='undefined')AE.drag=null;const r=edEl.canvas.getBoundingClientRect();s.z=state.edZoom;s.rh=edRH();s.sl=edEl.scroll.scrollLeft;s.st=edEl.scroll.scrollTop;s.tick=(s.mx-r.left-ED_LBL+s.sl)/edPPT();s.ry=(s.my-r.top-ED_RULER+s.st)/s.rh;s.rl=r.left;s.rt=r.top},
 move(s,d){const fx=(d.dx+30)/(s.dx+30),fy=(d.dy+30)/(s.dy+30);state.edZoom=clamp(Math.round(s.z*fx),40,1600);const t=edTrack();
  if(t&&t.type==='inst')state.edRowH=clamp(Math.round(s.rh*fy),8,40);layoutEd();edEl.scroll.scrollLeft=s.tick*edPPT()-(d.mx-s.rl-ED_LBL);if(t&&t.type==='inst')edEl.scroll.scrollTop=s.ry*state.edRowH-(d.my-s.rt-ED_RULER);drawEd()},
 end(){save()}});
const plPinch=attachPinch(tl.canvas,{
 start(s){PL.drag=null;s.z=state.songZoom;s.sl=tl.scroll.scrollLeft;const r=tl.canvas.getBoundingClientRect();s.rl=r.left;s.tick=(s.mx-r.left+s.sl)/pxPerTick()},
 move(s,d){state.songZoom=clamp(Math.round(s.z*(d.dx+30)/(s.dx+30)),6,320);layoutTimeline();tl.scroll.scrollLeft=Math.max(0,s.tick*pxPerTick()-(d.mx-s.rl));drawTimeline()},
 end(){save()}});

/* ---------- Werkbalk ---------- */
function renderPrBar(){const t=edTrack(),inst=t&&t.type==='inst';$('#pr-bar').hidden=!t||t.type==='audio'||t.type==='auto';if(!t)return;
 $$('.pr-inst-only').forEach(el=>el.hidden=!inst);
 if(inst){const s=$('#ed-inst');s.innerHTML=instOptionsHTML();s.value=t._track.inst}
 $('#ed-stamp').innerHTML='<optgroup label="Akkoord">'+CHORD_TYPES.map(c=>`<option value="c:${c[0]}">${'C'+c[1]} ${c[3]==='jazz'?'(jazz)':''}</option>`).join('')+'</optgroup><optgroup label="Toonladder (loopje)">'+SCALES.map(s=>`<option value="s:${s[0]}">${s[1]}</option>`).join('')+'</optgroup>';
 $('#ed-stamp').value=state.edStamp;$('#ed-qstr').value=state.edQStr;$('#ed-qends').checked=state.edQEnds;$('#ed-arp').value=state.edArp;
 $$('#pr-toggles [data-opt]').forEach(b=>b.classList.toggle('active',!!state[b.dataset.opt]));
 const H={draw:'✏️ Teken: tik = noot (in de lengte rechts), tik op noot = weg, sleep = verplaatsen, rechterrand = lengte.',paint:'🖌️ Penseel: sleep over een rij om noten te schilderen.',select:'⬚ Selecteer: tik of sleep een kader; daarna Tools, Kopieer, ▲▼.',del:'🧽 Wis: tik of veeg over noten.',mute:'🔇 Demp: tik op noten om ze stil te zetten (grijs) of weer aan.',slice:'✂️ Knip: tik op een noot om hem op die plek te knippen.',stamp:'🎹 Stempel: tik op een toonhoogte = akkoord of toonladder (kies bij Stempel) als grondtoon.',play:'🔊 Speel: veeg over de rijen om te luisteren.'};
 if(t.type!=='audio'&&t.type!=='auto')$('#ed-hint').textContent=(H[ED.tool]||'')+' Twee vingers = zoomen. Velocity-strook onderin: sleep om de aanslag te tekenen.';
 $('#ed-len').textContent=(DURATIONS.find(d=>d[1]===lastLen())||[Math.round(lastLen()/T16*100)/100+'/16'])[0]}
$('#ed-inst').onchange=e=>{const t=edTrack();if(!t)return;t._track.inst=e.target.value;t.inst=e.target.value;saveSongSoon();renderHeads();audition(t,[0,1,60,100,PPQ])};
$('#ed-stamp').onchange=e=>{state.edStamp=e.target.value;save()};
$('#ed-qstr').onchange=e=>{state.edQStr=+e.target.value;save()};$('#ed-qends').onchange=e=>{state.edQEnds=e.target.checked;save()};
$('#ed-arp').onchange=e=>{state.edArp=e.target.value;save()};
$('#ed-tools-menu').onchange=e=>{const k=e.target.value;e.target.value='';if(k)prTool(k)};
$('#pr-toggles').addEventListener('click',e=>{const b=e.target.closest('[data-opt]');if(!b)return;state[b.dataset.opt]=!state[b.dataset.opt];save();renderPrBar();layoutEd();drawEd()});
$('#ed-rh-in').onclick=()=>{state.edRowH=clamp(edRH()+3,8,40);layoutEd();drawEd();save()};$('#ed-rh-out').onclick=()=>{state.edRowH=clamp(edRH()-3,8,40);layoutEd();drawEd();save()};
$('#ed-len-btn').onclick=()=>{const L=DURATIONS.map(d=>d[1]),i=L.indexOf(lastLen());ED.lastLen=L[(i+1)%L.length];renderPrBar();toast('Nieuwe noten: '+$('#ed-len').textContent,null,1000)};
