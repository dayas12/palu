/**
 * NaSuno Rebuild, application wiring.
 * DSP chain: js/dsp.js (adapted from the MIT original).
 * Measurement: js/analyzer.js. Psychoacoustics: js/perceptual.js.
 */

import { NaSunoDSP } from './dsp.js';
import { carrierReport } from './analyzer.js';
import { barkScale, athDb, perceptualWeight } from './perceptual.js';

const KNOBS = [
  { group: 'Watermark erase', items: [
    { id: 'carrierErase', label: 'Carrier Erase', min: 0, max: 100, step: 1, def: 50, unit: '%' },
    { id: 'strideRemove', label: 'Stride Remove', min: 0, max: 100, step: 1, def: 35, unit: '%' },
    { id: 'stegoStrip', label: 'Stego Strip', min: 0, max: 100, step: 1, def: 45, unit: '%' },
  ] },
  { group: 'Spectrum and phase', items: [
    { id: 'neuralScrub', label: 'Neural Scrub', min: 0, max: 100, step: 1, def: 45, unit: '%' },
    { id: 'spectralBlend', label: 'Spectral Blend', min: 0, max: 100, step: 1, def: 40, unit: '%' },
    { id: 'phaseScatter', label: 'Phase Scatter', min: 0, max: 100, step: 1, def: 40, unit: '%' },
  ] },
  { group: 'Texture and space', items: [
    { id: 'statNormalize', label: 'Stat Normalize', min: 0, max: 100, step: 1, def: 40, unit: '%' },
    { id: 'hashBreak', label: 'Hash Break', min: 0, max: 100, step: 1, def: 30, unit: '%' },
    { id: 'roomInject', label: 'Room Inject', min: 0, max: 100, step: 1, def: 35, unit: '%' },
    { id: 'textureInject', label: 'Texture Inject', min: 0, max: 100, step: 1, def: 35, unit: '%' },
  ] },
  { group: 'Mastering', items: [
    { id: 'bandwidthHeal', label: 'Bandwidth Heal', min: -6, max: 6, step: 0.25, def: 0.25, unit: ' dB' },
    { id: 'dynamicsNatural', label: 'Dynamics Naturalizer', min: 0, max: 100, step: 1, def: 40, unit: '%' },
    { id: 'qualityGate', label: 'Quality Gate', min: 1, max: 5, step: 0.1, def: 3, unit: '' },
    { id: 'outputGain', label: 'Output Gain', min: -10, max: 10, step: 0.5, def: 0, unit: ' dB' },
  ] },
];

const PRESETS = {
  off: { name: 'Off', values: { carrierErase: 0, strideRemove: 0, stegoStrip: 0, neuralScrub: 0, spectralBlend: 0, phaseScatter: 0, statNormalize: 0, hashBreak: 0, roomInject: 0, textureInject: 0, bandwidthHeal: 0, dynamicsNatural: 0, qualityGate: 1, outputGain: 0 } },
  lowProfile: { name: 'Low Profile', values: { carrierErase: 20, strideRemove: 15, stegoStrip: 20, neuralScrub: 20, spectralBlend: 25, phaseScatter: 15, statNormalize: 20, hashBreak: 12, roomInject: 15, textureInject: 15, bandwidthHeal: 0.5, dynamicsNatural: 20, qualityGate: 2, outputGain: 0 } },
  standardEvasion: { name: 'Standard', values: { carrierErase: 50, strideRemove: 35, stegoStrip: 45, neuralScrub: 45, spectralBlend: 40, phaseScatter: 40, statNormalize: 40, hashBreak: 30, roomInject: 35, textureInject: 35, bandwidthHeal: 0.25, dynamicsNatural: 40, qualityGate: 3, outputGain: 0 } },
  deepClean: { name: 'Deep Clean', values: { carrierErase: 75, strideRemove: 55, stegoStrip: 65, neuralScrub: 65, spectralBlend: 60, phaseScatter: 55, statNormalize: 55, hashBreak: 60, roomInject: 55, textureInject: 50, bandwidthHeal: 0, dynamicsNatural: 60, qualityGate: 3.8, outputGain: 0 } },
  fullScrub: { name: 'Full Scrub', values: { carrierErase: 95, strideRemove: 80, stegoStrip: 85, neuralScrub: 80, spectralBlend: 80, phaseScatter: 75, statNormalize: 75, hashBreak: 85, roomInject: 75, textureInject: 70, bandwidthHeal: -0.5, dynamicsNatural: 80, qualityGate: 4.5, outputGain: 0 } },
};

const $ = (id) => document.getElementById(id);
const state = {
  ctx: null,
  dsp: null,
  source: null,
  buffer: null,
  fileName: '',
  playing: false,
  before: null,
};

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ---- Knob UI ---------------------------------------------------------------

const sliderEls = {};
function buildKnobs() {
  const host = $('knobGroups');
  for (const group of KNOBS) {
    const section = document.createElement('div');
    section.className = 'knob-group';
    const h = document.createElement('h3');
    h.textContent = group.group;
    section.appendChild(h);
    for (const knob of group.items) {
      const row = document.createElement('div');
      row.className = 'knob';
      const label = document.createElement('label');
      label.htmlFor = 'knob-' + knob.id;
      label.textContent = knob.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = 'knob-' + knob.id;
      input.min = knob.min; input.max = knob.max;
      input.step = knob.step; input.value = knob.def;
      const val = document.createElement('span');
      val.className = 'knob-val';
      val.textContent = knob.def + knob.unit;
      input.addEventListener('input', () => {
        val.textContent = input.value + knob.unit;
        if (state.dsp && state.ctx) state.dsp.updateFromKnob(knob.id, parseFloat(input.value), {});
      });
      sliderEls[knob.id] = { input, val, knob };
      row.append(label, input, val);
      section.appendChild(row);
    }
    host.appendChild(section);
  }
}

function buildPresets() {
  const host = $('presetBtns');
  for (const [key, preset] of Object.entries(PRESETS)) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = preset.name;
    btn.addEventListener('click', () => applyPreset(key, btn));
    host.appendChild(btn);
  }
}

function applyPreset(key, btn) {
  const preset = PRESETS[key];
  for (const [id, value] of Object.entries(preset.values)) {
    const s = sliderEls[id];
    if (!s) continue;
    s.input.value = value;
    s.val.textContent = value + s.knob.unit;
    if (state.dsp && state.ctx) state.dsp.updateFromKnob(id, value, {});
  }
  document.querySelectorAll('#presetBtns .btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function collectParams() {
  const params = {};
  for (const [id, s] of Object.entries(sliderEls)) params[id] = parseFloat(s.input.value);
  return params;
}

function collectFlags() {
  return {
    subClean: $('flagSubClean').checked,
    zeroPhase: $('flagZeroPhase').checked,
    stereoDecorrelate: $('flagDecorrelate').checked,
    dither: $('flagDither').checked,
  };
}

// ---- Audio engine ----------------------------------------------------------

function ensureEngine() {
  if (state.ctx) return;
  state.ctx = new (window.AudioContext || window.webkitAudioContext)();
  state.dsp = new NaSunoDSP();
  state.dsp.init(state.ctx);
  state.dsp.setFlags(collectFlags());
  state.dsp.updateAllFromState(collectParams(), {});
}

function stopPlayback() {
  if (state.source) {
    try { state.source.onended = null; state.source.stop(); } catch (_) {}
    try { state.source.disconnect(); } catch (_) {}
    state.source = null;
  }
  state.playing = false;
  $('playBtn').textContent = 'Play processed';
}

function startPlayback() {
  if (!state.buffer) return;
  ensureEngine();
  if (state.ctx.state === 'suspended') state.ctx.resume();
  stopPlayback();
  const src = state.ctx.createBufferSource();
  src.buffer = state.buffer;
  src.onended = () => { if (state.source === src) stopPlayback(); };
  state.dsp.connect(src, state.ctx.destination);
  state.source = src;
  src.start(0);
  state.playing = true;
  $('playBtn').textContent = 'Pause';
}

// ---- File handling ---------------------------------------------------------

async function loadFile(file) {
  if (!file) return;
  setStatus('Decoding ' + file.name + ' ...');
  stopPlayback();
  if (state.dsp) { state.dsp.disconnect(); state.dsp = null; state.ctx = null; }
  try {
    const probe = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuf = await file.arrayBuffer();
    const buffer = await probe.decodeAudioData(arrayBuf);
    await probe.close();
    state.buffer = buffer;
    state.fileName = file.name;
    $('fileMeta').textContent =
      file.name + ' | ' + buffer.duration.toFixed(1) + ' s | ' +
      buffer.sampleRate + ' Hz | ' + buffer.numberOfChannels + ' ch';
    $('playBtn').disabled = false;
    $('stopBtn').disabled = false;
    $('exportBtn').disabled = false;
    setStatus('Ready: ' + file.name);
    measureBefore();
  } catch (err) {
    console.error(err);
    setStatus('Could not decode that file. Try WAV or MP3.', true);
    $('fileMeta').textContent = 'Decode failed for ' + file.name + '. The browser decoder rejected it.';
  }
}

function measureBefore() {
  // Yield to the UI first; FFT over a full song takes a moment.
  setTimeout(() => {
    if (!state.buffer) return;
    state.before = carrierReport(state.buffer);
    renderMeter(state.before, null);
  }, 30);
}

function renderMeter(before, after) {
  const tbody = document.querySelector('#meterTable tbody');
  tbody.innerHTML = '';
  before.forEach((row, i) => {
    const tr = document.createElement('tr');
    const afterRow = after ? after[i] : null;
    const fmt = (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(1) + ' dB');
    let change = '';
    let cls = '';
    if (afterRow && row.prominenceDb !== null && afterRow.prominenceDb !== null) {
      const d = afterRow.prominenceDb - row.prominenceDb;
      change = (d > 0 ? '+' : '') + d.toFixed(1) + ' dB';
      cls = d < -0.5 ? 'down' : d > 0.5 ? 'up' : '';
    }
    tr.innerHTML =
      '<td>' + (row.freqHz / 1000).toFixed(1) + ' kHz</td>' +
      '<td>' + barkScale(row.freqHz).toFixed(1) + '</td>' +
      '<td>' + athDb(row.freqHz).toFixed(1) + '</td>' +
      '<td>' + fmt(row.prominenceDb) + '</td>' +
      '<td>' + (afterRow ? fmt(afterRow.prominenceDb) : 'not rendered') + '</td>' +
      '<td class="' + cls + '">' + change + '</td>';
    tbody.appendChild(tr);
  });
}

// ---- Export ----------------------------------------------------------------

/**
 * Adaptive mode: scale carrierErase by how prominent the measured carriers
 * are, weighted by audibility on the ATH curve. A carrier nobody can hear
 * gets less processing (better fidelity); a loud one gets more.
 */
function effectiveParams() {
  const params = collectParams();
  if ($('flagAdaptive').checked && state.before) {
    const weights = state.before
      .filter((r) => r.prominenceDb !== null)
      .map((r) => perceptualWeight(r.freqHz, Math.max(0, r.prominenceDb)));
    if (weights.length) {
      const w = weights.reduce((a, b) => a + b, 0) / weights.length;
      params.carrierErase = Math.round(Math.min(100, Math.max(0, params.carrierErase * (0.5 + w))));
    }
  }
  return params;
}

async function doExport() {
  if (!state.buffer) return;
  const btn = $('exportBtn');
  btn.disabled = true;
  setStatus('Rendering offline chain ...');
  try {
    const params = effectiveParams();
    const flags = collectFlags();
    const rendered = await NaSunoDSP.renderProcessed(state.buffer, params, flags);
    const after = carrierReport(rendered);
    if (state.before) renderMeter(state.before, after);
    const blob = NaSunoDSP.encodeWAV(rendered, { dither: flags.dither });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName.replace(/\.[^.]+$/, '') + '-processed.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus('Exported. Meter shows the measured change.');
  } catch (err) {
    console.error(err);
    setStatus('Render failed in this browser. Try a shorter file.', true);
  }
  btn.disabled = false;
}

// ---- Wiring ----------------------------------------------------------------

buildKnobs();
buildPresets();
applyPreset('standardEvasion', document.querySelector('#presetBtns .btn:nth-child(3)'));

$('fileInput').addEventListener('change', (e) => loadFile(e.target.files[0]));
const dz = $('dropzone');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('over');
  loadFile(e.dataTransfer.files[0]);
});

$('playBtn').addEventListener('click', () => {
  if (state.playing) {
    state.ctx.suspend();
    state.playing = false;
    $('playBtn').textContent = 'Resume';
  } else if (state.source && state.ctx && state.ctx.state === 'suspended') {
    state.ctx.resume();
    state.playing = true;
    $('playBtn').textContent = 'Pause';
  } else {
    startPlayback();
  }
});
$('stopBtn').addEventListener('click', stopPlayback);
$('bypassToggle').addEventListener('change', (e) => {
  ensureEngine();
  state.dsp.setBypass(e.target.checked);
  $('playBtn').textContent = state.playing ? 'Pause' : (e.target.checked ? 'Play original' : 'Play processed');
});
$('exportBtn').addEventListener('click', doExport);

for (const id of ['flagSubClean']) {
  $(id).addEventListener('change', () => { if (state.dsp) state.dsp.setFlags(collectFlags()); });
}
