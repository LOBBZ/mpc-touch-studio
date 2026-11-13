/* AudioWorklet-processors voor MPC Touch Studio: gate, transient shaper en een brickwall-limiter met lookahead. */
const dbToLin = d => Math.pow(10, d / 20);
const coef = (ms, sr) => Math.exp(-1 / Math.max(1, ms * 0.001 * sr));

class Gate extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'threshold', defaultValue: -45, minValue: -90, maxValue: 0 },
    { name: 'range', defaultValue: -60, minValue: -90, maxValue: 0 },
    { name: 'attack', defaultValue: 1, minValue: 0.05, maxValue: 100 },
    { name: 'hold', defaultValue: 30, minValue: 0, maxValue: 500 },
    { name: 'release', defaultValue: 120, minValue: 5, maxValue: 2000 }]; }
  constructor() { super(); this.env = 0; this.g = 0; this.holdLeft = 0; }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0]; if (!inp.length) return true;
    const n = inp[0].length, thr = dbToLin(p.threshold[0]), floor = dbToLin(p.range[0]);
    const a = coef(p.attack[0], sampleRate), r = coef(p.release[0], sampleRate), hold = p.hold[0] * 0.001 * sampleRate, det = coef(5, sampleRate);
    for (let i = 0; i < n; i++) {
      let pk = 0; for (let c = 0; c < inp.length; c++) pk = Math.max(pk, Math.abs(inp[c][i]));
      this.env = Math.max(pk, this.env * det);
      let target;
      if (this.env >= thr) { target = 1; this.holdLeft = hold; }
      else if (this.holdLeft > 0) { target = 1; this.holdLeft--; }
      else target = floor;
      this.g = target > this.g ? target + (this.g - target) * a : target + (this.g - target) * r;
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.g;
    }
    return true;
  }
}

class Transient extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'attack', defaultValue: 0, minValue: -100, maxValue: 100 },
    { name: 'sustain', defaultValue: 0, minValue: -100, maxValue: 100 },
    { name: 'output', defaultValue: 0, minValue: -24, maxValue: 24 }]; }
  constructor() { super(); this.fast = 0; this.slow = 0; }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0]; if (!inp.length) return true;
    const n = inp[0].length, fa = coef(1, sampleRate), fr = coef(60, sampleRate), sa = coef(25, sampleRate), sr = coef(250, sampleRate);
    const at = p.attack[0] / 100, su = p.sustain[0] / 100, og = dbToLin(p.output[0]);
    for (let i = 0; i < n; i++) {
      let x = 0; for (let c = 0; c < inp.length; c++) x = Math.max(x, Math.abs(inp[c][i]));
      this.fast = x > this.fast ? x + (this.fast - x) * fa : x + (this.fast - x) * fr;
      this.slow = x > this.slow ? x + (this.slow - x) * sa : x + (this.slow - x) * sr;
      const diff = Math.max(-1, Math.min(1, (this.fast - this.slow) / (this.slow + 1e-4)));
      let g = 1 + at * Math.max(0, diff) * 1.5 + su * Math.max(0, -diff) * 1.5 + su * 0.25 * (diff <= 0 ? 1 : 0);
      g = Math.max(0.05, Math.min(4, g)) * og;
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * g;
    }
    return true;
  }
}

/* Lookahead-limiter: de versterking daalt al vóórdat de piek de uitgang bereikt (geen overshoot). */
class Limiter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'gain', defaultValue: 0, minValue: -12, maxValue: 30 },
    { name: 'ceiling', defaultValue: -1, minValue: -12, maxValue: 0 },
    { name: 'release', defaultValue: 80, minValue: 5, maxValue: 1000 }]; }
  constructor() {
    super();
    this.L = Math.max(16, Math.round(sampleRate * 0.005));
    this.buf = [new Float32Array(this.L), new Float32Array(this.L)]; this.pos = 0;
    this.req = new Float32Array(this.L).fill(1); this.g = 1; this.reportEvery = Math.round(sampleRate / 30); this.cnt = 0; this.minG = 1;
    this.att = coef(0.4, sampleRate); this.hist = new Float32Array(6);
  }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0], n = (out[0] || []).length; if (!n) return true;
    const ig = dbToLin(p.gain[0]), ceil = dbToLin(p.ceiling[0]) * 0.97, rel = coef(p.release[0], sampleRate), L = this.L;
    for (let i = 0; i < n; i++) {
      const l = inp[0] ? inp[0][i] * ig : 0, r = inp[1] ? inp[1][i] * ig : l;
      /* true-peak-detectie: ook het punt tussen twee samples (4-punts kubisch) */
      const h = this.hist; const ml = (-h[0] + 9 * h[1] + 9 * h[2] - l) / 16, mr = (-h[3] + 9 * h[4] + 9 * h[5] - r) / 16;
      h[0] = h[1]; h[1] = h[2]; h[2] = l; h[3] = h[4]; h[4] = h[5]; h[5] = r;
      const pk = Math.max(Math.abs(l), Math.abs(r), Math.abs(ml) * 1.02, Math.abs(mr) * 1.02);
      this.req[this.pos] = pk > ceil ? ceil / pk : 1;
      let need = 1; for (let k = 0; k < L; k++) { const v = this.req[k]; if (v < need) need = v; }
      if (need < this.g) this.g = need + (this.g - need) * this.att; else this.g = need + (this.g - need) * rel;
      if (this.g > need) this.g = Math.min(this.g, need + (1 - need) * 0.02);
      const j = this.pos, dl = this.buf[0][j], dr = this.buf[1][j];
      this.buf[0][j] = l; this.buf[1][j] = r; this.pos = (j + 1) % L;
      let ol = dl * this.g, or = dr * this.g;
      if (ol > ceil) ol = ceil; else if (ol < -ceil) ol = -ceil;
      if (or > ceil) or = ceil; else if (or < -ceil) or = -ceil;
      out[0][i] = ol; if (out[1]) out[1][i] = or;
      if (this.g < this.minG) this.minG = this.g;
    }
    if ((this.cnt += n) >= this.reportEvery) { this.port.postMessage(this.minG); this.minG = 1; this.cnt = 0; }
    return true;
  }
}

registerProcessor('mts-gate', Gate);
registerProcessor('mts-transient', Transient);
registerProcessor('mts-limiter', Limiter);
