'use strict';
/* =====================================================================
   Verbinden: MIDI Clock versturen/volgen, kanalen, pad-startnoot,
   activiteitslampjes en testnoot. Werkt met Web MIDI en met de bridge.
   ===================================================================== */
/* ---------- Lampjes ---------- */
const ledT={};
function midiLed(dir){const el=document.getElementById('led-'+dir);if(!el)return;el.classList.add('on');clearTimeout(ledT[dir]);ledT[dir]=setTimeout(()=>el.classList.remove('on'),90)}

/* ---------- MIDI Clock versturen (DAW volgt de app) ---------- */
const clk={on:false,next:0};
const perfAt=t=>performance.now()+(t-ctx.currentTime)*1000;
const bridgeClock=()=>midi.ws&&midi.ws.readyState===WebSocket.OPEN&&midi.paired&&midi.wsPort&&(midi.wsFeatures||[]).includes('clock');
function clockPosition(){return state.songMode?Math.max(0,Math.round(songPos/T16)):playCounter%state.stepLength} // in 16-den (MIDI beats)
function clockStart(t,resumed){if(!state.clockOut||!ctx)return;const pos=clockPosition(),cont=resumed||pos>0;
 if(midi.out){try{if(cont){midi.out.send([0xF2,pos&127,(pos>>7)&127],perfAt(t)-1);midi.out.send([0xFB],perfAt(t))}else midi.out.send([0xFA],perfAt(t))}catch(e){}}
 if(bridgeClock())try{midi.ws.send(JSON.stringify({type:'clock',action:cont?'continue':'start',spp:pos,bpm:state.bpm,delay_ms:Math.max(0,Math.round((t-ctx.currentTime)*1000))}))}catch(e){}
 clk.on=true;clk.next=t}
function clockSchedule(h){if(!clk.on||!midi.out)return;const iv=60/(state.bpm*24);try{while(clk.next<h){midi.out.send([0xF8],perfAt(clk.next));clk.next+=iv}}catch(e){}}
function clockStop(){if(!clk.on)return;clk.on=false;try{midi.out&&midi.out.send([0xFC])}catch(e){}if(bridgeClock())try{midi.ws.send(JSON.stringify({type:'clock',action:'stop'}))}catch(e){}}
function clockTempo(){if(clk.on&&bridgeClock())try{midi.ws.send(JSON.stringify({type:'clock',action:'tempo',bpm:state.bpm}))}catch(e){}}

/* ---------- MIDI Clock volgen (app volgt de DAW) ---------- */
let syncIn=null,inTicks=[];
function fillSyncIn(){const sel=$('#sync-in');if(!sel||!midi.access)return;const ins=[...midi.access.inputs.values()];sel.innerHTML='<option value="">Geen</option>';
 for(const p of ins){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.append(o)}
 let id=syncIn?.id||storeGet('mpcts-sync-in')||'';if(!ins.some(p=>p.id===id))id='';sel.value=id;selectSyncIn(id,true)}
function selectSyncIn(id,quiet){if(syncIn)syncIn.removeEventListener('midimessage',onSyncMsg);syncIn=id&&midi.access?midi.access.inputs.get(id)||null:null;
 if(syncIn&&midi.out&&syncIn.name===midi.out.name){syncIn=null;$('#sync-in').value='';toast('Kies voor sync een andere poort dan de uitgang (bijv. IAC Bus 2)');return}
 if(syncIn)syncIn.addEventListener('midimessage',onSyncMsg);storeSet('mpcts-sync-in',syncIn?syncIn.id:'');if(!quiet&&syncIn)toast('Sync-ingang: '+syncIn.name)}
function onSyncMsg(e){const st=e.data[0];if(st<0xF0)return;if(st!==0xF8)midiLed('in');if(!state.clockFollow)return;
 if(st===0xF8){inTicks.push(e.timeStamp);if(inTicks.length>49)inTicks.shift();
  if(inTicks.length>=25){const span=inTicks[inTicks.length-1]-inTicks[inTicks.length-25];if(span>0){const bpm=Math.round(60000/span);if(bpm>=45&&bpm<=240&&Math.abs(bpm-state.bpm)>=1)setBpm(bpm)}}}
 else if(st===0xFA){inTicks=[];stopTransport();startTransport()}
 else if(st===0xFB){if(!playing)startTransport()}
 else if(st===0xFC){if(playing)pauseTransport()}
 else if(st===0xF2&&!playing&&state.songMode){const pos=e.data[1]|(e.data[2]<<7);setLocate(pos*T16)}}

/* ---------- Instellingen-UI ---------- */
const abletonName=n=>NAME_TO_NOTE[n%12]+(Math.floor(n/12)-2);
function renderConnect(){const pc=$('#pad-ch'),kc=$('#key-ch'),pb=$('#pad-base');if(!pc)return;
 if(!pc.options.length){for(let c=0;c<16;c++){pc.add(new Option(`Kanaal ${c+1}${c===9?' (drums)':''}`,c));kc.add(new Option(`Kanaal ${c+1}`,c))}
  for(let n=0;n<=64;n++)pb.add(new Option(`${n} · ${abletonName(n)} Ableton/Logic · ${NAME_TO_NOTE[n%12]}${Math.floor(n/12)-1} FL`,n))}
 pc.value=state.padCh;kc.value=state.keyCh;pb.value=state.padBase;$('#clock-out').checked=state.clockOut;$('#clock-follow').checked=state.clockFollow;
 $('#pad-range').textContent=`Pads A01–D16 = noot ${state.padBase}–${Math.min(127,state.padBase+63)} op kanaal ${state.padCh+1}`;
 const d={fl:['Options → MIDI Settings → kies de IAC/loopMIDI-ingang bij “Sync” of zet in de lijst de synchronisatie op MIDI clock, en zet daarna “External sync” aan (de naam verschilt per FL-versie).','Options → MIDI Settings → Output: kies een poort en zet “Send master sync” aan.'],
  ableton:['Settings → Link, Tempo & MIDI → bij de ingang (IAC/loopMIDI) “Sync” aan → klik op EXT naast het tempo.','Settings → Link, Tempo & MIDI → bij een uitgang (bijv. IAC Bus 2) “Sync” aan.'],
  logic:['Projectinstellingen → Synchronisatie → MIDI: luister naar MIDI-clock-invoer (Logic 10.7 of nieuwer).','Projectinstellingen → Synchronisatie → MIDI: verstuur MIDI-clock naar bestemming “IAC Bus 2”.']}[state.daw]||['',''];
 $('#sync-hint').innerHTML='';const h=$('#sync-hint');
 const line=(b,t)=>{const p=document.createElement('div');p.className='stat';const s1=document.createElement('strong'),s2=document.createElement('span');s1.textContent=b;s2.textContent=t;p.append(s1,s2);h.append(p)};
 line('DAW volgt app',d[0]);line('App volgt DAW',d[1]+' Kies die poort hierboven als sync-ingang. Gebruik daarvoor een tweede IAC-bus, niet dezelfde als de uitgang.')}
$('#pad-ch').onchange=e=>{midiSend({type:'alloff'});state.padCh=+e.target.value;if(state.keyCh===state.padCh)toast('Let op: pads en klavier staan nu op hetzelfde kanaal');renderConnect();save()};
$('#key-ch').onchange=e=>{midiSend({type:'alloff'});state.keyCh=+e.target.value;renderConnect();save()};
$('#pad-base').onchange=e=>{midiSend({type:'alloff'});state.padBase=+e.target.value;renderConnect();save()};
$('#clock-out').onchange=e=>{state.clockOut=e.target.checked;if(state.clockOut&&state.clockFollow){state.clockFollow=false;toast('“App volgt DAW” uitgezet: er kan maar één de baas zijn over het tempo')}
 if(state.clockOut&&!midi.out&&!bridgeClock())toast('Kies eerst een MIDI-uitgang (Web MIDI) of een bridge v2',null,4000);renderConnect();save()};
$('#clock-follow').onchange=e=>{state.clockFollow=e.target.checked;if(state.clockFollow&&state.clockOut){state.clockOut=false;clockStop();toast('“DAW volgt app” uitgezet: er kan maar één de baas zijn over het tempo')}
 if(state.clockFollow&&!syncIn)toast('Kies nog een sync-ingang (bijv. IAC Bus 2)',null,4000);renderConnect();save()};
$('#sync-in').onchange=e=>selectSyncIn(e.target.value);
$('#midi-test').onclick=()=>{const ok=midi.out||(midi.paired&&midi.wsPort);
 midiSend({type:'note',note:drumNote(state.activeBank,0),velocity:110,channel:state.padCh,delay_ms:0,duration_ms:150});
 midiSend({type:'note',note:60,velocity:100,channel:state.keyCh,delay_ms:250,duration_ms:400});
 triggerPad(state.activeBank,0,110,null,{midiIn:true,songPlay:true});
 toast(ok?`Testnoten verstuurd: pad ${drumNote(state.activeBank,0)} (kanaal ${state.padCh+1}) en C (kanaal ${state.keyCh+1})`:'Nog geen MIDI-verbinding: alleen lokaal geluid',null,3500)};
$$('#daw-picks .chip').forEach(c=>c.addEventListener('click',renderConnect));
