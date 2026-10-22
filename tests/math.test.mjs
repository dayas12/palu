/**
 * Node tests for the pure-math modules (no Web Audio needed).
 * Run: node tests/math.test.mjs
 *
 * Fixture: 48 kHz mono, music-like bed (220 Hz + harmonics, low level)
 * plus a clear 19.5 kHz tone, and a stereo pair with identical channels.
 */
import { zeroPhaseCarrierErase, decorrelateStereo, channelCorrelation, biquadCoeffs, biquadProcess } from '../js/filtfilt.js';
import { averageSpectrum, carrierProminence } from '../js/analyzer.js';
import { barkScale, athDb, perceptualWeight } from '../js/perceptual.js';

const SR = 48000;
const N = SR * 2;
let failures = 0;
function check(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

function makeSignal(withCarrier = true) {
  const s = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    s[i] = 0.30 * Math.sin(2 * Math.PI * 220 * t)
         + 0.15 * Math.sin(2 * Math.PI * 440 * t)
         + 0.08 * Math.sin(2 * Math.PI * 1244 * t);
    if (withCarrier) s[i] += 0.05 * Math.sin(2 * Math.PI * 19500 * t);
  }
  return s;
}

// 1. Analyzer sees the carrier before processing.
const raw = makeSignal();
const specRaw = averageSpectrum(raw, SR);
const promRaw = carrierProminence(specRaw, 19500);
check('FFT detects 19.5 kHz carrier', promRaw > 10, 'prominence ' + promRaw.toFixed(1) + ' dB');

// 2. A file with no carrier measures near zero prominence.
const clean = makeSignal(false);
const promClean = carrierProminence(averageSpectrum(clean, SR), 19500);
check('No false carrier on clean signal', promClean < 6, 'prominence ' + promClean.toFixed(1) + ' dB');

// 3. Zero-phase erase knocks the carrier down hard.
const erased = makeSignal();
zeroPhaseCarrierErase(erased, SR, 8);
const promErased = carrierProminence(averageSpectrum(erased, SR), 19500);
check('filtfilt notch suppresses carrier', promErased < promRaw - 20,
  promRaw.toFixed(1) + ' dB -> ' + promErased.toFixed(1) + ' dB');

// 4. Zero-phase really is zero phase: project a steady 1500 Hz sine onto
//    sin/cos after filtering. A peaking filter centered at 3 kHz shifts
//    phase at 1.5 kHz when run causally; filtfilt must cancel it.
import { filtfilt } from '../js/filtfilt.js';
function sineAt(f) {
  const s = new Float32Array(N);
  for (let i = 0; i < N; i++) s[i] = Math.sin((2 * Math.PI * f * i) / SR);
  return s;
}
function phaseDeg(s, f) {
  let re = 0, im = 0;
  const a = Math.floor(N * 0.25), b = Math.floor(N * 0.75);
  for (let i = a; i < b; i++) {
    re += s[i] * Math.sin((2 * Math.PI * f * i) / SR);
    im += s[i] * Math.cos((2 * Math.PI * f * i) / SR);
  }
  return (Math.atan2(im, re) * 180) / Math.PI;
}
const coeffs = biquadCoeffs('peaking', 3000, SR, 1.2, -6);
const causal = sineAt(1500); biquadProcess(causal, coeffs);
const zp = sineAt(1500); filtfilt(zp, coeffs);
const phCausal = phaseDeg(causal, 1500);
const phZp = phaseDeg(zp, 1500);
check('filtfilt cancels phase shift', Math.abs(phCausal) > 5 && Math.abs(phZp) < 0.5,
  'causal ' + phCausal.toFixed(2) + ' deg, filtfilt ' + phZp.toFixed(2) + ' deg');

// 5. Stereo decorrelation lowers inter-channel correlation.
const L = makeSignal(false), R = makeSignal(false);
const corrBefore = channelCorrelation(L, R);
decorrelateStereo(L, R, SR, 0.6);
const corrAfter = channelCorrelation(L, R);
check('decorrelation drops L/R correlation', corrAfter < corrBefore - 0.05,
  corrBefore.toFixed(3) + ' -> ' + corrAfter.toFixed(3));

// 6. Perceptual models return sane values.
check('Bark at 1 kHz near 8.5', Math.abs(barkScale(1000) - 8.5) < 0.6, barkScale(1000).toFixed(2));
check('ATH lowest near 3 to 4 kHz', athDb(3500) < athDb(1000) && athDb(3500) < athDb(15000),
  'ATH 1k ' + athDb(1000).toFixed(1) + ', 3.5k ' + athDb(3500).toFixed(1) + ', 15k ' + athDb(15000).toFixed(1));
check('Perceptual weight in range', perceptualWeight(19500, 20) >= 0 && perceptualWeight(19500, 20) <= 1);

// 7. TPDF dither statistics: triangular distribution, zero mean.
//    (Same formula dsp.js encodeWAV uses.)
let sum = 0, peak = 0;
for (let i = 0; i < 200000; i++) {
  const d = Math.random() - Math.random();
  sum += d; peak = Math.max(peak, Math.abs(d));
}
check('TPDF zero-mean within 1 LSB', Math.abs(sum / 200000) < 0.01 && peak <= 1.0,
  'mean ' + (sum / 200000).toFixed(4) + ', peak ' + peak.toFixed(3));

console.log(failures === 0 ? '\nAll tests passed.' : '\n' + failures + ' test(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
