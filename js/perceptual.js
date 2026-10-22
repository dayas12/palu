/**
 * Psychoacoustic helpers.
 *
 * Two published models, implemented as written in the literature:
 *  - Bark critical-band rate (Traunmueller 1990):
 *      z(f) = 26.81 * f / (1960 + f) - 0.53
 *  - Absolute threshold of hearing in quiet (Terhardt 1979, the ATH curve
 *    used by MPEG-1 Psychoacoustic Model 1, fitted to ISO 226 data):
 *      ATH(f) = 3.64 * (f/1000)^-0.8
 *               - 6.5 * exp(-0.6 * (f/1000 - 3.3)^2)
 *               + 0.001 * (f/1000)^4     [dB SPL]
 *
 * perceptualWeight() turns the ATH into a 0..1 audibility weight: content
 * close to (or above) the threshold of hearing matters perceptually,
 * content far below it does not. The adaptive carrier mode uses it to scale
 * how hard the notch filters work at each carrier frequency.
 */

export function barkScale(freqHz) {
  const f = Math.max(20, freqHz);
  return 26.81 * (f / (1960 + f)) - 0.53;
}

export function athDb(freqHz) {
  const f = Math.max(20, freqHz) / 1000;
  return (
    3.64 * Math.pow(f, -0.8) -
    6.5 * Math.exp(-0.6 * Math.pow(f - 3.3, 2)) +
    0.001 * Math.pow(f, 4)
  );
}

/**
 * Audibility weight for a spectral peak that sits `prominenceDb` above its
 * local spectral floor, at `freqHz`, assuming the floor itself is near
 * typical listening level. Returns 0..1.
 */
export function perceptualWeight(freqHz, prominenceDb) {
  // A peak is treated as clearly audible when its absolute level, placed on
  // the ATH curve, clears the threshold by a comfortable margin. Threshold
  // at the carrier frequencies is high (hearing is insensitive up there),
  // so small peaks get low weight.
  const ath = athDb(freqHz);
  const margin = prominenceDb - Math.max(0, ath - 40);
  const w = margin / (margin + 6);
  return Math.max(0, Math.min(1, w));
}
