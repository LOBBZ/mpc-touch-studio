'use strict';
/* Ingebouwde instrumenten. De eerste vier zijn de originele klanken in makeVoice (app.js);
   de rest zijn synth-presets die hieronder worden opgebouwd (live én offline voor WAV-export). */
const BUILTIN_INSTS=[['piano','🎹 Piano'],['epiano','🎹 E-piano (Rhodes)'],['organ','⛪ Orgel'],['bell','🔔 Klokjes'],
 ['bass','🎸 Bass'],['sub808','🔊 808 Sub'],['guitar','🎸 Gitaar'],['pluck','✨ Pluck'],
 ['strings','🎻 Strijkers'],['pad','🌫️ Pad'],['choir','🗣️ Koor'],['brass','🎺 Brass'],['flute','🪈 Fluit'],['synth','🎛️ Synth'],['lead','⚡ Lead']];
const INST_IDS=BUILTIN_INSTS.map(([k])=>k);

/* osc: [golfvorm, frequentie-verhouding, detune in cent, niveau]
   env: a (s), d (s), s (0..1), r (s) · filter: [type, freq, Q, start-freq, tijd] · fm: [verhouding, index, verval] · vib: [Hz, cent, vertraging] */
const SYNTH_PRESETS={
 epiano:{osc:[['sine',1,0,1],['sine',2,3,.12]],fm:[1,2.2,.6],env:[.004,1.6,.18,.35],filter:['lowpass',5200,.7]},
 organ:{osc:[['sine',.5,0,.5],['sine',1,0,1],['sine',2,0,.7],['sine',3,0,.45],['sine',4,0,.3],['sine',8,0,.12]],env:[.008,.1,1,.07],filter:['lowpass',7000,.5],vib:[6.2,7,0]},
 bell:{osc:[['sine',1,0,1],['sine',4.01,0,.15]],fm:[3.5,4,1.8],env:[.002,2.6,0,1.4],filter:['lowpass',9000,.5]},
 sub808:{osc:[['sine',1,0,1],['triangle',1,0,.12]],env:[.003,1.4,.35,.25],filter:['lowpass',900,.7],pitch:[2.2,.03],drive:2.2},
 pluck:{osc:[['sawtooth',1,0,1],['square',1,7,.5]],env:[.002,.32,0,.18],filter:['lowpass',380,5,6500,.09]},
 strings:{osc:[['sawtooth',1,-9,1],['sawtooth',1,9,1],['sawtooth',2,4,.3]],env:[.35,.4,.85,.7],filter:['lowpass',3200,.8],vib:[5,9,.35]},
 pad:{osc:[['sawtooth',1,-12,1],['sawtooth',1,12,1],['square',.5,0,.4]],env:[.9,1,.8,1.6],filter:['lowpass',1400,2.2,600,1.2]},
 choir:{osc:[['sawtooth',1,-6,1],['sawtooth',1,6,1]],env:[.3,.4,.9,.8],formant:[[700,6],[1150,7],[2600,9]],vib:[5.5,12,.25]},
 brass:{osc:[['sawtooth',1,-4,1],['sawtooth',1,4,1]],env:[.05,.3,.8,.22],filter:['lowpass',2600,1.4,500,.09],vib:[5.2,8,.3]},
 flute:{osc:[['sine',1,0,1],['triangle',2,0,.12]],env:[.07,.2,.9,.2],filter:['lowpass',5000,.5],vib:[5.3,14,.25],breath:.06},
 lead:{osc:[['square',1,-6,1],['sawtooth',1,6,.8]],env:[.01,.2,.85,.15],filter:['lowpass',4200,3],vib:[5.8,18,.3]}};

function presetVoice(c,dest,note,vel,at,P){const f=440*2**((note-69)/12),[A,D,S,R]=P.env,peak=clamp(vel/127,0,1)*.2/Math.max(1,P.osc.reduce((s,o)=>s+o[3],0)*.55);
 const out=c.createGain();out.gain.value=0;let tail=out;const nodes=[out],srcs=[];
 if(P.drive){const ws=c.createWaveShaper(),n=1024,cu=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;cu[i]=Math.tanh(x*P.drive)}ws.curve=cu;out.connect(ws);tail=ws;nodes.push(ws)}
 if(P.formant){const sum=c.createGain();sum.gain.value=1.6;for(const [fr,q] of P.formant){const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=fr;bp.Q.value=q;tail.connect(bp);bp.connect(sum);nodes.push(bp)}tail=sum;nodes.push(sum)}
 if(P.filter){const [type,fq,Q,f0,ft]=P.filter,fl=c.createBiquadFilter();fl.type=type;fl.Q.value=Q;const target=Math.min(18000,fq*(note>72?1.4:1));
  if(f0){fl.frequency.setValueAtTime(f0,at);fl.frequency.setTargetAtTime(target,at+.002,ft)}else fl.frequency.value=target;tail.connect(fl);tail=fl;nodes.push(fl)}
 tail.connect(dest);
 let vibG=null;if(P.vib){const l=c.createOscillator();l.frequency.value=P.vib[0];vibG=c.createGain();vibG.gain.setValueAtTime(0,at);vibG.gain.linearRampToValueAtTime(P.vib[1],at+.02+P.vib[2]);l.connect(vibG);srcs.push(l);nodes.push(vibG)}
 for(const [type,ratio,det,lvl] of P.osc){const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=f*ratio;o.detune.value=det;g.gain.value=lvl;
  if(P.pitch){o.frequency.setValueAtTime(f*ratio*P.pitch[0],at);o.frequency.setTargetAtTime(f*ratio,at,P.pitch[1])}
  if(vibG)vibG.connect(o.detune);
  if(P.fm){const m=c.createOscillator(),mg=c.createGain();m.frequency.value=f*ratio*P.fm[0];const idx=f*ratio*P.fm[1]*(.4+.6*vel/127);mg.gain.setValueAtTime(idx,at);mg.gain.setTargetAtTime(idx*.08,at,P.fm[2]/3);m.connect(mg);mg.connect(o.frequency);srcs.push(m);nodes.push(mg)}
  o.connect(g);g.connect(out);srcs.push(o);nodes.push(g)}
 if(P.breath){const len=Math.floor(c.sampleRate*.5),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  const ns=c.createBufferSource();ns.buffer=b;ns.loop=true;const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f*2;bp.Q.value=2;const ng=c.createGain();ng.gain.value=P.breath;ns.connect(bp);bp.connect(ng);ng.connect(out);srcs.push(ns);nodes.push(bp,ng)}
 const g=out.gain;g.setValueAtTime(0,at);g.linearRampToValueAtTime(peak,at+A);g.setTargetAtTime(peak*S,at+A,Math.max(.01,D/3));
 srcs[0].onended=()=>{for(const n of [...srcs,...nodes])try{n.disconnect()}catch(e){}};for(const s of srcs)s.start(at);
 if(S===0){const end=at+A+D*2.2+.05;for(const s of srcs)try{s.stop(end+R)}catch(e){}}
 let stopped=false;return{release(t){if(stopped)return;stopped=true;t=Math.max(t,at+.01);if(g.cancelAndHoldAtTime)g.cancelAndHoldAtTime(t);else g.cancelScheduledValues(t);g.setTargetAtTime(0,t,Math.max(.01,R/3));for(const s of srcs)try{s.stop(t+R*1.6+.05)}catch(e){}}}}
