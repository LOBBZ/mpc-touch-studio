'use strict';
/* =====================================================================
   Muziektheorie: akkoorden (standaard + jazz), voicings, toonladders,
   progressies en duren. Gebruikt door het klavier en de piano roll.
   ===================================================================== */
const NOTE_NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

/* [id, label achter de grondtoon, intervallen, groep] */
const CHORD_TYPES=[
 ['maj','',[0,4,7],'std'],['min','m',[0,3,7],'std'],['dim','dim',[0,3,6],'std'],['aug','aug',[0,4,8],'std'],
 ['sus2','sus2',[0,2,7],'std'],['sus4','sus4',[0,5,7],'std'],['5','5',[0,7,12],'std'],
 ['6','6',[0,4,7,9],'std'],['m6','m6',[0,3,7,9],'std'],['add9','add9',[0,4,7,14],'std'],['madd9','m(add9)',[0,3,7,14],'std'],
 ['7','7',[0,4,7,10],'std'],['maj7','maj7',[0,4,7,11],'std'],['m7','m7',[0,3,7,10],'std'],['dim7','dim7',[0,3,6,9],'std'],
 ['m7b5','m7♭5',[0,3,6,10],'std'],['7sus4','7sus4',[0,5,7,10],'std'],
 ['maj9','maj9',[0,4,7,11,14],'jazz'],['9','9',[0,4,7,10,14],'jazz'],['m9','m9',[0,3,7,10,14],'jazz'],['69','6/9',[0,4,7,9,14],'jazz'],['m69','m6/9',[0,3,7,9,14],'jazz'],
 ['mmaj7','m(maj7)',[0,3,7,11],'jazz'],['mmaj9','m(maj9)',[0,3,7,11,14],'jazz'],['maj7s5','maj7♯5',[0,4,8,11],'jazz'],['maj7s11','maj7♯11',[0,4,7,11,18],'jazz'],
 ['maj13','maj13',[0,4,7,11,14,21],'jazz'],['11','11',[0,7,10,14,17],'jazz'],['m11','m11',[0,3,7,10,14,17],'jazz'],['13','13',[0,4,10,14,21],'jazz'],['m13','m13',[0,3,10,14,21],'jazz'],
 ['7b9','7♭9',[0,4,7,10,13],'jazz'],['7s9','7♯9',[0,4,7,10,15],'jazz'],['7b5','7♭5',[0,4,6,10],'jazz'],['7s5','7♯5',[0,4,8,10],'jazz'],['7s11','7♯11',[0,4,7,10,18],'jazz'],
 ['7b13','7♭13',[0,4,10,14,20],'jazz'],['13s11','13♯11',[0,4,10,14,18,21],'jazz'],['13b9','13♭9',[0,4,10,13,21],'jazz'],['7alt','7alt',[0,4,10,13,15,20],'jazz'],
 ['9sus4','9sus4',[0,5,7,10,14],'jazz'],['13sus4','13sus4',[0,5,10,14,21],'jazz'],['m7b9','m7♭9',[0,3,7,10,13],'jazz'],['m9b5','m9♭5',[0,3,6,10,14],'jazz'],
 ['dimmaj7','dim(maj7)',[0,3,6,11],'jazz'],['quartal','quartaal',[0,5,10,15],'jazz'],['sowhat','So What',[0,5,10,15,19],'jazz'],['kennyb','Kenny B.',[0,4,10,14,17,21],'jazz']];
const chordType=id=>CHORD_TYPES.find(c=>c[0]===id)||CHORD_TYPES[0];

const VOICINGS=[['close','Gesloten'],['inv1','1e omkering'],['inv2','2e omkering'],['inv3','3e omkering'],['drop2','Drop 2 (jazz)'],['drop3','Drop 3 (jazz)'],
 ['spread','Open/gespreid'],['shell','Shell (1-3-7)'],['rootlessA','Rootless A (3-5-7-9)'],['rootlessB','Rootless B (7-9-3-5)'],['bass','Met basnoot']];

/* Akkoord → MIDI-noten. root = MIDI-noot van de grondtoon. */
function chordNotes(root,typeId,voicing='close'){const iv=chordType(typeId)[2].slice();let n=iv.map(i=>root+i);
 const inv=k=>{for(let i=0;i<k&&i<n.length-1;i++){const x=n.shift();n.push(x+12*Math.ceil((n[n.length-1]-x+1)/12))}};
 const sortU=()=>{n=[...new Set(n)].sort((a,b)=>a-b)};
 const has=i=>iv.includes(i);
 const third=has(3)?3:has(4)?4:has(5)?5:has(2)?2:null,seventh=has(10)?10:has(11)?11:has(9)?9:null,ninth=has(14)?14:has(13)?13:has(15)?15:null,fifth=has(7)?7:has(6)?6:has(8)?8:null;
 switch(voicing){
  case 'inv1':inv(1);break;case 'inv2':inv(2);break;case 'inv3':inv(3);break;
  case 'drop2':{sortU();const close=n.slice(0,4);if(close.length>=4){const s=close[close.length-2]-12;n=[s,...close.filter((_,i)=>i!==close.length-2),...n.slice(4)]}break}
  case 'drop3':{sortU();const close=n.slice(0,4);if(close.length>=4){const s=close[close.length-3]-12;n=[s,...close.filter((_,i)=>i!==close.length-3),...n.slice(4)]}break}
  case 'spread':{sortU();n=n.map((x,i)=>i%2?x+12:x);break}
  case 'shell':n=[root,root+(seventh??12),root+12+(third??7)];break;
  case 'rootlessA':n=[third??4,fifth??7,seventh??12,ninth??14].map(i=>root+i);break;
  case 'rootlessB':n=[seventh??10,ninth??14,third!=null?third+12:16,fifth!=null?fifth+12:19].map(i=>root+i);break;
  case 'bass':n=[root-12,...n];break}
 sortU();return n.filter(x=>x>=0&&x<=127)}
const chordName=(rootPc,typeId)=>NOTE_NAMES[((rootPc%12)+12)%12]+chordType(typeId)[1];

/* Toonladders: [id, naam, intervallen, groep] */
const SCALES=[
 ['major','Majeur (Ionisch)',[0,2,4,5,7,9,11],'Basis'],['minor','Mineur (natuurlijk / Aeolisch)',[0,2,3,5,7,8,10],'Basis'],
 ['harmmin','Harmonisch mineur',[0,2,3,5,7,8,11],'Basis'],['melmin','Melodisch mineur (jazz)',[0,2,3,5,7,9,11],'Basis'],
 ['majpent','Majeur pentatonisch',[0,2,4,7,9],'Pentatonisch & blues'],['minpent','Mineur pentatonisch',[0,3,5,7,10],'Pentatonisch & blues'],
 ['blues','Blues',[0,3,5,6,7,10],'Pentatonisch & blues'],['majblues','Majeur blues',[0,2,3,4,7,9],'Pentatonisch & blues'],
 ['dorian','Dorisch',[0,2,3,5,7,9,10],'Modi'],['phrygian','Frygisch',[0,1,3,5,7,8,10],'Modi'],['lydian','Lydisch',[0,2,4,6,7,9,11],'Modi'],
 ['mixo','Mixolydisch',[0,2,4,5,7,9,10],'Modi'],['locrian','Locrisch',[0,1,3,5,6,8,10],'Modi'],
 ['dorb2','Dorisch ♭2',[0,1,3,5,7,9,10],'Jazz (melodisch mineur)'],['lydaug','Lydisch overmatig',[0,2,4,6,8,9,11],'Jazz (melodisch mineur)'],
 ['lyddom','Lydisch dominant',[0,2,4,6,7,9,10],'Jazz (melodisch mineur)'],['mixob6','Mixolydisch ♭6',[0,2,4,5,7,8,10],'Jazz (melodisch mineur)'],
 ['locnat2','Locrisch ♮2',[0,2,3,5,6,8,10],'Jazz (melodisch mineur)'],['altered','Altered (superlocrisch)',[0,1,3,4,6,8,10],'Jazz (melodisch mineur)'],
 ['bebopdom','Bebop dominant',[0,2,4,5,7,9,10,11],'Bebop'],['bebopmaj','Bebop majeur',[0,2,4,5,7,8,9,11],'Bebop'],['bebopmin','Bebop mineur',[0,2,3,4,5,7,9,10],'Bebop'],['bebopdor','Bebop dorisch',[0,2,3,4,5,7,9,10],'Bebop'],
 ['wholetone','Heletoons',[0,2,4,6,8,10],'Symmetrisch'],['dimhw','Verminderd (half-heel)',[0,1,3,4,6,7,9,10],'Symmetrisch'],['dimwh','Verminderd (heel-half)',[0,2,3,5,6,8,9,11],'Symmetrisch'],
 ['augm','Overmatig',[0,3,4,7,8,11],'Symmetrisch'],['chromatic','Chromatisch',[0,1,2,3,4,5,6,7,8,9,10,11],'Symmetrisch'],
 ['phrdom','Frygisch dominant',[0,1,4,5,7,8,10],'Wereld'],['hungmin','Hongaars mineur',[0,2,3,6,7,8,11],'Wereld'],['dblharm','Dubbel harmonisch (Arabisch)',[0,1,4,5,7,8,11],'Wereld'],
 ['neapmin','Napolitaans mineur',[0,1,3,5,7,8,11],'Wereld'],['neapmaj','Napolitaans majeur',[0,1,3,5,7,9,11],'Wereld'],['persian','Perzisch',[0,1,4,5,6,8,11],'Wereld'],
 ['hirajoshi','Hirajoshi (Japans)',[0,2,3,7,8],'Wereld'],['insen','In-sen (Japans)',[0,1,5,7,10],'Wereld'],['egyptian','Egyptisch',[0,2,5,7,10],'Wereld'],
 ['gypsy','Zigeuner mineur',[0,2,3,6,7,8,10],'Wereld'],['enigmatic','Enigmatisch',[0,1,4,6,8,10,11],'Wereld'],['prometheus','Prometheus',[0,2,4,6,9,10],'Wereld'],
 ['harmmaj','Harmonisch majeur',[0,2,4,5,7,8,11],'Overig'],['ukrdor','Oekraïens dorisch',[0,2,3,6,7,9,10],'Overig']];
const scaleOf=id=>SCALES.find(s=>s[0]===id)||SCALES[0];
function inScale(note,rootPc,id){const iv=scaleOf(id)[2];return iv.includes((((note-rootPc)%12)+12)%12)}
function snapToScale(note,rootPc,id){if(inScale(note,rootPc,id))return note;for(let d=1;d<7;d++){if(inScale(note-d,rootPc,id))return note-d;if(inScale(note+d,rootPc,id))return note+d}return note}
function scaleRun(root,id,octaves=1,dir='up'){const iv=scaleOf(id)[2],up=[];for(let o=0;o<octaves;o++)for(const i of iv)up.push(root+o*12+i);up.push(root+octaves*12);
 if(dir==='down')return up.reverse();if(dir==='updown')return[...up,...up.slice(0,-1).reverse()];return up}

/* Diatonische akkoorden (drieklanken of vierklanken) op elke trap van de toonladder */
const ROMAN=['I','II','III','IV','V','VI','VII'];
function diatonic(rootPc,id,sevenths=true){const iv=scaleOf(id)[2];if(iv.length!==7)return[];const out=[];
 for(let d=0;d<7;d++){const pick=k=>{const j=d+k;return iv[j%7]+12*Math.floor(j/7)-iv[d]};const st=[0,pick(2),pick(4)];if(sevenths)st.push(pick(6));
  const t=CHORD_TYPES.find(c=>c[2].length===st.length&&c[2].every((x,i)=>x===st[i]));const typeId=t?t[0]:(st[1]===3?'min':'maj');
  const minorish=st[1]===3,dimish=st[2]===6;let r=ROMAN[d];if(minorish)r=r.toLowerCase();
  const suf={maj7:'maj7','7':'7',m7:'7',m7b5:'ø7',dim7:'°7',mmaj7:'(maj7)',maj7s5:'+maj7',dimmaj7:'°(maj7)',dim:'°',aug:'+'}[typeId]??(sevenths?'':'');
  out.push({degree:d,roman:r+suf,root:(rootPc+iv[d])%12,type:typeId})}return out}

/* Progressies: trappen (0..6) in de gekozen toonladder, vierklanken */
const PROGRESSIONS=[['ii–V–I (jazz)',[1,4,0]],['I–vi–ii–V (turnaround)',[0,5,1,4]],['iii–vi–ii–V',[2,5,1,4]],['I–V–vi–IV (pop)',[0,4,5,3]],
 ['vi–IV–I–V',[5,3,0,4]],['I–IV–V–IV',[0,3,4,3]],['ii–V–I–vi',[1,4,0,5]],['IV–iii–ii–I (neo-soul)',[3,2,1,0]],['i–VI–III–VII',[0,5,2,6]],
 ['i–iv–v–i',[0,3,4,0]],['I–iii–IV–iv',[0,2,3,3]],['vi–ii–V–I',[5,1,4,0]],['I–IV (gospel)',[0,3,0,3]],['12-bar blues',[0,0,0,0,3,3,0,0,4,3,0,4]]];

/* Duren */
const DURATIONS=[['1/32',PPQ/8],['1/16',T16],['1/8',PPQ/2],['1/8.',PPQ*3/4],['1/4',PPQ],['1/4.',PPQ*1.5],['1/2',PPQ*2],['1/2.',PPQ*3],['1 maat',BAR],['2 maten',BAR*2],['4 maten',BAR*4]];
const durTicks=k=>(DURATIONS.find(d=>d[0]===k)||DURATIONS[6])[1];

/* Gedeelde instellingen voor het klavier en de stempel in de piano roll */
const TH={get root(){return state.thRoot|0},get scale(){return state.thScale||'major'}};
function optionsHTML(list,cur,grp){let h='',g=null;for(const it of list){const gg=grp?it[grp]:null;if(gg!==g){if(g!=null)h+='</optgroup>';if(gg!=null)h+=`<optgroup label="${gg}">`;g=gg}h+=`<option value="${it[0]}"${it[0]===cur?' selected':''}>${it[1]}</option>`}if(g!=null)h+='</optgroup>';return h}
