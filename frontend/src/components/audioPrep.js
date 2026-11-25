import { useEffect, useRef, useState } from 'react';

/*
 * Listening audio is downloaded completely BEFORE the test starts and then played
 * from the student's own computer: a slow server or a Wi-Fi hiccup can no longer
 * make the recording stop and start. Quiet recordings are made louder (with a
 * limiter, so nothing distorts).
 */

const wait = ms => new Promise(r => setTimeout(r, ms));

async function download(url, onBytes) {
  const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (!res.body || !res.body.getReader) {
    const b = await res.blob();
    onBytes(b.size, b.size);
    return b;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(got, total);
  }
  return new Blob(chunks, { type: res.headers.get('Content-Type') || 'audio/mpeg' });
}

/* How much louder a recording can safely be: look at a few minutes of it
   (decoded at a low sample rate to keep memory small) and find its loudest
   moments, ignoring single clicks. Returns a factor between 1 and 4. */
async function measureGain(blob) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) return 1;
  const SLICE = 1.5 * 1024 * 1024;
  const starts = blob.size <= SLICE * 2 ? [0] : [0.15, 0.45, 0.75].map(f => Math.floor(blob.size * f));
  const hist = new Uint32Array(2001);
  let n = 0;
  for (const st of starts) {
    try {
      const buf = await blob.slice(st, st + SLICE).arrayBuffer();
      const ctx = new Ctx(1, 16000, 16000);
      const audio = await new Promise((ok, bad) => {
        const p = ctx.decodeAudioData(buf, ok, bad);
        if (p && p.catch) p.catch(bad);
      });
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const d = audio.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          hist[Math.min(2000, Math.floor(Math.abs(d[i]) * 2000))]++;
          n++;
        }
      }
    } catch { /* this slice could not be decoded: skip it */ }
  }
  if (n < 16000) return 1;
  // loudest 0.03% of samples are treated as clicks
  let keep = n * 0.0003, k = 2000;
  for (; k > 0 && keep > 0; k--) keep -= hist[k];
  const peak = Math.max(k / 2000, 0.01);
  const target = Math.pow(10, -1.5 / 20);          // -1.5 dB
  return Math.max(1, Math.min(4, target / peak));
}

/* Prepares every distinct audio file of the test. */
export function useAudioPrep(urls, enabled = true) {
  const key = (urls || []).join('|');
  const [state, setState] = useState({ status: 'idle', pct: 0, map: {}, gain: 1 });
  const made = useRef([]);

  useEffect(() => {
    if (!enabled || !urls || !urls.length) return;
    let stop = false;
    const list = [...new Set(urls.filter(Boolean))];
    (async () => {
      setState({ status: 'loading', pct: 0, map: {}, gain: 1 });
      const sizes = {};
      const got = {};
      const map = {};
      let gain = 4;
      for (const url of list) {
        let blob = null;
        for (let attempt = 0; attempt < 3 && !blob && !stop; attempt++) {
          try {
            blob = await download(url, (g, t) => {
              got[url] = g; sizes[url] = t || g;
              const all = list.reduce((s, u) => s + (sizes[u] || 0), 0);
              const done = list.reduce((s, u) => s + (got[u] || 0), 0);
              if (!stop) setState(s => ({ ...s, pct: all ? Math.min(99, Math.round((done / all) * 100)) : 0 }));
            });
          } catch { await wait(2000 * (attempt + 1)); }
        }
        if (stop) return;
        if (!blob) { setState(s => ({ ...s, status: 'failed', map })); return; }
        const obj = URL.createObjectURL(blob);
        made.current.push(obj);
        map[url] = obj;
        gain = Math.min(gain, await measureGain(blob));   // one level for the whole test
      }
      if (!stop) setState({ status: 'ready', pct: 100, map, gain });
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => () => made.current.forEach(u => URL.revokeObjectURL(u)), []);
  return state;
}

/* Routes an <audio> element through a gain + limiter. Must be called from a click
   (browsers only allow sound after the user acts). Returns a volume setter. */
export function boostAudio(el, gain) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !el) return null;
    if (el._boost) { el._boost.ctx.resume?.(); el._boost.base = gain; el._boost.set(el._boost.vol); return el._boost; }
    const ctx = new AC();
    const src = ctx.createMediaElementSource(el);
    const g = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    src.connect(g); g.connect(limiter); limiter.connect(ctx.destination);
    const b = { ctx, base: gain, vol: 1 };
    b.set = v => { b.vol = v; g.gain.value = b.base * v; };
    b.set(1);
    ctx.resume?.();
    el._boost = b;
    return b;
  } catch {
    return null;
  }
}
