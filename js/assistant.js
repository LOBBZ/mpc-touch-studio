'use strict';
/* =====================================================================
   💬 AI-assistent (Claude): praat in gewone taal met de app.
   Hij leest het project, schrijft beats/akkoorden/melodieën, bedient de
   mixer en effecten, je VST3-plugins (via de bridge), doet AI Mix/Master,
   vergelijkt met een referentietrack en geeft genre-advies.
   Werkt met je eigen Anthropic API-sleutel (blijft op dit apparaat).
   ===================================================================== */
const AIC={msgs:[],history:[],busy:false,ref:null,rec:null,abort:null};
const AIC_MODELS=[['claude-sonnet-5-5','Claude Sonnet 5.5 (snel, aanbevolen)'],['claude-opus-5-5','Claude Opus 5.5 (slimst)'],['claude-haiku-5-5','Claude Haiku 5.5 (goedkoopst)']];
const aicKey=()=>{try{return localStorage.getItem('mpcts-aikey')||''}catch(e){return''}};
const aicModel=()=>state.aiModel||AIC_MODELS[0][0];
try{const r=JSON.parse(localStorage.getItem('mpcts-ref')||'null');if(r&&Array.isArray(r.bands))AIC.ref=r}catch(e){}

/* ---------- referentietrack ---------- */
async function loadReference(file){const ac=ensureAudio();toast('Referentie analyseren…',null,2500);const buf=await decode(ac,await file.arrayBuffer());const a=analyze(buf);
 AIC.ref={name:file.name.replace(/\.[^.]+$/,'').slice(0,60),lufs:a.lufs,tp:a.tp,crest:a.crest,rms:a.rms,corr:a.corr,side:a.side,bands:a.bands,centroid:a.centroid,dur:a.dur};
 try{localStorage.setItem('mpcts-ref',JSON.stringify(AIC.ref))}catch(e){}renderAsst();if(typeof renderInsertFx==='function'&&currentTab==='mixer')renderInsertFx();
 toast(`Referentie: ${AIC.ref.name} · ${a.lufs.toFixed(1)} LUFS`);return AIC.ref}
const REGIONS=[['sub (20–60 Hz)',20,60],['bas (60–150 Hz)',60,150],['laag-mid (150–400 Hz)',150,400],['mid (400 Hz–2 kHz)',400,2000],['hoog-mid (2–6 kHz)',2000,6000],['hoog (6–12 kHz)',6000,12000],['lucht (12–20 kHz)',12000,20000]];
function tonalProfile(a){const mean=bandAvg(a,200,5000);return REGIONS.map(([n,f0,f1])=>{let s=0,c=0;BANDS3.forEach((f,i)=>{if(f>=f0&&f<=f1){s+=a.bands[i]-mean+4.5*Math.log2(f/1000);c++}});return{region:n,db:c?+(s/c).toFixed(1):0}})}
function compareToRef(a,r){const pa=tonalProfile(a),pr=tonalProfile(r);
 return{loudness_lufs:{mix:+a.lufs.toFixed(1),referentie:+r.lufs.toFixed(1),verschil:+(a.lufs-r.lufs).toFixed(1)},true_peak_dbtp:{mix:+a.tp.toFixed(1),referentie:+r.tp.toFixed(1)},
  dynamiek_crest_db:{mix:+a.crest.toFixed(1),referentie:+r.crest.toFixed(1)},stereo_correlatie:{mix:+a.corr.toFixed(2),referentie:+r.corr.toFixed(2)},
  klankbalans_db_mix_min_referentie:pa.map((x,i)=>({band:x.region,verschil:+(x.db-pr[i].db).toFixed(1)}))}}
function refCurve(r){const mean=bandAvg(r,200,5000);return BANDS3.map((f,i)=>[f,r.bands[i]-mean+4.5*Math.log2(f/1000)])}

/* ---------- hulpjes ---------- */
const NOTE_RE=/^([A-Ga-g])([#b♯♭]?)(-?\d)$/;
function parsePitch(p){if(typeof p==='number')return clamp(Math.round(p),0,127);const m=String(p).trim().match(NOTE_RE);if(!m)throw new Error('onbekende toonhoogte '+p);
 const pc={c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()]+(m[2]==='#'||m[2]==='♯'?1:m[2]==='b'||m[2]==='♭'?-1:0);return clamp((+m[3]+1)*12+pc,0,127)}
const CHORD_ALIAS={'':'maj',M:'maj',maj:'maj',major:'maj',m:'min',min:'min',mi:'min','-':'min',minor:'min','7':'7',dom7:'7',maj7:'maj7',M7:'maj7','Δ':'maj7','Δ7':'maj7',m7:'m7',min7:'m7','-7':'m7',
 'ø':'m7b5','ø7':'m7b5',m7b5:'m7b5','°':'dim','o':'dim','°7':'dim7',o7:'dim7',dim:'dim',dim7:'dim7','+':'aug',aug:'aug',sus:'sus4',sus2:'sus2',sus4:'sus4','6':'6',m6:'m6','9':'9',maj9:'maj9',m9:'m9',min9:'m9',
 '11':'11',m11:'m11','13':'13',m13:'m13',maj13:'maj13',add9:'add9',madd9:'madd9','69':'69','6/9':'69',m69:'m69',mmaj7:'mmaj7','m(maj7)':'mmaj7','7b9':'7b9','7#9':'7s9','7b5':'7b5','7#5':'7s5','7#11':'7s11','7b13':'7b13',
 '13#11':'13s11','13b9':'13b9','7alt':'7alt',alt:'7alt','9sus4':'9sus4','13sus4':'13sus4',m7b9:'m7b9','maj7#11':'maj7s11','maj7#5':'maj7s5','5':'5'};
function parseChord(name){const m=String(name).trim().replace(/♭/g,'b').replace(/♯/g,'#').match(/^([A-G])([#b]?)(.*)$/);if(!m)throw new Error('onbekend akkoord '+name);
 const pc=({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12)%12;let suf=m[3].replace(/\s+/g,'').split('/')[0];
 let id=CHORD_ALIAS[suf];if(!id){const t=CHORD_TYPES.find(c=>c[1].replace(/♭/g,'b').replace(/♯/g,'#')===suf||c[0]===suf);id=t&&t[0]}if(!id)throw new Error('onbekend akkoordtype '+suf);
 const bass=m[3].includes('/')?m[3].split('/')[1]:null;return{pc,id,bass}}
const trById=id=>{const t=song.tracks.find(x=>x.id===+id)||song.tracks.find(x=>x.name.toLowerCase()===String(id).toLowerCase());if(!t)throw new Error('spoor niet gevonden: '+id);return t};
const fxKey=t=>t==='master'||t===0||t==='0'?'master':clamp(+t|0,1,N_INSERTS);
const bars=t=>+(t/BAR).toFixed(2);
function compactSlot(s){const p={...s.p};if(s.type==='eq')p.bands=s.p.bands.map((b,i)=>b.on?{n:i+1,type:b.type,f:Math.round(b.f),g:b.g,q:b.q}:null).filter(Boolean);return{id:s.id,type:s.type,on:s.on,label:s.label||FXT[s.type].name,p}}

/* ---------- tools ---------- */
const AIC_TOOLS=[
 {name:'get_state',description:'Lees het hele project: tempo, sporen met clips, mixer-inserts met effecten en VST3-plugins, master, pads, instrumenten, beschikbare effecttypes en de referentietrack. Gebruik dit eerst als je iets wilt veranderen.',input_schema:{type:'object',properties:{}}},
 {name:'set_tempo',description:'Zet het tempo (BPM).',input_schema:{type:'object',properties:{bpm:{type:'number'}},required:['bpm']}},
 {name:'transport',description:'Afspelen/stoppen/naar het begin, en kiezen tussen song (playlist) en pattern.',input_schema:{type:'object',properties:{action:{type:'string',enum:['play','stop','to_start']},mode:{type:'string',enum:['song','pattern']},bar:{type:'number',description:'startmaat (1 = begin)'}}}},
 {name:'add_track',description:'Nieuw spoor in de playlist.',input_schema:{type:'object',properties:{type:{type:'string',enum:['drums','inst','audio']},name:{type:'string'},instrument:{type:'string'}},required:['type']}},
 {name:'update_track',description:'Spoor aanpassen: naam, volume (0–100), pan (−100..100), mute, solo, mixer-insert (0=master, 1–32), instrument, type.',input_schema:{type:'object',properties:{track_id:{type:['number','string']},name:{type:'string'},volume:{type:'number'},pan:{type:'number'},mute:{type:'boolean'},solo:{type:'boolean'},insert:{type:'number'},instrument:{type:'string'},type:{type:'string',enum:['drums','inst','audio']}},required:['track_id']}},
 {name:'write_notes',description:'Schrijf een notenclip (melodie, bas, akkoorden met losse noten) op een spoor. start en length in tellen (kwartnoten) vanaf het begin van de clip; pitch als "C4" (C4 = midden-C) of MIDI-nummer.',input_schema:{type:'object',properties:{track_id:{type:['number','string']},start_bar:{type:'number',description:'1 = eerste maat'},bars:{type:'number'},name:{type:'string'},replace:{type:'boolean',description:'bestaande clips in dat stuk eerst weghalen'},notes:{type:'array',items:{type:'object',properties:{pitch:{type:['string','number']},start:{type:'number'},length:{type:'number'},velocity:{type:'number'}},required:['pitch','start','length']}}},required:['track_id','start_bar','notes']}},
 {name:'write_chords',description:'Schrijf een akkoordprogressie als notenclip. Akkoorden als namen ("Cm9","F7alt","Bbmaj7/D") of als trappen ("ii","V7","Imaj7") met key+scale. Voicing: close, inv1, inv2, inv3, drop2, drop3, spread, shell, rootlessA, rootlessB, bass.',input_schema:{type:'object',properties:{track_id:{type:['number','string']},start_bar:{type:'number'},chords:{type:'array',items:{type:'string'}},beats_each:{type:'number',description:'tellen per akkoord (standaard 4)'},voicing:{type:'string'},octave:{type:'number',description:'octaaf van de grondtoon (standaard 3)'},key:{type:'string'},scale:{type:'string'},velocity:{type:'number'},replace:{type:'boolean'},repeat:{type:'number'}},required:['track_id','start_bar','chords']}},
 {name:'drum_pattern',description:'Schrijf een drumpatroon (Channel Rack). pad 1–16 (bank A) of padnaam; steps 1–32 (16 = één maat bij 1/16). Daarna met place_pattern in de playlist zetten.',input_schema:{type:'object',properties:{pattern:{type:'number',description:'patroonnummer 1–999'},name:{type:'string'},steps_length:{type:'number',enum:[16,32]},clear:{type:'boolean'},bank:{type:'string',enum:['A','B','C','D']},hits:{type:'array',items:{type:'object',properties:{pad:{type:['number','string']},steps:{type:'array',items:{type:'number'}},velocity:{type:'number'},tune:{type:'number'}},required:['pad','steps']}}},required:['pattern','hits']}},
 {name:'place_pattern',description:'Zet een patroon als clip in de playlist.',input_schema:{type:'object',properties:{pattern:{type:'number'},track_id:{type:['number','string']},start_bar:{type:'number'},bars:{type:'number'}},required:['pattern','track_id','start_bar']}},
 {name:'delete_clips',description:'Clips van een spoor verwijderen (alles of tussen maten).',input_schema:{type:'object',properties:{track_id:{type:['number','string']},from_bar:{type:'number'},to_bar:{type:'number'}},required:['track_id']}},
 {name:'mixer',description:'Een mixer-insert of de master instellen: naam, volume in dB, pan, mute, solo, reverb- en delay-send (0–150).',input_schema:{type:'object',properties:{target:{type:['number','string'],description:'1–32 of "master"'},name:{type:'string'},volume_db:{type:'number'},pan:{type:'number'},mute:{type:'boolean'},solo:{type:'boolean'},reverb_send:{type:'number'},delay_send:{type:'number'}},required:['target']}},
 {name:'add_effect',description:'Ingebouwd effect toevoegen aan een insert of de master. Types: eq, comp, mb, sat, deess, gate, trans, reverb, delay, chorus, imager, util, limiter. EQ-banden: {type: bell|lowshelf|highshelf|lowcut|highcut|notch|bandpass, f, g, q, slope}.',input_schema:{type:'object',properties:{target:{type:['number','string']},type:{type:'string'},params:{type:'object'},label:{type:'string'}},required:['target','type']}},
 {name:'set_effect',description:'Effect aanpassen (params samenvoegen, aan/uit) of verwijderen.',input_schema:{type:'object',properties:{target:{type:['number','string']},slot_id:{type:'string'},params:{type:'object'},on:{type:'boolean'},remove:{type:'boolean'}},required:['target','slot_id']}},
 {name:'ai_mix',description:'Voer de automatische AI Mix uit op alle sporen (gain staging, EQ, compressie, pan, sends).',input_schema:{type:'object',properties:{}}},
 {name:'ai_master',description:'Automatische master. target: stream (−14), apple (−16), pop (−10), hiphop (−9), club (−8), dyn (−16), ref (referentietrack). genre: balanced, hiphop, edm, pop, rnb, rock, jazz, reference.',input_schema:{type:'object',properties:{target:{type:'string'},genre:{type:'string'}}}},
 {name:'analyze_mix',description:'Render en meet de huidige mix (LUFS, true peak, dynamiek, stereo, klankbalans per band) en vergelijk met de referentietrack als die er is. Gebruik dit voor advies.',input_schema:{type:'object',properties:{}}},
 {name:'vst',description:'VST3-plugins via de bridge op de pc. actions: scan (lijst), add (plugin zoeken op naam en op target zetten), params (parameters lezen, optioneel search), set (changes: [{key, value} in echte eenheden of {key, raw 0–1}]), open (venster op de pc), remove, freeze (insert renderen), master_wav (master door VST3 exporteren), ai_to_plugin (AI-EQ/compressie in de plugin zetten).',input_schema:{type:'object',properties:{action:{type:'string',enum:['scan','add','params','set','open','remove','freeze','master_wav','ai_to_plugin']},target:{type:['number','string']},plugin:{type:'string'},index:{type:'number',description:'positie in de VST-keten (1 = eerste)'},search:{type:'string'},changes:{type:'array',items:{type:'object'}}},required:['action']}},
 {name:'export',description:'Exporteer de song als wav of midi.',input_schema:{type:'object',properties:{format:{type:'string',enum:['wav','midi']}},required:['format']}},
 {name:'undo',description:'Laatste wijziging ongedaan maken.',input_schema:{type:'object',properties:{steps:{type:'number'}}}}];

async function vstReady(){if(!(VST.status&&VST.status.available)){try{VST.status=await vstCall('/vst/status')}catch(e){throw new Error(`bridge niet bereikbaar op ${vstBase()}: start de Windows-app of MPC-Touch-Bridge.exe op je pc (zelfde wifi) en vul adres + PIN in bij Mixer → VST3`)}if(!VST.status.available)throw new Error('VST3 staat uit op de bridge: '+(VST.status.error||''));VST.list=(await vstCall('/vst/scan')).plugins||[]}}
const AIC_RUN={
 async get_state(){const used=new Set(song.tracks.filter(t=>t.clips.length).map(t=>t.insert));
  return{bpm:state.bpm,mode:state.songMode?'song':'pattern',song_bars:bars(songLength()),
   tracks:song.tracks.filter(t=>t.clips.length||t.arm||song.tracks.indexOf(t)<4).map(t=>({id:t.id,name:t.name,type:t.type,instrument:t.inst,insert:t.insert,volume:t.vol,pan:t.pan,mute:t.mute,solo:t.solo,
    clips:t.clips.map(c=>({kind:c.kind,start_bar:bars(c.start)+1,bars:bars(c.len),name:c.name||(c.kind==='pattern'?patName(c.pat):''),pattern:c.kind==='pattern'?c.pat+1:undefined,notes:c.kind==='notes'?c.events.length:undefined,mute:c.mute||undefined}))})),
   empty_tracks:song.tracks.filter(t=>!t.clips.length).length,
   inserts:song.inserts.filter(s=>used.has(s.id)||(s.slots||[]).length||(s.vst||[]).length).map(s=>({id:s.id,name:s.name,volume_db:+(20*Math.log10(Math.max(1e-4,s.vol/100))).toFixed(1),pan:s.pan,mute:s.mute,reverb_send:fxOf(s).rev,delay_send:fxOf(s).dly,effects:(s.slots||[]).map(compactSlot),vst:(s.vst||[]).map((v,i)=>({index:i+1,name:v.name}))})),
   master:{fader:state.master,effects:slotsOf('master').map(compactSlot),vst:vstChain('master').map((v,i)=>({index:i+1,name:v.name}))},
   pads_bank_A:Array.from({length:16},(_,i)=>`${i+1}: ${nameFor(0,i)}`),patterns_with_notes:state.patterns.map((_,i)=>i).filter(patHasNotes).map(i=>`${i+1}: ${patName(i)}`),
   instruments:[...INST_IDS,...[...userInsts.values()].map(u=>'u:'+u.id+' ('+u.name+')')],effect_types:Object.keys(FXT),
   vst_bridge:VST.status?{available:!!VST.status.available,plugins:VST.list.slice(0,200).map(p=>p.vendor?p.vendor+' / '+p.name:p.name)}:'niet verbonden (probeer vst scan)',
   reference:AIC.ref?{name:AIC.ref.name,lufs:+AIC.ref.lufs.toFixed(1),crest:+AIC.ref.crest.toFixed(1),klankbalans:tonalProfile(AIC.ref)}:null}},
 async set_tempo({bpm}){state.bpm=clamp(Math.round(bpm),40,300);save();if(typeof updateLCD==='function')updateLCD();const b=$('#bpm');if(b)b.value=state.bpm;return{bpm:state.bpm}},
 async transport({action,mode,bar}){if(mode)setMode(mode);if(bar)setLocate((bar-1)*BAR);if(action==='play'&&!playing)$('#play').click();if(action==='stop')$('#stop').click();if(action==='to_start'){setLocate(0)}return{ok:true}},
 async add_track({type,name,instrument}){const t=newTrack(type);if(name)t.name=String(name).slice(0,20);if(instrument&&validInst(instrument))t.inst=instrument;return{track_id:t.id,name:t.name}},
 async update_track(a){const t=trById(a.track_id);if(a.name)t.name=String(a.name).slice(0,20);if(a.volume!=null)t.vol=clamp(a.volume,0,100);if(a.pan!=null)t.pan=clamp(a.pan,-100,100);if(a.mute!=null)t.mute=!!a.mute;if(a.solo!=null)t.solo=!!a.solo;
  if(a.insert!=null){t.insert=clamp(a.insert|0,0,N_INSERTS);rerouteTrack(t)}if(a.instrument){if(!validInst(a.instrument))throw new Error('onbekend instrument');t.inst=a.instrument}if(a.type)t.type=a.type;updateTrackGains();return{ok:true,track:t.name}},
 async write_notes(a){const t=trById(a.track_id),st=Math.max(0,(a.start_bar-1)*BAR),ev=a.notes.map(n=>[Math.max(0,Math.round(n.start*PPQ)),1,parsePitch(n.pitch),clamp(Math.round(n.velocity||100),1,127),Math.max(PPQ/16,Math.round(n.length*PPQ))]).sort((x,y)=>x[0]-y[0]);
  const end=ev.reduce((m,e)=>Math.max(m,e[0]+e[4]),0),len=a.bars?Math.round(a.bars*BAR):Math.max(BAR,Math.ceil(end/BAR)*BAR);if(a.replace)t.clips=t.clips.filter(c=>c.start+c.len<=st||c.start>=st+len);
  const c={id:newClipId(),kind:'notes',nt:t.type==='drums'?'inst':'inst',start:st,len,cLen:len,off:0,mute:false,name:(a.name||t.name).slice(0,40),events:ev};t.clips.push(c);if(t.type==='audio')t.type='inst';rebuildFlat(t);return{clip_notes:ev.length,start_bar:a.start_bar,bars:bars(len)}},
 async write_chords(a){const t=trById(a.track_id),beats=a.beats_each||4,oct=a.octave??3,vel=a.velocity||92,ev=[];let pos=0;const rep=clamp(a.repeat||1,1,16);
  const keyPc=a.key?parseChord(a.key.replace(/m(in(or)?)?$/i,'')).pc:TH.root,scale=a.scale||(a.key&&/m(in(or)?)?$/i.test(a.key)?'minor':TH.scale),dia=diatonic(keyPc,scale,true),dia3=diatonic(keyPc,scale,false);
  for(let r=0;r<rep;r++)for(const ch of a.chords){let pc,id,bass=null;const rm=String(ch).match(/^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
   if(rm&&dia.length){const deg=['i','ii','iii','iv','v','vi','vii'].indexOf(rm[2].toLowerCase()),suf=rm[3];const d=(suf&&/7|9|11|13/.test(suf)?dia:dia3)[deg];pc=(d.root+(rm[1]==='b'?-1:rm[1]==='#'?1:0)+12)%12;id=suf&&CHORD_ALIAS[suf.replace('°','dim')]&&!/^7$/.test(suf)?CHORD_ALIAS[suf]:d.type}
   else({pc,id,bass}=parseChord(ch));let ns=chordNotes((oct+1)*12+pc,id,a.voicing||'close');if(bass){const b=parseChord(bass).pc;ns=[(oct)*12+b,...ns]}
   for(const n of ns)ev.push([Math.round(pos*PPQ),1,clamp(n,0,127),vel,Math.round(beats*PPQ*.98)]);pos+=beats}
  return AIC_RUN.write_notes({track_id:t.id,start_bar:a.start_bar,replace:a.replace,name:'Akkoorden',notes:ev.map(e=>({pitch:e[2],start:e[0]/PPQ,length:e[4]/PPQ,velocity:e[3]}))})},
 async drum_pattern(a){const idx=ensurePattern((a.pattern|0)-1),p=state.patterns[idx],bank=a.bank?'ABCD'.indexOf(a.bank):0;if(a.steps_length)state.stepLength=a.steps_length;
  if(a.clear)for(const k of Object.keys(p))if(Array.isArray(p[k]))p[k]=Array(32).fill(0);let n=0;
  for(const h of a.hits){let pad=typeof h.pad==='number'?h.pad-1:Array.from({length:16},(_,i)=>i).find(i=>nameFor(bank,i).toLowerCase().includes(String(h.pad).toLowerCase()));if(pad==null||pad<0||pad>15)throw new Error('pad niet gevonden: '+h.pad);
   const k=slotKey(bank,pad);if(!Array.isArray(p[k]))p[k]=Array(32).fill(0);for(const s of h.steps){if(s>=1&&s<=32){p[k][s-1]=encodeStep(h.velocity||105,h.tune||0);n++}}}
  if(a.name){state.patNames=state.patNames||{};state.patNames[idx]=String(a.name).slice(0,24)}save();if(typeof songPatternsChanged==='function')songPatternsChanged();drawSequencer();renderPatternPicker&&renderPatternPicker();return{pattern:idx+1,hits:n}},
 async place_pattern(a){const t=trById(a.track_id),pat=ensurePattern((a.pattern|0)-1),st=(a.start_bar-1)*BAR,len=Math.round((a.bars||1)*BAR);t.clips.push({id:newClipId(),kind:'pattern',pat,start:st,len,off:0,mute:false,name:''});rebuildFlat(t);return{ok:true}},
 async delete_clips(a){const t=trById(a.track_id),f=a.from_bar?(a.from_bar-1)*BAR:0,to=a.to_bar?(a.to_bar-1)*BAR:Infinity,n=t.clips.length;t.clips=t.clips.filter(c=>c.start+c.len<=f||c.start>=to);rebuildFlat(t);return{removed:n-t.clips.length}},
 async mixer(a){const key=fxKey(a.target);if(key==='master'){if(a.volume_db!=null){state.master=clamp(Math.round(100*dB(a.volume_db)),0,100);if(masterNode)masterNode.gain.setTargetAtTime(state.master/100,ctx.currentTime,.02);save()}return{ok:true}}
  const s=insById(key);if(a.name)s.name=String(a.name).slice(0,16);if(a.volume_db!=null)s.vol=clamp(Math.round(100*dB(a.volume_db)),0,125);if(a.pan!=null)s.pan=clamp(a.pan,-100,100);if(a.mute!=null)s.mute=!!a.mute;if(a.solo!=null)s.solo=!!a.solo;
  const f=fxOf(s);if(a.reverb_send!=null)f.rev=clamp(a.reverb_send,0,150);if(a.delay_send!=null)f.dly=clamp(a.delay_send,0,150);updateInsertGains();updateInsertFx(s);return{ok:true,insert:s.id}},
 async add_effect(a){const key=fxKey(a.target),slots=slotsOf(key);if(!FXT[a.type])throw new Error('onbekend effecttype '+a.type);if(slots.length>=MAX_SLOTS)throw new Error('alle slots vol');const s=newSlot(a.type);
  if(a.params)aicMerge(s,a.params);if(a.label)s.label=String(a.label).slice(0,24);slots.push(s);const ac=ensureAudio();if(FXT[a.type].wl&&ac)await loadWorklets(ac);fxStructureChanged(key);return{slot_id:s.id,target:key}},
 async set_effect(a){const key=fxKey(a.target),slots=slotsOf(key),i=slots.findIndex(s=>s.id===a.slot_id);if(i<0)throw new Error('effect niet gevonden');if(a.remove){slots.splice(i,1);fxStructureChanged(key);return{removed:true}}
  const s=slots[i];if(a.params)aicMerge(s,a.params);if(a.on!=null)s.on=!!a.on;fxStructureChanged(key);return{ok:true,effect:compactSlot(s)}},
 async ai_mix(){await aiMix();return{rapport:stripHtml(AI.report)}},
 async ai_master(a){if(a.target)state.aiTarget=a.target;if(a.genre)state.aiGenre=a.genre;if((state.aiTarget==='ref'||state.aiGenre==='reference')&&!AIC.ref)throw new Error('er is nog geen referentietrack geladen (📎 in de chat)');await aiMaster();return{rapport:stripHtml(AI.report)}},
 async analyze_mix(){const buf=await renderMix({});const a=analyze(buf),out={lufs:+a.lufs.toFixed(1),true_peak:+a.tp.toFixed(1),crest:+a.crest.toFixed(1),stereo_correlatie:+a.corr.toFixed(2),klankbalans:tonalProfile(a)};
  if(AIC.ref)out.vergelijking_met_referentie=compareToRef(a,AIC.ref);return out},
 async vst(a){const act=a.action;if(act==='scan'){VST.status=null;await vstReady();return{plugins:VST.list.map(p=>(p.vendor?p.vendor+' / ':'')+p.name)}}
  await vstReady();const key=fxKey(a.target??'master'),chain=vstChain(key),idx=(a.index||chain.length)-1;
  if(act==='add'){const q=String(a.plugin||'').toLowerCase().replace(/[^a-z0-9]/g,'');const p=VST.list.find(x=>(x.vendor+x.name).toLowerCase().replace(/[^a-z0-9]/g,'').includes(q))||VST.list.find(x=>x.name.toLowerCase().replace(/[^a-z0-9]/g,'').includes(q));
   if(!p)throw new Error('plugin niet gevonden: '+a.plugin);let r=await vstCall('/vst/load',{path:p.path});if(r.choose){const nm=r.choose.find(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'').includes(q))||r.choose[0];r=await vstCall('/vst/load',{path:p.path,name:nm})}
   const e={path:p.path,name:r.name,uid:Math.random().toString(36).slice(2,9),params:r.params};VST.inst.set(e.uid,r.id);chain.push(e);const s=await vstCall('/vst/state',{id:r.id}).catch(()=>({}));if(s.state)e.state=s.state;
   return{target:key,index:chain.length,name:r.name,parameters:r.params.length,eerste_parameters:r.params.slice(0,40).map(x=>`${x.key} (${x.name}) = ${x.text}`)}}
  if(!chain[idx])throw new Error('geen VST op die plek');const e=chain[idx];
  if(act==='params'){const id=await vstEnsure(key,idx);e.params=(await vstCall('/vst/params',{id})).params;const f=(a.search||'').toLowerCase();return{plugin:e.name,params:e.params.filter(x=>!f||x.name.toLowerCase().includes(f)||x.key.includes(f)).slice(0,80).map(x=>({key:x.key,name:x.name,value:x.text,raw:+(x.raw??0).toFixed(3),opties:x.valid}))}}
  if(act==='set'){const id=await vstEnsure(key,idx);const r=await vstCall('/vst/set',{id,changes:a.changes||[]});e.params=r.params;const s=await vstCall('/vst/state',{id}).catch(()=>({}));if(s.state)e.state=s.state;const keys=new Set((a.changes||[]).map(c=>c.key));
   return{plugin:e.name,nu:r.params.filter(x=>keys.has(x.key)).map(x=>`${x.name} = ${x.text}`),fouten:r.errors}}
  if(act==='open'){const id=await vstEnsure(key,idx);await vstCall('/vst/editor',{id});return{ok:'venster opent op de pc'}}
  if(act==='remove'){const id=VST.inst.get(e.uid);if(id)vstCall('/vst/unload',{id}).catch(()=>{});chain.splice(idx,1);return{ok:true}}
  if(act==='ai_to_plugin'){await aiToPlugin(key,idx);return{ok:true,params:(e.params||[]).length}}
  if(act==='freeze'){await vstFreeze(key);return{ok:true}}if(act==='master_wav'){await vstRenderMaster();return{ok:true}}},
 async export({format}){if(format==='wav')await exportSongWAV();else $('#song-midi').click();return{ok:true}},
 async undo({steps}){for(let i=0;i<clamp(steps||1,1,20);i++)undo();return{ok:true}}};
function aicMerge(s,p){if(s.type==='eq'&&Array.isArray(p.bands)){const bands=p.bands.slice(0,8).map(b=>({...eqBand(1000),slope:24,q:1,g:0,...b,on:b.on!==false,f:clamp(+b.f||1000,10,22000)}));
  while(bands.length<8)bands.push(eqBand([60,150,400,1000,2500,6000,12000,18000][bands.length]));s.p.bands=bands;const {bands:_,...rest}=p;Object.assign(s.p,rest)}else Object.assign(s.p,p)}
const stripHtml=h=>{const d=document.createElement('div');d.innerHTML=h;return d.innerText.replace(/\n{3,}/g,'\n\n').trim()};

/* ---------- gesprek met Claude ---------- */
function aicSystem(){return`Je bent de ingebouwde muziekproducent-assistent van "MPC Touch Studio", een FL Studio-achtige DAW (playlist, Channel Rack met patronen, piano roll, mixer met 32 inserts en effect-slots, AI Mix/Master, VST3-plugins via een bridge op de pc). De gebruiker is Ryan, producer die met FL Studio werkt. Antwoord in het Nederlands, kort en concreet.
Je hebt tools om alles in het project echt te doen. Werkwijze:
- Lees eerst get_state als je iets wilt veranderen of iets over het project moet weten. Verzin nooit sporen, inserts, effecten of plugins die er niet zijn.
- Doe wat de gebruiker vraagt met de tools en zeg daarna in 1–3 zinnen wat je hebt gedaan. Bij grote of onomkeerbare acties (song wissen, export) eerst kort bevestigen.
- Maten tellen vanaf 1; noten en akkoorden in tellen (kwartnoten). Drums: steps 1–16 = één maat in 1/16. C4 = midden-C.
- Mixen: sporen naar eigen inserts (update_track insert), effecten via add_effect/set_effect, VST3 via de vst-tool (scan → add → params → set; zet parameters in echte eenheden zoals in de plugin getoond, bijvoorbeeld Hz/dB).
- Advies: gebruik analyze_mix (meet LUFS, true peak, dynamiek, stereo en klankbalans per band, en vergelijkt met de referentietrack als die is geladen). Geef concreet advies met frequenties, dB, ratio's en attack/release, afgestemd op het genre (bijv. trap/drill, hip-hop, R&B, afrobeats, amapiano, dancehall, kaseko/kawina, pop, EDM, house, jazz) en op de referentie. Benoem de 2–4 belangrijkste verbeteringen eerst en bied aan ze uit te voeren.
- AI Master kan op een genre of op de referentietrack (target "ref" / genre "reference").
- Tempo nu: ${state.bpm} BPM. Referentietrack: ${AIC.ref?AIC.ref.name+' ('+AIC.ref.lufs.toFixed(1)+' LUFS)':'geen'}. VST-bridge: ${VST.status&&VST.status.available?'verbonden':'niet verbonden'}.`}
function aicTrimHistory(){if(AIC.history.length<=40)return;let cut=AIC.history.length-30;while(cut<AIC.history.length){const m=AIC.history[cut];if(m.role==='user'&&typeof m.content==='string')break;cut++}AIC.history=AIC.history.slice(cut)}
async function aicCall(){const key=aicKey();if(!key)throw new Error('Vul eerst je Anthropic API-sleutel in (⚙️)');
 AIC.abort=new AbortController();const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:AIC.abort.signal,headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
  body:JSON.stringify({model:aicModel(),max_tokens:4096,system:aicSystem(),tools:AIC_TOOLS,messages:AIC.history})});
 const j=await r.json().catch(()=>({}));if(!r.ok){const m=j.error&&j.error.message||('HTTP '+r.status);throw new Error(r.status===401?'API-sleutel ongeldig':r.status===429?'Te veel verzoeken of tegoed op; probeer zo opnieuw':m)}return j}
async function aicSend(text){text=String(text||'').trim();if(!text||AIC.busy)return;AIC.busy=true;aicAdd('user',text);aicTrimHistory();const h0=AIC.history.length;AIC.history.push({role:'user',content:text});renderAsst();
 let snap=false;try{for(let turn=0;turn<16;turn++){aicThinking(true);const res=await aicCall();aicThinking(false);AIC.history.push({role:'assistant',content:res.content});
   const txt=res.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();if(txt)aicAdd('assistant',txt);
   const uses=res.content.filter(b=>b.type==='tool_use');if(!uses.length||res.stop_reason!=='tool_use')break;const results=[];
   for(const u of uses){if(!snap&&u.name!=='get_state'&&u.name!=='analyze_mix'&&u.name!=='undo'){pushHistory();snap=true}aicAdd('tool',toolLabel(u));let out;
    try{out=await AIC_RUN[u.name](u.input||{});if(!['get_state','analyze_mix'].includes(u.name)){drawSongUI();saveSongSoon();if(currentTab==='mixer')renderMixer()}}catch(e){out={fout:e.message||String(e)};aicAdd('tool','⚠️ '+(e.message||e))}
    results.push({type:'tool_result',tool_use_id:u.id,content:JSON.stringify(out).slice(0,60000)})}
   AIC.history.push({role:'user',content:results})}}
 catch(e){aicThinking(false);if(e.name!=='AbortError')aicAdd('error',e.message||String(e));else aicAdd('error','Gestopt');AIC.history.length=h0}
 finally{AIC.busy=false;aicThinking(false);saveSong();renderAsst()}}
function toolLabel(u){const i=u.input||{},n={get_state:'📋 Project lezen',set_tempo:`⏱️ Tempo ${i.bpm}`,transport:`⏯️ ${i.action||i.mode||''}`,add_track:`➕ Spoor ${i.name||i.type}`,update_track:`🎚️ Spoor ${i.track_id} aanpassen`,write_notes:`🎹 ${(i.notes||[]).length} noten schrijven`,
 write_chords:`🎼 Akkoorden ${(i.chords||[]).join(' ')}`,drum_pattern:`🥁 Drumpatroon ${i.pattern}`,place_pattern:`🧩 Patroon ${i.pattern} in de playlist`,delete_clips:'🧽 Clips weg',mixer:`🎛️ Mixer ${i.target}`,add_effect:`✨ ${i.type} op ${i.target}`,set_effect:`🔧 Effect op ${i.target}`,
 ai_mix:'🤖 AI Mix',ai_master:'🎛️ AI Master',analyze_mix:'📈 Mix meten',vst:`🔌 VST ${i.action}${i.plugin?' '+i.plugin:''}`,export:`💾 Export ${i.format}`,undo:'↶ Ongedaan'}[u.name]||u.name;return n}

/* ---------- paneel ---------- */
function aicAdd(role,text){AIC.msgs.push({role,text});if(AIC.msgs.length>200)AIC.msgs.shift();const box=$('#asst-msgs');if(box){if(AIC.msgs.length===1)box.innerHTML='';box.append(aicBubble({role,text}));box.dataset.n=AIC.msgs.length;box.scrollTop=box.scrollHeight}}
function aicBubble(m){const d=document.createElement('div');d.className='am am-'+m.role;if(m.role==='assistant'){d.innerHTML=aicMd(m.text)}else d.textContent=m.text;return d}
function aicMd(t){return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/^\s*[-•] (.*)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,m=>'<ul>'+m+'</ul>').replace(/\n/g,'<br>')}
function aicThinking(on){const el=$('#asst-think');if(el)el.hidden=!on}
function renderAsst(){const p=$('#asst');if(!p)return;const k=!!aicKey();$('#asst-setup').hidden=k&&!AIC.showSetup;
 $('#asst-model').innerHTML=AIC_MODELS.map(([v,l])=>`<option value="${v}"${v===aicModel()?' selected':''}>${l}</option>`).join('');
 $('#asst-ref').innerHTML=AIC.ref?`📎 <b>${esc(AIC.ref.name)}</b> · ${AIC.ref.lufs.toFixed(1)} LUFS · crest ${AIC.ref.crest.toFixed(0)} dB <button class="tb x" id="asst-ref-x" aria-label="Referentie weghalen">✕</button>`:'<span class="muted">Geen referentietrack</span>';
 const x=$('#asst-ref-x');if(x)x.onclick=()=>{AIC.ref=null;try{localStorage.removeItem('mpcts-ref')}catch(e){}renderAsst()};
 const box=$('#asst-msgs');if(box&&box.dataset.n!==String(AIC.msgs.length)){box.dataset.n=AIC.msgs.length;box.innerHTML='';if(!AIC.msgs.length)box.innerHTML=`<div class="am am-assistant">Hoi Ryan 👋 Zeg wat je wilt maken of veranderen. Bijvoorbeeld:<ul><li>“Maak een trap-beat op 140 BPM met 808 en hi-hat rolls”</li><li>“Zet Pro-Q op de zang en haal 300 Hz eruit”</li><li>“Hoe klinkt mijn mix vergeleken met de referentie?”</li><li>“Master dit voor Spotify”</li></ul></div>`;for(const m of AIC.msgs)box.append(aicBubble(m));box.scrollTop=box.scrollHeight}
 $('#asst-send').disabled=AIC.busy;$('#asst-stop').hidden=!AIC.busy}
function asstToggle(on){const p=$('#asst');const show=on??p.hidden;p.hidden=!show;$('#asst-btn').classList.toggle('active',show);if(show){renderAsst();setTimeout(()=>$('#asst-in').focus(),50)}}
$('#asst-btn').onclick=()=>asstToggle();$('#asst-close').onclick=()=>asstToggle(false);
$('#asst-gear').onclick=()=>{AIC.showSetup=!AIC.showSetup;renderAsst()};
$('#asst-key-save').onclick=()=>{const v=$('#asst-key').value.trim();if(!/^sk-ant-/.test(v)){toast('Een Anthropic-sleutel begint met sk-ant-');return}try{localStorage.setItem('mpcts-aikey',v)}catch(e){}$('#asst-key').value='';AIC.showSetup=false;renderAsst();toast('API-sleutel bewaard op dit apparaat')};
$('#asst-key-del').onclick=()=>{try{localStorage.removeItem('mpcts-aikey')}catch(e){}renderAsst();toast('API-sleutel verwijderd')};
$('#asst-model').onchange=e=>{state.aiModel=e.target.value;save()};
$('#asst-new').onclick=()=>{AIC.msgs=[];AIC.history=[];renderAsst()};
$('#asst-stop').onclick=()=>{if(AIC.abort)AIC.abort.abort()};
const asstIn=$('#asst-in');
$('#asst-send').onclick=()=>{const v=asstIn.value;asstIn.value='';aicSend(v)};
asstIn.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#asst-send').click()}});
$('#asst-ref-btn').onclick=()=>$('#asst-ref-file').click();
$('#asst-ref-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{await loadReference(f)}catch(x){toast('Kon de referentie niet lezen: '+(x.message||x))}};
(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition,b=$('#asst-mic');if(!SR){b.hidden=true;return}
 b.onclick=()=>{if(AIC.rec){AIC.rec.stop();return}const r=new SR();r.lang='nl-NL';r.interimResults=true;r.continuous=false;AIC.rec=r;b.classList.add('active');let fin='';
  r.onresult=e=>{let t='';for(const x of e.results){t+=x[0].transcript;if(x.isFinal)fin=t}asstIn.value=t};r.onerror=()=>{};r.onend=()=>{AIC.rec=null;b.classList.remove('active');if(fin.trim()){asstIn.value='';aicSend(fin)}};r.start()}})();
