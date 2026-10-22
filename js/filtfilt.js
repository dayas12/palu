/**
 * RBJ Audio EQ Cookbook biquad coefficients plus forward-backward
 * (filtfilt) processing.
 *
 * A single pass of a causal biquad shifts phase. Running the same filter
 * over the signal, reversing it, running it again and reversing back
 * cancels the phase shift exactly (zero phase), at the cost of squaring
 * the magnitude response. That trade is stated in the UI: zero-phase mode
 * is an export-only operation because a live stream cannot look ahead.
 */

export function biquadCoeffs(type, freqHz, sampleRate, Q = 1, gainDb = 0) {
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  let b0, b1, b2, a0, a1, a2;

  switch (type) {
    case 'notch':
      b0 = 1; b1 = -2 * cos; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'peaking': {
      const A = Math.pow(10, gainDb / 40);
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
      break;
    }
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'allpass':
      b0 = 1 - alpha; b1 = -2 * cos; b2 = 1 + alpha;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    default:
      throw new Error('Unsupported biquad type: ' + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** One causal pass, in place. Returns the same Float32Array. */
export function biquadProcess(samples, coeffs) {
  const { b0, b1, b2, a1, a2 } = coeffs;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    samples[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
  return samples;
}

/** Zero-phase pass: filter, reverse, filter, reverse. In place. */
export function filtfilt(samples, coeffs) {
  biquadProcess(samples, coeffs);
  samples.reverse();
  biquadProcess(samples, coeffs);
  samples.reverse();
  return samples;
}

/**
 * Zero-phase carrier erase: filtfilt notch at each carrier frequency.
 * Depth comes free from the squared magnitude response of the double pass.
 */
export function zeroPhaseCarrierErase(samples, sampleRate, Q = 24) {
  for (const freq of [15500, 17500, 19500]) {
    if (freq < sampleRate / 2 - 200) {
      filtfilt(samples, biquadCoeffs('notch', freq, sampleRate, Q));
    }
  }
  return samples;
}

/**
 * Per-channel phase decorrelation for stereo material.
 * Each channel passes through its own allpass cascade tuned to slightly
 * different frequencies, plus a sub-millisecond delay offset on the right
 * channel. Identical processing on both channels (what a plain Web Audio
 * biquad chain does) leaves the inter-channel correlation untouched; this
 * does not. Amount 0..1 scales the allpass Q and the delay offset.
 */
export function decorrelateStereo(left, right, sampleRate, amount = 0.5) {
  const a = Math.max(0, Math.min(1, amount));
  if (a === 0) return;
  const qBase = 0.7 + 6.0 * a;
  const stagesL = [820, 2350, 6700];
  const stagesR = [905, 2520, 7150];
  for (const f of stagesL) biquadProcess(left, biquadCoeffs('allpass', f, sampleRate, qBase));
  for (const f of stagesR) biquadProcess(right, biquadCoeffs('allpass', f, sampleRate, qBase * 1.08));
  // Right channel micro delay, linear interpolated, up to 0.35 ms.
  const delay = Math.round(a * 0.00035 * sampleRate);
  if (delay > 0) {
    for (let i = right.length - 1; i >= delay; i--) right[i] = right[i - delay];
    for (let i = delay - 1; i >= 0; i--) right[i] = 0;
  }
}

/** Pearson correlation between two equal-length channels. */
export function channelCorrelation(left, right) {
  const n = Math.min(left.length, right.length);
  let sl = 0, sr = 0;
  for (let i = 0; i < n; i++) { sl += left[i]; sr += right[i]; }
  const ml = sl / n, mr = sr / n;
  let num = 0, dl = 0, dr = 0;
  for (let i = 0; i < n; i++) {
    const a = left[i] - ml, b = right[i] - mr;
    num += a * b; dl += a * a; dr += b * b;
  }
  return num / Math.sqrt(dl * dr || 1);
}
