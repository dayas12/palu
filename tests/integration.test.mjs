/**
 * Integration test with a stub Web Audio environment.
 * Run: node tests/integration.test.mjs
 *
 * The stub nodes pass audio through unchanged, so this test does NOT
 * verify the Web Audio filter graph itself. It verifies everything this
 * rebuild added around it: module wiring, renderProcessed() post passes
 * (zero-phase erase and stereo decorrelation really run and really
 * change the PCM), the export flags, and the WAV encoder output.
 */
import { NaSunoDSP } from '../js/dsp.js';
import { carrierReport } from '../js/analyzer.js';
import { channelCorrelation } from '../js/filtfilt.js';

const SR = 48000;
let failures = 0;
function check(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// ---- Stub Web Audio ---------------------------------------------------------
class StubParam { constructor(v = 0) { this.value = v; } setValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } }
class StubNode {
  connect() {} disconnect() {}
}
class StubBiquad extends StubNode {
  constructor() { super(); this.type = 'peaking'; this.frequency = new StubParam(); this.Q = new StubParam(); this.gain = new StubParam(); }
}
class StubShaper extends StubNode { constructor() { super(); this.curve = null; this.oversample = 'none'; } }
class StubGain extends StubNode { constructor() { super(); this.gain = new StubParam(1); } }
class StubDelay extends StubNode { constructor() { super(); this.delayTime = new StubParam(0); } }
class StubOsc extends StubNode { constructor() { super(); this.type = 'sine'; this.frequency = new StubParam(440); } start() {} }
class StubComp extends StubNode {
  constructor() { super(); this.threshold = new StubParam(); this.knee = new StubParam(); this.ratio = new StubParam(); this.attack = new StubParam(); this.release = new StubParam(); }
}
class StubAnalyser extends StubNode { constructor() { super(); this.fftSize = 2048; this.smoothingTimeConstant = 0.8; } }
class StubSource extends StubNode { constructor() { super(); this.buffer = null; } start() {} }
class StubOfflineCtx {
  constructor(channels, length, sampleRate) { this._ch = channels; this._len = length; this._sr = sampleRate; this._src = null; }
  createBufferSource() { this._src = new StubSource(); return this._src; }
  createBiquadFilter() { return new StubBiquad(); }
  createWaveShaper() { return new StubShaper(); }
  createGain() { return new StubGain(); }
  createDelay() { return new StubDelay(); }
  createOscillator() { return new StubOsc(); }
  createDynamicsCompressor() { return new StubComp(); }
  get destination() { return new StubNode(); }
  async startRendering() { return this._src.buffer; } // passthrough render
}
globalThis.OfflineAudioContext = StubOfflineCtx;

// Minimal AudioBuffer stand-in
function makeBuffer() {
  const len = SR * 2;
  const chans = [new Float32Array(len), new Float32Array(len)];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const v = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.05 * Math.sin(2 * Math.PI * 19500 * t);
    chans[0][i] = v; chans[1][i] = v;
  }
  return {
    numberOfChannels: 2, length: len, sampleRate: SR, duration: len / SR,
    getChannelData: (c) => chans[c],
    _chans: chans,
  };
}

const params = { carrierErase: 50, strideRemove: 35, stegoStrip: 45, neuralScrub: 45, spectralBlend: 40, phaseScatter: 40, statNormalize: 40, hashBreak: 30, roomInject: 35, textureInject: 35, bandwidthHeal: 0.25, dynamicsNatural: 40, qualityGate: 3, outputGain: 0 };

// 1. renderProcessed runs and the zero-phase pass suppresses the carrier.
const buf1 = makeBuffer();
const before = carrierReport(buf1);
const rendered = await NaSunoDSP.renderProcessed(buf1, params, { subClean: true, zeroPhase: true, stereoDecorrelate: true });
const after = carrierReport(rendered);
const c195 = (r) => r.find((x) => x.freqHz === 19500).prominenceDb;
check('renderProcessed suppresses 19.5 kHz carrier', after && c195(after) < c195(before) - 20,
  c195(before).toFixed(1) + ' dB -> ' + c195(after).toFixed(1) + ' dB');

// 2. Stereo decorrelation pass ran: identical channels no longer identical.
const corr = channelCorrelation(rendered.getChannelData(0), rendered.getChannelData(1));
check('renderProcessed decorrelates stereo', corr < 0.99, 'L/R correlation ' + corr.toFixed(3));

// 3. Flags off means the post passes stay off.
const buf2 = makeBuffer();
const plain = await NaSunoDSP.renderProcessed(buf2, params, { subClean: false, zeroPhase: false, stereoDecorrelate: false });
const corrPlain = channelCorrelation(plain.getChannelData(0), plain.getChannelData(1));
check('flags off leaves channels identical', Math.abs(corrPlain - 1) < 0.001, 'correlation ' + corrPlain.toFixed(3));

// 4. encodeWAV produces a valid 16-bit WAV blob (with TPDF dither on).
const blob = NaSunoDSP.encodeWAV(rendered, { dither: true });
const head = new DataView(await blob.arrayBuffer());
const riff = String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3));
check('encodeWAV writes RIFF/WAVE 16-bit', riff === 'RIFF' && head.getUint16(34, true) === 16 && blob.size === 44 + rendered.length * 4,
  blob.size + ' bytes');

// 5. exportWAV end to end returns a Blob.
const out = await NaSunoDSP.exportWAV(makeBuffer(), params, false, { dither: true, zeroPhase: true, stereoDecorrelate: true });
check('exportWAV returns WAV blob', out instanceof Blob && out.size > 44, out.size + ' bytes');

console.log(failures === 0 ? '\nAll integration tests passed.' : '\n' + failures + ' test(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
