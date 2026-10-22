/**
 * Offline spectrum measurement.
 *
 * A radix-2 FFT over Hann-windowed segments of the decoded PCM, averaged
 * in the power domain. carrierProminence() reports how far the energy at a
 * carrier frequency stands above the median of its surrounding bins, which
 * is the same quantity the original app's meters displayed. Here it is also
 * used after processing, so the before and after numbers are comparable:
 * same window, same segmenting, same reference floor.
 */

function fftMagnitudes(re, im) {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = -Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
  const mags = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mags[i] = Math.hypot(re[i], im[i]);
  return mags;
}

/**
 * Average power spectrum of mono samples.
 * @returns {{ magsDb: Float64Array, binHz: number, fftSize: number }}
 */
export function averageSpectrum(samples, sampleRate, fftSize = 4096) {
  const hop = fftSize; // non-overlapping segments keep the floor estimate honest
  const acc = new Float64Array(fftSize / 2);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const win = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));

  let segments = 0;
  for (let start = 0; start + fftSize <= samples.length; start += hop) {
    for (let i = 0; i < fftSize; i++) { re[i] = samples[start + i] * win[i]; im[i] = 0; }
    const mags = fftMagnitudes(re, im);
    for (let i = 0; i < fftSize / 2; i++) acc[i] += mags[i] * mags[i];
    segments++;
  }
  if (segments === 0) {
    // Short file: zero-pad a single segment.
    for (let i = 0; i < fftSize; i++) { re[i] = (samples[i] || 0) * win[i]; im[i] = 0; }
    const mags = fftMagnitudes(re, im);
    for (let i = 0; i < fftSize / 2; i++) acc[i] += mags[i] * mags[i];
    segments = 1;
  }
  const magsDb = new Float64Array(fftSize / 2);
  for (let i = 0; i < fftSize / 2; i++) {
    magsDb[i] = 10 * Math.log10(acc[i] / segments + 1e-20);
  }
  return { magsDb, binHz: sampleRate / fftSize, fftSize };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Prominence of a tone at freqHz, in dB above the median level of the
 * bins around it (guard band of 3 bins on each side excluded).
 */
export function carrierProminence(spec, freqHz) {
  const { magsDb, binHz } = spec;
  const center = Math.round(freqHz / binHz);
  const side = [];
  for (let i = center - 14; i <= center + 14; i++) {
    if (Math.abs(i - center) > 3 && i >= 0 && i < magsDb.length) side.push(magsDb[i]);
  }
  const peak = Math.max(magsDb[center - 1] || -200, magsDb[center], magsDb[center + 1] || -200);
  return peak - median(side);
}

/** Downmix an AudioBuffer-like {numberOfChannels, getChannelData} to mono. */
export function toMono(buffer) {
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** Full carrier report for a buffer: 15.5k, 17.5k, 19.5k prominence in dB. */
export function carrierReport(buffer) {
  const spec = averageSpectrum(toMono(buffer), buffer.sampleRate);
  return [15500, 17500, 19500].map((freqHz) => ({
    freqHz,
    prominenceDb: buffer.sampleRate / 2 > freqHz + 500 ? carrierProminence(spec, freqHz) : null,
  }));
}
