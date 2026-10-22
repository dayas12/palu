# NaSuno Rebuild

A browser audio DSP studio, reverse engineered and rebuilt from the public
[AhmadHassan-BTed/NaSuno](https://github.com/AhmadHassan-BTed/NaSuno) web app
(MIT licensed, original license in `LICENSE-ORIGINAL`).

The original web version was a 14-stage Web Audio chain (EQ, notch filters,
allpass, waveshapers, delay, compressor, limiter) whose README advertised
several features the code never contained. This rebuild keeps the chain and
adds those features as working code, each one measurable in the app itself:

| Claimed feature | Status in original | In this rebuild |
|---|---|---|
| Notch carriers 15.5 / 17.5 / 19.5 kHz | Present (causal biquad) | Present, plus zero-phase mode |
| Zero-phase forward-backward IIR (V-01) | Absent | `js/filtfilt.js`, RBJ biquads run forward-backward at export. Test proves 0.00 degree phase error where the causal pass gives -16.52 degrees |
| ISO 226 / Bark perceptual masking | Absent (0 code hits) | `js/perceptual.js`: Bark scale (Traunmueller) and absolute threshold of hearing (Terhardt, fitted to ISO 226). Shown per carrier in the meter and used by Adaptive mode |
| Sub-bass pilot removal, 20 Hz HPF (V-07) | Absent | Stage 0 high-pass in both live and export chains |
| TPDF dithering (V-08) | Absent | TPDF noise before 16-bit quantization, toggleable |
| Stereo phase decorrelation (V-09) | Not possible (identical filters per channel) | `decorrelateStereo()`: detuned allpass cascade per channel plus micro delay, at export |
| Micro-timing modulation (V-06) | Live only, missing from exported files | Export chain now wires the same LFO the preview plays |
| Oversampled saturation | Dropped in export | Both shapers keep 4x oversampling at export |
| Forensic detection meters | Display only, unused | FFT analyzer measures carrier prominence before and after rendering, same window both times, so the change column is a real measurement |

Honest limits, stated here and in the app: no processing chain can promise
that any external detector will or will not find anything. What this app
promises is narrower and checkable: the meters show exactly what changed in
the spectrum, and `npm test` proves the math modules do what they claim.

## Run locally

```bash
npm run serve
# open http://localhost:8791
npm test
```

No build step, no dependencies. Plain HTML, CSS and ES modules.

## Deploy to Vercel

Option A, GitHub import (recommended):

1. Push this folder to a GitHub repository (see below).
2. In Vercel: New Project, import the repository.
3. Framework preset: **Other**. Build command: leave empty. Output
   directory: leave empty (root). Deploy.

Option B, CLI:

```bash
npm i -g vercel
vercel deploy --prod
```

`vercel.json` is already in the repo (clean URLs, cache headers for the
static assets).

## Deploy to GitHub

```bash
git init
git add .
git commit -m "NaSuno rebuild: DSP studio with measured carrier analysis"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

The same folder also works on GitHub Pages (Settings, Pages, deploy from
branch `main`, folder `/`), because it is fully static.

## Structure

```
index.html          App shell
css/style.css       Studio panel styling
js/dsp.js           The 14-stage chain (adapted from the original, MIT)
js/filtfilt.js      RBJ biquads, zero-phase filtering, stereo decorrelation
js/analyzer.js      FFT spectrum and carrier prominence measurement
js/perceptual.js    Bark scale and ISO 226 based threshold of hearing
js/app.js           UI wiring, presets, export flow
tests/              Node tests: math modules (9 checks) plus an integration
                    suite that runs renderProcessed and the WAV encoder
                    against a stub Web Audio environment (5 checks)
```

## License

MIT. The DSP chain derives from the NaSuno project (Copyright (c) 2025
geeknik and the NaSuno contributors); the original license text is kept in
`LICENSE-ORIGINAL` and attribution in `js/dsp.js`.
