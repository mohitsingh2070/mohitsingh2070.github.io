/* app.js — Climate Data Explorer: UI and calculations. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const MONTHS = CFTime.MONTHS;

  const SAMPLES = [
    { file: 'data/air.mon.mean.nc', label: 'Near-surface air temperature – NCEP/NCAR Reanalysis 1 (monthly, 1948–now)' },
    { file: 'data/precip.mon.mean.nc', label: 'Precipitation – GPCP v2.3 (monthly, 1979–now)' },
    { file: 'data/ersst_v5_sst_1950-present.nc', label: 'Sea surface temperature – NOAA ERSST v5 (monthly, 1950–now)' },
    { file: 'data/slp.mon.mean.nc', label: 'Sea-level pressure – NCEP/NCAR Reanalysis 1 (monthly)' },
    { file: 'data/nino34_index_ersstv5.csv', label: 'Niño 3.4 index – CSV time series' },
  ];

  const TS_REGIONS = {
    point: { label: 'Clicked point on the map' },
    map: { label: 'Average over the current map area' },
    global: { label: 'Global average', bbox: [-180, 180, -90, 90] },
    nh: { label: 'Northern Hemisphere', bbox: [-180, 180, 0, 90] },
    sh: { label: 'Southern Hemisphere', bbox: [-180, 180, -90, 0] },
    tropics: { label: 'Tropics (23.5°S–23.5°N)', bbox: [-180, 180, -23.5, 23.5] },
    arctic: { label: 'Arctic (66.5°N–90°N)', bbox: [-180, 180, 66.5, 90] },
    india: { label: 'India box (8–30°N, 70–90°E)', bbox: [70, 90, 8, 30] },
    nino34: { label: 'Niño 3.4 (5°S–5°N, 170°W–120°W)', bbox: [190, 240, -5, 5] },
    nino3: { label: 'Niño 3 (5°S–5°N, 150°W–90°W)', bbox: [210, 270, -5, 5] },
    iod: { label: 'Indian Ocean Dipole (west box − east box)', bboxes: [[50, 70, -10, 10], [90, 110, -10, 0]] },
  };

  // ------------------------------------------------------------------ state
  const S = {
    ds: null, fileName: '', csv: null,
    vn: null, v: null, roles: null, grid: null, time: null, other: {}, unitOpts: [], unitIdx: 0,
    pack: null, cache: new Map(), cacheMax: 64,
    mode: 'single', ti: 0, months: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    y0: null, y1: null, b0: null, b1: null, anom: false,
    field: null, fieldMeta: null, cmapAuto: true,
    click: null, tsCache: new Map(), playing: false,
  };
  let mapView;
  let computeToken = 0;

  // ------------------------------------------------------------------ utils
  const nextFrame = () => new Promise(r => setTimeout(r, 0));
  function toast(msg, ms = 4200) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function setProgress(frac, text) {
    const p = $('progress');
    if (frac === null) { p.classList.remove('on'); return; }
    p.classList.add('on'); p.querySelector('div').style.width = (frac * 100).toFixed(1) + '%';
    p.querySelector('span').textContent = text || '';
  }
  const fmt = v => (isFinite(v) ? MapView.fmt(v) : '–');
  const attr = (v, k) => (v && v.attrs && v.attrs[k] !== undefined ? v.attrs[k] : undefined);
  const baseName = n => n.split('/').pop();
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const safe = s => String(s).replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------ file loading
  async function loadBuffer(buf, name) {
    stopPlay();
    if (S.ds) { try { S.ds.close(); } catch (e) { /* ignore */ } }
    S.ds = null; S.csv = null; S.cache.clear(); S.tsCache.clear(); S.click = null;
    S.fileName = name;
    if (/\.(csv|txt|tsv)$/i.test(name)) return loadCSV(new TextDecoder().decode(buf), name);
    setProgress(0.3, 'Reading ' + name + ' …');
    await nextFrame();
    try {
      S.ds = await NCReader.open(buf, name);
    } catch (e) {
      setProgress(null);
      showError(e.message || String(e));
      return;
    }
    setProgress(null);
    document.body.classList.remove('csvmode');
    document.body.classList.add('loaded');
    renderFileInfo();
    populateVars();
  }

  async function loadFile(file) {
    if (file.size > 1.5e9) toast('This file is very large (' + (file.size / 1e9).toFixed(1) + ' GB) and may not fit in browser memory. Consider subsetting it first (see Guide).', 9000);
    setProgress(0.1, 'Loading ' + file.name + ' …');
    const buf = await file.arrayBuffer();
    await loadBuffer(buf, file.name);
  }

  async function loadSample(url) {
    setProgress(0.05, 'Downloading sample …');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const total = +res.headers.get('content-length') || 0;
      const reader = res.body.getReader(); const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        if (total) setProgress(got / total * 0.9, `Downloading sample … ${(got / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`);
      }
      const buf = new Uint8Array(got); let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.length; }
      await loadBuffer(buf.buffer, url.split('/').pop());
    } catch (e) {
      setProgress(null);
      showError('Could not download the sample (' + e.message + '). If you opened index.html directly from disk, start a local web server instead (see README) — or simply use “Choose file”.');
    }
  }

  function showError(msg) {
    $('fileInfo').innerHTML = `<div class="err">${escapeHtml(msg)}</div>`;
    toast(msg, 9000);
  }

  // ------------------------------------------------------------------ variables & dimensions
  function coordVar(dim) {
    const ds = S.ds;
    for (const vn of [dim, ...Object.keys(ds.vars).filter(k => baseName(k) === dim)]) {
      const v = ds.vars[vn];
      if (v && v.shape.length === 1 && baseName(v.dims[0]) === dim) return v;
    }
    return null;
  }
  function dimRole(dim) {
    const cv = coordVar(dim);
    const n = dim.toLowerCase();
    const u = String(attr(cv, 'units') || '').toLowerCase().trim();
    const sn = String(attr(cv, 'standard_name') || '').toLowerCase();
    const ax = String(attr(cv, 'axis') || '').toUpperCase();
    if (sn === 'latitude' || /^degrees?_?n(orth)?$/.test(u) || ['lat', 'latitude', 'lats', 'nav_lat', 'y_lat'].includes(n)) return 'lat';
    if (sn === 'longitude' || /^degrees?_?e(ast)?$/.test(u) || ['lon', 'longitude', 'lons', 'nav_lon', 'x_lon'].includes(n)) return 'lon';
    if (sn === 'time' || ax === 'T' || /\bsince\b/.test(u) || ['time', 't', 'valid_time', 'date', 'times', 'time_counter'].includes(n)) return 'time';
    if (ax === 'Z' || attr(cv, 'positive') || ['lev', 'level', 'plev', 'pressure_level', 'isobaricinhpa', 'depth', 'height', 'olevel', 'lev_p', 'pressure', 'z'].includes(n)) return 'level';
    return 'other';
  }
  function isBounds(vn) {
    const ds = S.ds;
    if (/(_bnds|_bounds|^bnds|_bnd)$/i.test(vn)) return true;
    return Object.values(ds.vars).some(v => attr(v, 'bounds') === baseName(vn) || attr(v, 'climatology') === baseName(vn));
  }

  function populateVars() {
    const ds = S.ds, sel = $('var');
    sel.innerHTML = '';
    const list = [];
    for (const [vn, v] of Object.entries(ds.vars)) {
      if (v.isChar || v.shape.length === 0) continue;
      if (v.shape.length === 1 && baseName(v.dims[0]) === baseName(vn)) continue; // coordinate variable
      if (isBounds(vn)) continue;
      const roles = v.dims.map(d => dimRole(baseName(d)));
      const isMap = roles.includes('lat') && roles.includes('lon');
      const hasTime = roles.includes('time');
      list.push({ vn, v, isMap, hasTime, size: v.shape.reduce((a, b) => a * b, 1) });
    }
    list.sort((a, b) => (b.isMap - a.isMap) || (b.size - a.size));
    if (!list.length) { showError('No plottable variables found in this file.'); return; }
    for (const it of list) {
      const o = document.createElement('option'); o.value = it.vn;
      const ln = attr(it.v, 'long_name') || attr(it.v, 'standard_name') || '';
      o.textContent = `${baseName(it.vn)}${ln ? ' — ' + ln : ''}${it.isMap ? '' : ' (no lat/lon: time series only)'}`;
      sel.appendChild(o);
    }
    selectVar(list[0].vn);
  }

  function readCoord(dim) {
    const cv = coordVar(dim);
    if (!cv) return null;
    return S.ds.read(cv.name);
  }

  function selectVar(vn) {
    stopPlay();
    const ds = S.ds, v = ds.vars[vn];
    S.vn = vn; S.v = v; S.cache.clear(); S.tsCache.clear(); S.cmapAuto = true;
    $('var').value = vn;
    const roles = { lat: null, lon: null, time: null, others: [] };
    v.dims.forEach(d => {
      const r = dimRole(baseName(d));
      if ((r === 'lat' || r === 'lon' || r === 'time') && !roles[r]) roles[r] = d;
      else roles.others.push(d);
    });
    S.roles = roles;

    // packing / missing values (applied to raw numbers, as in the CF conventions)
    const num = x => (Array.isArray(x) ? x[0] : x);
    const fills = [attr(v, '_FillValue'), attr(v, 'missing_value')].flat().filter(x => typeof x === 'number');
    const vr = attr(v, 'valid_range');
    S.pack = {
      scale: num(attr(v, 'scale_factor')) ?? 1, offset: num(attr(v, 'add_offset')) ?? 0,
      fills, vmin: Array.isArray(vr) ? vr[0] : num(attr(v, 'valid_min')), vmax: Array.isArray(vr) ? vr[1] : num(attr(v, 'valid_max')),
    };

    // grid
    S.grid = null;
    let note = '';
    if (roles.lat && roles.lon) {
      const lat = readCoord(baseName(roles.lat)), lon = readCoord(baseName(roles.lon));
      if (!lat || !lon) note = 'Latitude/longitude coordinate values are missing, so this variable cannot be mapped.';
      else setupGrid(lat, lon);
    } else if (attr(v, 'coordinates') && /lat/i.test(attr(v, 'coordinates'))) {
      note = 'This variable is on a curvilinear (2-D lat/lon) grid, e.g. an ocean model grid. Re-grid it to a regular lat/lon grid first (see Guide → tips: cdo remapbil).';
    }

    // time
    S.time = null;
    if (roles.time) {
      const tv = coordVar(baseName(roles.time));
      const vals = tv ? ds.read(tv.name) : Float64Array.from({ length: ds.dims[baseName(roles.time)] || v.shape[v.dims.indexOf(roles.time)] }, (_, i) => i);
      const dec = tv ? CFTime.decode(vals, attr(tv, 'units'), attr(tv, 'calendar')) : { ok: false };
      if (dec.ok) S.time = { n: vals.length, steps: dec.steps, freq: dec.freq, calendar: dec.calendar, ok: true };
      else S.time = { n: vals.length, steps: Array.from(vals, (x, i) => ({ label: 'step ' + i, dec: i })), freq: 'unknown', ok: false };
    }

    // other dimensions (pressure level, ensemble member, …) -> selectors
    const box = $('extraDims'); box.innerHTML = '';
    S.other = {};
    for (const d of roles.others) {
      const len = v.shape[v.dims.indexOf(d)];
      S.other[d] = 0;
      if (len <= 1) continue;
      const cv = coordVar(baseName(d));
      let vals = null; let u = String(attr(cv, 'units') || '');
      try { vals = cv ? ds.read(cv.name) : null; } catch (e) { vals = null; }
      let conv = x => x;
      if (/^pa$/i.test(u)) { conv = x => x / 100; u = 'hPa'; }
      const lab = document.createElement('label');
      lab.textContent = (dimRole(baseName(d)) === 'level' ? 'Level' : baseName(d)) + ' ';
      const s = document.createElement('select');
      for (let i = 0; i < len; i++) {
        const o = document.createElement('option'); o.value = i;
        o.textContent = vals ? `${+conv(vals[i]).toPrecision(6)} ${u}` : `#${i}`;
        s.appendChild(o);
      }
      // a sensible default for pressure levels: 850 hPa if present
      if (vals && u === 'hPa') { const k = Array.from(vals, conv).findIndex(x => Math.abs(x - 850) < 1); if (k >= 0) { s.value = k; S.other[d] = k; } }
      if (vals && /^(mbar|millibar|hpa)$/i.test(u)) { const k = Array.from(vals).findIndex(x => Math.abs(x - 850) < 1); if (k >= 0) { s.value = k; S.other[d] = k; } }
      s.onchange = () => { S.other[d] = +s.value; S.cache.clear(); S.tsCache.clear(); update(); };
      s.dataset.dim = d;
      lab.appendChild(s); box.appendChild(lab);
    }

    // units
    const units = String(attr(v, 'units') || '');
    S.unitOpts = unitOptions(units, baseName(vn));
    const us = $('units'); us.innerHTML = '';
    S.unitOpts.forEach((o, i) => { const op = document.createElement('option'); op.value = i; op.textContent = o.label; us.appendChild(op); });
    S.unitIdx = 0; us.value = 0;
    $('unitsRow').style.display = S.unitOpts.length > 1 ? '' : 'none';

    // description
    const ln = attr(v, 'long_name') || attr(v, 'standard_name') || baseName(vn);
    const dimsTxt = v.dims.map((d, i) => `${baseName(d)} (${v.shape[i]})`).join(' × ');
    let desc = `<b>${escapeHtml(ln)}</b><br>Dimensions: ${escapeHtml(dimsTxt)}`;
    if (S.time && S.time.ok) {
      const st = S.time.steps;
      desc += `<br>Time: ${st[0].label} → ${st[st.length - 1].label} (${S.time.n} steps, ${S.time.freq}${S.time.calendar !== 'standard' ? ', ' + S.time.calendar + ' calendar' : ''})`;
    }
    if (S.grid) {
      const g = S.grid;
      const dlat = g.nlat > 1 ? Math.abs(g.lat[1] - g.lat[0]) : 0, dlon = g.nlon > 1 ? Math.abs(g.lon[1] - g.lon[0]) : 0;
      desc += `<br>Grid: ${g.nlat} × ${g.nlon} points (~${+dlat.toFixed(3)}° × ${+dlon.toFixed(3)}°)`;
    }
    if (note) desc += `<div class="err">${escapeHtml(note)}</div>`;
    $('varDesc').innerHTML = desc;

    // time controls
    setupTimeControls();
    document.body.classList.toggle('nomap', !S.grid);
    document.body.classList.toggle('notime', !S.time || S.time.n <= 1);
    if (!S.grid) { showTab('ts'); updateTimeSeries(); return; }
    mapView.setGrid(S.grid.lat, S.grid.lon);
    S.click = null; mapView.setMarker(null);
    update();
    if (activeTab() === 'ts') updateTimeSeries();
  }

  /** Re-order the grid so latitude ascends and longitude ascends from the edge of its largest gap. */
  function setupGrid(latRaw, lonRaw) {
    const nlat = latRaw.length, nlon = lonRaw.length;
    const latOrder = d3.range(nlat).sort((a, b) => latRaw[a] - latRaw[b]);
    const lonN = Array.from(lonRaw, x => ((x % 360) + 360) % 360);
    const srt = d3.range(nlon).sort((a, b) => lonN[a] - lonN[b]);
    let start = 0, bestGap = nlon > 1 ? lonN[srt[0]] + 360 - lonN[srt[nlon - 1]] : 360;
    for (let k = 0; k < nlon - 1; k++) {
      const gap = lonN[srt[k + 1]] - lonN[srt[k]];
      if (gap > bestGap + 1e-6) { bestGap = gap; start = k + 1; }
    }
    const lonOrder = [], lon = new Float64Array(nlon);
    for (let k = 0; k < nlon; k++) {
      const idx = srt[(start + k) % nlon]; lonOrder.push(idx);
      lon[k] = lonN[idx] + (start + k >= nlon ? 360 : 0);
    }
    if (lon[0] >= 180) for (let k = 0; k < nlon; k++) lon[k] -= 360; // prefer -180..180 when possible
    const lat = Float64Array.from(latOrder, i => latRaw[i]);
    // canonical index -> offset in the raw 2-D slice (which keeps the variable's own dim order)
    const v = S.v;
    const latFirst = v.dims.indexOf(S.roles.lat) < v.dims.indexOf(S.roles.lon);
    const perm = new Int32Array(nlat * nlon);
    for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
      perm[i * nlon + j] = latFirst ? latOrder[i] * nlon + lonOrder[j] : lonOrder[j] * nlat + latOrder[i];
    }
    const wts = Float64Array.from(lat, la => Math.cos(la * Math.PI / 180));
    S.grid = { lat, lon, nlat, nlon, latOrder, lonOrder, perm, wts };
    S.cacheMax = Math.max(24, Math.min(600, Math.floor(160e6 / (nlat * nlon * 4))));
  }

  function unitOptions(u, name) {
    const t = u.trim(), n = name.toLowerCase();
    const native = { label: t || '(no units)', f: null, units: t };
    if (/^(k|kelvin|degk|deg_k|degrees?_?k)$/i.test(t)) return [{ label: '°C (converted from K)', f: x => x - 273.15, units: '°C' }, native];
    if (/^(degc|deg_c|celsius|degrees?_?c(elsius)?|°c)$/i.test(t)) return [{ label: '°C', f: null, units: '°C' }];
    if (/^kg\s*m(\*\*)?-2\s*s(\*\*)?-1$|^kg\/m2\/s$|^kg\/\(m2 s\)$|^kg m\^-2 s\^-1$/i.test(t)) return [{ label: 'mm/day (converted from kg m⁻² s⁻¹)', f: x => x * 86400, units: 'mm/day' }, native];
    if (/^pa$/i.test(t)) return [{ label: 'hPa (converted from Pa)', f: x => x / 100, units: 'hPa' }, native];
    if (/^m$/i.test(t) && /^(tp|cp|lsp|e|pr|precip|sf)$/.test(n)) return [{ label: 'mm (converted from m)', f: x => x * 1000, units: 'mm' }, native];
    if (/^m(\*\*)?2\s*s(\*\*)?-2$|^m2\/s2$/i.test(t) && /^(z|zg|geopotential|phi)$/.test(n)) return [{ label: 'geopotential height, m (÷ g)', f: x => x / 9.80665, units: 'm' }, native];
    if (/^m\s*s(\*\*)?-1$|^m\/s$/i.test(t)) return [native, { label: 'km/h', f: x => x * 3.6, units: 'km/h' }];
    return [native];
  }
  const units = () => (S.unitOpts[S.unitIdx] || {}).units || '';

  // ------------------------------------------------------------------ reading data
  function sliceStart(ti) {
    const v = S.v;
    return v.dims.map(d => (d === S.roles.lat || d === S.roles.lon ? 0 : d === S.roles.time ? ti : S.other[d] || 0));
  }
  function unpacker() {
    const p = S.pack, conv = S.unitOpts[S.unitIdx] && S.unitOpts[S.unitIdx].f;
    const fills = p.fills.map(Number);
    const f32 = fills.map(Math.fround);
    return r => {
      if (r !== r || Math.abs(r) > 1e30) return NaN;
      for (let k = 0; k < fills.length; k++) if (r === fills[k] || Math.fround(r) === f32[k]) return NaN;
      if (p.vmin !== undefined && r < p.vmin) return NaN;
      if (p.vmax !== undefined && r > p.vmax) return NaN;
      const x = r * p.scale + p.offset;
      return conv ? conv(x) : x;
    };
  }
  function readField(ti) {
    const key = `${S.vn}|${JSON.stringify(S.other)}|${ti}|${S.unitIdx}`;
    const c = S.cache.get(key);
    if (c) { S.cache.delete(key); S.cache.set(key, c); return c; }
    const v = S.v, g = S.grid;
    const count = v.dims.map(d => (d === S.roles.lat ? g.nlat : d === S.roles.lon ? g.nlon : 1));
    const raw = S.ds.read(S.vn, sliceStart(ti), count);
    const un = unpacker();
    const out = new Float32Array(g.nlat * g.nlon);
    const perm = g.perm;
    for (let k = 0; k < out.length; k++) out[k] = un(raw[perm[k]]);
    S.cache.set(key, out);
    while (S.cache.size > S.cacheMax) S.cache.delete(S.cache.keys().next().value);
    return out;
  }

  // ------------------------------------------------------------------ time selections
  function yearsOfData() {
    const st = S.time.steps;
    return [st[0].y, st[st.length - 1].y];
  }
  /** seasons that cross the new year (e.g. DJF) are counted in the year of their last month */
  function seasonInfo(months) {
    const sel = [...months].sort((a, b) => a - b);
    if (sel.length === 12 || !(months.has(12) && months.has(1))) return { wrap: false, start: sel[0] };
    let start = sel.find(m => !months.has(m === 1 ? 12 : m - 1));
    return { wrap: true, start: start || sel[0] };
  }
  function seasonYear(step, si) { return si.wrap && step.m >= si.start ? step.y + 1 : step.y; }
  function indicesFor(months, y0, y1) {
    const si = seasonInfo(months);
    const out = [];
    S.time.steps.forEach((s, i) => { if (months.has(s.m)) { const sy = seasonYear(s, si); if (sy >= y0 && sy <= y1) out.push(i); } });
    return out;
  }
  /** group indices into complete seasons/years: Map seasonYear -> indices */
  function yearlyGroups(months, y0, y1) {
    const si = seasonInfo(months);
    const groups = new Map();
    S.time.steps.forEach((s, i) => {
      if (!months.has(s.m)) return;
      const sy = seasonYear(s, si); if (sy < y0 || sy > y1) return;
      if (!groups.has(sy)) groups.set(sy, { idx: [], months: new Set() });
      const gr = groups.get(sy); gr.idx.push(i); gr.months.add(s.m);
    });
    for (const [y, gr] of groups) if (gr.months.size < months.size) groups.delete(y); // incomplete season
    return groups;
  }
  function monthsLabel(months) {
    if (months.size === 12) return 'Annual';
    const si = seasonInfo(months);
    const seq = []; let m = si.start;
    for (let k = 0; k < 12 && months.has(m); k++) { seq.push(m); m = m === 12 ? 1 : m + 1; }
    if (seq.length === months.size) {
      if (seq.length === 1) return MONTHS[seq[0] - 1];
      if (seq.length <= 4) return seq.map(x => MONTHS[x - 1][0]).join('') + ` (${MONTHS[seq[0] - 1]}–${MONTHS[seq[seq.length - 1] - 1]})`;
      return `${MONTHS[seq[0] - 1]}–${MONTHS[seq[seq.length - 1] - 1]}`;
    }
    return [...months].sort((a, b) => a - b).map(x => MONTHS[x - 1]).join(', ');
  }

  // ------------------------------------------------------------------ calculations
  class Cancelled extends Error {}
  async function meanOf(indices, my, what) {
    const g = S.grid, n = g.nlat * g.nlon;
    const sum = new Float64Array(n), cnt = new Uint32Array(n);
    for (let k = 0; k < indices.length; k++) {
      const f = readField(indices[k]);
      for (let p = 0; p < n; p++) { const x = f[p]; if (x === x) { sum[p] += x; cnt[p]++; } }
      if (k % 6 === 5) {
        setProgress((k + 1) / indices.length, `${what}: ${k + 1} / ${indices.length} time steps`);
        await nextFrame();
        if (my !== computeToken) throw new Cancelled();
      }
    }
    const out = new Float32Array(n);
    for (let p = 0; p < n; p++) out[p] = cnt[p] ? sum[p] / cnt[p] : NaN;
    return out;
  }
  const climCache = new Map();
  async function baselineMean(months, my) {
    const key = `${S.vn}|${JSON.stringify(S.other)}|${S.unitIdx}|${[...months].sort().join(',')}|${S.b0}-${S.b1}`;
    if (climCache.has(key)) return climCache.get(key);
    const idx = indicesFor(months, S.b0, S.b1);
    if (!idx.length) throw new Error(`No data in the baseline period ${S.b0}–${S.b1}. Change the baseline years.`);
    const m = await meanOf(idx, my, `Baseline ${S.b0}–${S.b1}`);
    climCache.set(key, m);
    if (climCache.size > 40) climCache.delete(climCache.keys().next().value);
    return m;
  }
  async function yearlyStats(kind, my) {
    const groups = yearlyGroups(S.months, S.y0, S.y1);
    const years = [...groups.keys()].sort((a, b) => a - b);
    if (years.length < 5) throw new Error('Need at least 5 complete years in the selected period for this calculation.');
    const g = S.grid, n = g.nlat * g.nlon;
    const cnt = new Float64Array(n), mean = new Float64Array(n), m2 = new Float64Array(n), sxy = new Float64Array(n), sx = new Float64Array(n), sxx = new Float64Array(n);
    const total = years.reduce((a, y) => a + groups.get(y).idx.length, 0);
    let done = 0;
    for (const y of years) {
      const idx = groups.get(y).idx;
      const sum = new Float64Array(n), c = new Uint16Array(n);
      for (const i of idx) {
        const f = readField(i);
        for (let p = 0; p < n; p++) { const x = f[p]; if (x === x) { sum[p] += x; c[p]++; } }
        if (++done % 6 === 0) { setProgress(done / total, `${kind === 'trend' ? 'Trend' : 'Variability'}: ${done} / ${total} time steps`); await nextFrame(); if (my !== computeToken) throw new Cancelled(); }
      }
      const x = y - years[0];
      for (let p = 0; p < n; p++) {
        if (c[p] < idx.length) continue; // need the whole season at this point
        const val = sum[p] / c[p];
        cnt[p]++;
        const d = val - mean[p]; mean[p] += d / cnt[p]; m2[p] += d * (val - mean[p]);
        sx[p] += x; sxx[p] += x * x; sxy[p] += x * val;
      }
    }
    const out = new Float32Array(n);
    const need = Math.max(5, Math.ceil(0.7 * years.length));
    for (let p = 0; p < n; p++) {
      const k = cnt[p];
      if (k < need) { out[p] = NaN; continue; }
      if (kind === 'trend') {
        const sy = mean[p] * k;
        const den = k * sxx[p] - sx[p] * sx[p];
        out[p] = den ? ((k * sxy[p] - sx[p] * sy) / den) * 10 : NaN;
      } else out[p] = Math.sqrt(m2[p] / (k - 1));
    }
    return { field: out, years };
  }

  async function computeMap() {
    const my = ++computeToken;
    if (!S.grid) return;
    const t = S.time;
    const mode = t && t.ok ? S.mode : 'single';
    const lev = levelText();
    let field, sub = '', kind = 'abs';
    try {
      if (mode === 'single') {
        const ti = t ? S.ti : 0;
        field = readField(ti);
        sub = t ? t.steps[ti].label : '';
        if (S.anom && t && t.ok) {
          const m = t.steps[ti].m;
          const months = t.freq === 'yearly' || t.freq === 'multiyear' ? new Set(d3.range(1, 13)) : new Set([m]);
          const base = await baselineMean(months, my);
          const a = new Float32Array(field.length);
          for (let p = 0; p < a.length; p++) a[p] = field[p] - base[p];
          field = a; kind = 'anom';
          sub += ` — anomaly vs ${months.size === 12 ? '' : MONTHS[m - 1] + ' '}${S.b0}–${S.b1} average`;
        }
      } else if (mode === 'mean') {
        const idx = indicesFor(S.months, S.y0, S.y1);
        if (!idx.length) throw new Error('No time steps match the selected months and years.');
        field = await meanOf(idx, my, 'Averaging');
        sub = `${monthsLabel(S.months)} mean, ${S.y0}–${S.y1}`;
        if (S.anom) {
          const base = await baselineMean(S.months, my);
          const a = new Float32Array(field.length);
          for (let p = 0; p < a.length; p++) a[p] = field[p] - base[p];
          field = a; kind = 'anom';
          sub += ` — anomaly vs ${S.b0}–${S.b1}`;
        }
      } else {
        const r = await yearlyStats(mode, my);
        field = r.field;
        kind = mode === 'trend' ? 'trend' : 'std';
        sub = mode === 'trend'
          ? `Linear trend of the ${monthsLabel(S.months)} mean, ${r.years[0]}–${r.years[r.years.length - 1]} (per decade)`
          : `Year-to-year standard deviation of the ${monthsLabel(S.months)} mean, ${r.years[0]}–${r.years[r.years.length - 1]}`;
      }
    } catch (e) {
      setProgress(null);
      if (e instanceof Cancelled) return;
      console.error(e);
      toast(e.message || String(e), 7000);
      return;
    }
    if (my !== computeToken) return;
    setProgress(null);
    S.field = field;
    S.fieldMeta = { kind, sub: sub + (lev ? ` · ${lev}` : ''), units: kind === 'trend' ? `${units()} per decade` : units() };
    drawMap();
  }

  function levelText() {
    const parts = [];
    document.querySelectorAll('#extraDims select').forEach(s => {
      const lab = s.parentElement.firstChild.textContent.trim();
      parts.push(`${lab} ${s.options[s.selectedIndex].textContent}`);
    });
    return parts.join(', ');
  }

  // ------------------------------------------------------------------ colours & range
  function varFlavor() {
    const n = baseName(S.vn || '').toLowerCase();
    const ln = String(attr(S.v, 'long_name') || attr(S.v, 'standard_name') || '').toLowerCase();
    const u = units().toLowerCase();
    if (/prec|rain|^pr$|^tp$|^cp$|^lsp$|pratesfc|prate|snow|^sf$/.test(n) || /precip|rain/.test(ln)) return 'precip';
    if (/^(tas|tasmax|tasmin|ts|tos|sst|t2m|air|t|ta|skt|temp|d2m|stl1)/.test(n) || /temperature/.test(ln) || /°c|^k$|degc/.test(u)) return 'temp';
    if (/^(u|v|ua|va|u10|v10|uwnd|vwnd|wap|omega|w)$/.test(n) || /wind|velocity/.test(ln)) return 'signed';
    if (/cloud|^tcc|clt/.test(n + ln)) return 'cloud';
    return 'other';
  }
  function autoCmap(kind) {
    const fl = varFlavor();
    if (kind === 'anom' || kind === 'trend') return fl === 'precip' ? 'BrBG' : 'RdBu_r';
    if (kind === 'std') return 'magma';
    if (fl === 'precip') return 'YlGnBu';
    if (fl === 'temp') return 'RdYlBu_r';
    if (fl === 'signed') return 'RdBu_r';
    if (fl === 'cloud') return 'Greys';
    return 'viridis';
  }
  function autoRange(field, symmetric) {
    let vals = [];
    const step = Math.max(1, Math.floor(field.length / 200000));
    for (let p = 0; p < field.length; p += step) if (field[p] === field[p]) vals.push(field[p]);
    if (!vals.length) return [0, 1];
    vals.sort((a, b) => a - b);
    const q = f => vals[Math.min(vals.length - 1, Math.floor(f * (vals.length - 1)))];
    let lo = q(0.02), hi = q(0.98);
    if (symmetric) { const a = Math.max(Math.abs(lo), Math.abs(hi)) || 1; [lo, hi] = d3.scaleLinear().domain([-a, a]).nice(8).domain(); return [lo, hi]; }
    if (lo === hi) { lo -= 1; hi += 1; }
    return d3.scaleLinear().domain([lo, hi]).nice(8).domain();
  }

  // ------------------------------------------------------------------ drawing
  function drawMap() {
    if (!S.field) return;
    const meta = S.fieldMeta;
    if (S.cmapAuto) $('cmap').value = autoCmap(meta.kind);
    const rangeMode = $('range').value;
    let vmin, vmax;
    if (rangeMode === 'manual') {
      vmin = parseFloat($('vmin').value); vmax = parseFloat($('vmax').value);
      if (!(vmax > vmin)) { [vmin, vmax] = autoRange(S.field, false); }
    } else {
      const sym = rangeMode === 'sym' || ((meta.kind === 'anom' || meta.kind === 'trend' || varFlavor() === 'signed') && rangeMode === 'auto');
      [vmin, vmax] = autoRange(S.field, sym);
      if (meta.kind === 'std') vmin = 0;
      $('vmin').value = +vmin.toPrecision(5); $('vmax').value = +vmax.toPrecision(5);
    }
    const style = currentStyle();
    if (style.levels > 0 && rangeMode === 'manual') {
      // keep the typed range, but use round level steps when they divide it evenly
      const step = d3.tickStep(vmin, vmax, style.levels), k = (vmax - vmin) / step;
      if (Math.abs(k - Math.round(k)) < 1e-6 && k >= 2) style.levels = Math.round(k);
    } else if (style.levels > 0) {
      // snap to round level boundaries, e.g. -3, -2.5, … 3 instead of 12 arbitrary steps
      const step = d3.tickStep(vmin, vmax, style.levels);
      vmin = Math.floor(vmin / step + 1e-9) * step; vmax = Math.ceil(vmax / step - 1e-9) * step;
      style.levels = Math.max(2, Math.round((vmax - vmin) / step));
      $('vmin').value = +vmin.toPrecision(6); $('vmax').value = +vmax.toPrecision(6);
    }
    Object.assign(style, { vmin, vmax });
    mapView.setStyle(style);
    mapView.setField(S.field);
    mapView.render();
    drawColorbarEl();
    // titles
    const ln = attr(S.v, 'long_name') || attr(S.v, 'standard_name') || baseName(S.vn);
    $('mapTitle').textContent = `${cap(ln)}${meta.units ? ' (' + meta.units + ')' : ''}`;
    $('mapSub').textContent = meta.sub;
    updateStats();
    if (activeTab() === 'zonal') drawZonal();
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function currentStyle() {
    const reg = $('region').value;
    let bbox = null, projection = $('proj').value;
    if (reg === 'custom') {
      const b = ['bw', 'be', 'bs', 'bn'].map(id => parseFloat($(id).value));
      if (b.every(isFinite) && b[3] > b[2]) bbox = b;
    } else if (MapView.REGIONS[reg]) {
      bbox = MapView.REGIONS[reg].bbox;
      if (MapView.REGIONS[reg].projection) projection = MapView.REGIONS[reg].projection;
    }
    return {
      projection, region: reg, bbox, center: +$('center').value,
      cmap: $('cmap').value, reverse: $('reverse').checked, levels: +$('levels').value,
      smooth: $('smooth').checked, coast: $('coast').checked, borders: $('borders').checked,
      grid: $('gridlines').checked, contours: $('contours').checked,
    };
  }

  function drawColorbarEl() {
    const c = $('cbar');
    const W = Math.min(620, Math.max(280, $('map').clientWidth - 40));
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = 62 * dpr; c.style.width = W + 'px'; c.style.height = '62px';
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    MapView.drawColorbar(ctx, 6, 4, W - 12, 16, mapView.style, S.fieldMeta ? S.fieldMeta.units : '', 12);
  }

  function regionCells(bbox) {
    // canonical cell indices inside a lon/lat box, with cos(lat) weights
    const g = S.grid; const out = [], w = [];
    let [w0, e0, s0, n0] = bbox;
    const full = e0 - w0 >= 360 || (w0 <= -180 && e0 >= 180);
    for (let i = 0; i < g.nlat; i++) {
      if (g.lat[i] < s0 || g.lat[i] > n0) continue;
      for (let j = 0; j < g.nlon; j++) {
        if (!full) {
          const x = ((g.lon[j] - w0) % 360 + 360) % 360;
          let span = e0 - w0; if (span <= 0) span += 360;
          if (x > span) continue;
        }
        out.push(i * g.nlon + j); w.push(g.wts[i]);
      }
    }
    return { idx: Int32Array.from(out), w: Float64Array.from(w) };
  }
  function weightedMean(field, cells) {
    let s = 0, ws = 0;
    for (let k = 0; k < cells.idx.length; k++) { const x = field[cells.idx[k]]; if (x === x) { s += x * cells.w[k]; ws += cells.w[k]; } }
    return ws ? s / ws : NaN;
  }
  function updateStats() {
    const f = S.field; if (!f) return;
    const st = mapView.style;
    const cells = regionCells(st.bbox || [-180, 180, -90, 90]);
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < cells.idx.length; k++) { const x = f[cells.idx[k]]; if (x < mn) mn = x; if (x > mx) mx = x; }
    const u = S.fieldMeta.units;
    $('stats').innerHTML = cells.idx.length
      ? `Area-weighted mean over ${st.bbox ? 'map area' : 'globe'}: <b>${fmt(weightedMean(f, cells))}</b> ${escapeHtml(u)} · min ${fmt(mn)} · max ${fmt(mx)}`
      : '';
  }

  // ------------------------------------------------------------------ zonal mean
  function zonalValues() {
    const g = S.grid, f = S.field;
    const vals = new Float64Array(g.nlat);
    for (let i = 0; i < g.nlat; i++) {
      let s = 0, c = 0;
      for (let j = 0; j < g.nlon; j++) { const x = f[i * g.nlon + j]; if (x === x) { s += x; c++; } }
      vals[i] = c ? s / c : NaN;
    }
    return vals;
  }
  function drawZonal() {
    if (!S.field || !S.grid) { $('zonalChart').innerHTML = '<p class="muted">Load a gridded variable to see its zonal mean.</p>'; return; }
    const ln = attr(S.v, 'long_name') || baseName(S.vn);
    Charts.zonal($('zonalChart'), {
      title: `Zonal mean: ${cap(ln)}`, subtitle: `${S.fieldMeta.sub} · averaged around each latitude circle`,
      lat: Array.from(S.grid.lat), values: Array.from(zonalValues()), xLabel: S.fieldMeta.units,
      units: S.fieldMeta.units, zero: S.fieldMeta.kind !== 'abs',
    });
  }

  // ------------------------------------------------------------------ time series
  function tsSourceKey() { return $('tsSource').value; }
  async function seriesFor(source, my) {
    const key = `${S.vn}|${JSON.stringify(S.other)}|${S.unitIdx}|${source}|${source === 'point' && S.click ? S.click.i + ',' + S.click.j : ''}|${source === 'map' ? JSON.stringify(mapView.style.bbox) : ''}`;
    if (S.tsCache.has(key)) return S.tsCache.get(key);
    const t = S.time, v = S.v, n = t.n;
    let y;
    if (!S.grid) {
      // variable without lat/lon: read the whole thing along time
      const start = v.dims.map(d => (d === S.roles.time ? 0 : S.other[d] || 0));
      const count = v.dims.map(d => (d === S.roles.time ? n : 1));
      const raw = S.ds.read(S.vn, start, count); const un = unpacker();
      y = Float64Array.from(raw, un);
    } else if (source === 'point') {
      const g = S.grid; const { i, j } = S.click;
      const start = v.dims.map(d => (d === S.roles.time ? 0 : d === S.roles.lat ? g.latOrder[i] : d === S.roles.lon ? g.lonOrder[j] : S.other[d] || 0));
      const count = v.dims.map(d => (d === S.roles.time ? n : 1));
      const raw = S.ds.read(S.vn, start, count); const un = unpacker();
      y = Float64Array.from(raw, un);
    } else {
      const R = TS_REGIONS[source];
      const boxes = source === 'map' ? [mapView.style.bbox || [-180, 180, -90, 90]] : R.bboxes || [R.bbox];
      const cells = boxes.map(regionCells);
      if (cells.some(c => !c.idx.length)) throw new Error('This region is outside the data grid.');
      y = new Float64Array(n);
      for (let ti = 0; ti < n; ti++) {
        const f = readField(ti);
        const m = cells.map(c => weightedMean(f, c));
        y[ti] = m.length === 2 ? m[0] - m[1] : m[0];
        if (ti % 12 === 11) { setProgress(ti / n, `Area average: ${ti + 1} / ${n} time steps`); await nextFrame(); if (my !== tsToken) throw new Cancelled(); }
      }
      setProgress(null);
    }
    S.tsCache.set(key, y);
    return y;
  }
  function runningMean(y, w) {
    const out = new Float64Array(y.length).fill(NaN);
    const h = Math.floor(w / 2);
    for (let i = h; i < y.length - (w - h - 1); i++) {
      let s = 0, c = 0;
      for (let k = i - h; k < i - h + w; k++) if (isFinite(y[k])) { s += y[k]; c++; }
      if (c >= w * 0.8) out[i] = s / c;
    }
    return out;
  }
  function anomalyOf(y, steps, b0, b1) {
    // subtract the mean seasonal cycle (per calendar month) of the baseline period
    const sum = new Float64Array(13), cnt = new Float64Array(13);
    steps.forEach((s, i) => { if (s.y >= b0 && s.y <= b1 && isFinite(y[i])) { sum[s.m] += y[i]; cnt[s.m]++; } });
    if (!cnt.some(c => c > 0)) return null;
    return Float64Array.from(y, (v, i) => (cnt[steps[i].m] ? v - sum[steps[i].m] / cnt[steps[i].m] : NaN));
  }
  function windowFor(freq) { return { monthly: 12, daily: 365, subdaily: 365 * 4, weekly: 52, seasonal: 4, yearly: 5, multiyear: 5 }[freq] || 12; }

  let tsToken = 0;
  async function updateTimeSeries() {
    const my = ++tsToken;
    const box = $('tsChart');
    if (S.csv) return drawCSVSeries();
    if (!S.ds || !S.v) { box.innerHTML = '<p class="muted">Load a file first.</p>'; return; }
    if (!S.time || S.time.n < 2) { box.innerHTML = '<p class="muted">This variable has no time dimension, so there is no time series to show.</p>'; return; }
    const src = S.grid ? tsSourceKey() : 'whole';
    if (src === 'point' && !S.click) {
      box.innerHTML = '<p class="muted">Click anywhere on the map to see how the value at that point changes over time — or choose a region average above.</p>';
      mapView.setBox(null);
      return;
    }
    mapView.setBox(S.grid && src !== 'point' && src !== 'map' && TS_REGIONS[src].bbox && TS_REGIONS[src].bbox[1] - TS_REGIONS[src].bbox[0] < 360 ? TS_REGIONS[src].bbox : null);
    let y;
    try { y = await seriesFor(src, my); } catch (e) {
      setProgress(null);
      if (e instanceof Cancelled) return;
      box.innerHTML = `<p class="err">${escapeHtml(e.message)}</p>`; return;
    }
    if (my !== tsToken) return;
    const steps = S.time.steps;
    const where = src === 'point'
      ? `${MapView.latLabel(+S.grid.lat[S.click.i].toFixed(2))}, ${MapView.lonLabel(+S.grid.lon[S.click.j].toFixed(2))} (nearest grid point)`
      : src === 'whole' ? '' : TS_REGIONS[src].label;
    const ln = attr(S.v, 'long_name') || baseName(S.vn);
    plotSeries({ y, steps, title: `${cap(ln)}${where ? ' — ' + where : ''}`, units: units(), freq: S.time.freq, extraSub: levelText() });
  }

  function plotSeries({ y, steps, title, units: u, freq, extraSub }) {
    const showAnom = $('tsAnom').checked && steps[0].m !== undefined;
    let vals = y, sub = [];
    if (showAnom) {
      const yrs = [steps[0].y, steps[steps.length - 1].y];
      let b0 = S.b0 ?? yrs[0], b1 = S.b1 ?? yrs[1];
      const a = anomalyOf(y, steps, b0, b1);
      if (a) { vals = a; sub.push(`anomaly vs ${b0}–${b1} (seasonal cycle removed)`); }
    }
    if (extraSub) sub.push(extraSub);
    const style = $('tsStyle').value;
    const series = [{ name: style === 'bars' ? (showAnom ? 'Anomaly' : 'Value') : freq === 'monthly' ? 'Monthly values' : 'Values', y: Array.from(vals), color: style === 'line' && $('tsSmooth').checked ? Charts.COLORS.RAW : Charts.COLORS.SMOOTH, width: style === 'line' && $('tsSmooth').checked ? 1.2 : 1.6 }];
    if ($('tsSmooth').checked && style !== 'stripes') {
      const w = windowFor(freq);
      series.push({ name: `${w}-step running mean${freq === 'monthly' ? ' (12 months)' : ''}`, y: Array.from(runningMean(vals, w)), color: Charts.COLORS.SMOOTH, width: 2.2 });
    }
    S.lastSeries = { x: steps.map(s => s.dec), labels: steps.map(s => s.label), series, units: u, title };
    Charts.timeSeries($('tsChart'), {
      title, subtitle: sub.join(' · '), yLabel: u, x: S.lastSeries.x, labels: S.lastSeries.labels,
      series, style, trend: $('tsTrend').checked && style !== 'stripes', zero: showAnom, units: u,
    });
  }

  // ------------------------------------------------------------------ CSV time series
  function loadCSV(text, name) {
    const sep = text.indexOf('\t') >= 0 && text.indexOf(',') < 0 ? '\t' : ',';
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const rows = d3.dsvFormat(sep).parse(lines.join('\n'));
    const cols = rows.columns;
    if (!rows.length || cols.length < 2) return showError('CSV needs a header row, a date/year column and at least one numeric column.');
    const lc = cols.map(c => c.toLowerCase().trim());
    const yi = lc.indexOf('year'), mi = lc.indexOf('month');
    const steps = [];
    for (const r of rows) {
      let y, m = 1, d = 1;
      if (yi >= 0) { y = +r[cols[yi]]; if (mi >= 0) m = +r[cols[mi]] || 1; }
      else {
        const s = String(r[cols[0]]).trim();
        const mt = /^(-?\d{1,4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/.exec(s);
        if (mt) { y = +mt[1]; m = +mt[2]; d = +(mt[3] || 1); }
        else if (/^-?\d+(\.\d+)?$/.test(s)) { const f = +s; y = Math.floor(f); m = Math.min(12, Math.floor((f - y) * 12) + 1); }
      }
      steps.push(isFinite(y) ? { y, m, d, dec: y + (m - 1) / 12 + (d - 1) / 365, label: mi >= 0 || /-/.test(String(r[cols[0]])) ? `${MONTHS[m - 1]} ${y}` : `${y}` } : null);
    }
    const ok = steps.filter(Boolean).length;
    if (ok < 2) return showError('Could not read dates from the first column. Use YYYY-MM-DD, YYYY-MM, YYYY or decimal years (or columns named year and month).');
    const skip = new Set([yi, mi, yi < 0 ? 0 : -1]);
    const numCols = cols.filter((c, k) => !skip.has(k) && rows.some(r => isFinite(parseFloat(r[c]))));
    S.csv = { name, rows, cols: numCols, steps };
    const sel = $('csvCol'); sel.innerHTML = '';
    numCols.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    const ds = new Set(steps.filter(Boolean).map(s => s.y + '-' + s.m)).size;
    S.csv.freq = ds > ok * 0.9 && steps.some(s => s && s.m !== 1) ? 'monthly' : 'yearly';
    document.body.classList.add('loaded', 'csvmode', 'nomap');
    document.body.classList.remove('notime');
    $('fileInfo').innerHTML = `<b>${escapeHtml(name)}</b> · CSV · ${rows.length} rows · columns: ${escapeHtml(numCols.join(', '))}`;
    $('ncdump').textContent = `CSV file ${name}\ncolumns: ${cols.join(', ')}\nrows: ${rows.length}\n\nfirst rows:\n` + lines.slice(0, 8).join('\n');
    showTab('ts');
    drawCSVSeries();
  }
  function drawCSVSeries() {
    const c = S.csv; if (!c) return;
    const col = $('csvCol').value || c.cols[0];
    const keep = c.steps.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
    const steps = keep.map(i => c.steps[i]);
    const y = Float64Array.from(keep, i => { const v = parseFloat(c.rows[i][col]); return isFinite(v) ? v : NaN; });
    plotSeries({ y, steps, title: `${col} — ${c.name}`, units: '', freq: c.freq });
  }

  // ------------------------------------------------------------------ time controls
  function setupTimeControls() {
    const t = S.time;
    const has = t && t.n > 1;
    $('tslider').max = has ? t.n - 1 : 0;
    S.ti = has ? t.n - 1 : 0;
    // start on the most recent complete year's January for monthly data
    $('tslider').value = S.ti;
    updateTimeLabel();
    const okTime = t && t.ok;
    document.querySelectorAll('#mode button').forEach(b => { b.disabled = !okTime && b.dataset.mode !== 'single'; });
    if (!okTime) setMode('single');
    if (okTime) {
      const [ya, yb] = yearsOfData();
      S.y0 = Math.max(ya, yb - 29); S.y1 = yb - (t.steps[t.n - 1].m < 12 && t.freq === 'monthly' ? 1 : 0);
      if (S.y1 < S.y0) S.y1 = S.y0;
      // baseline: WMO 1991–2020 if available, else 1981–2010, else the first 30 years
      if (ya <= 1991 && yb >= 2020) { S.b0 = 1991; S.b1 = 2020; }
      else if (ya <= 1981 && yb >= 2010) { S.b0 = 1981; S.b1 = 2010; }
      else { S.b0 = ya; S.b1 = Math.min(yb, ya + 29); }
      for (const [id, val] of [['y0', S.y0], ['y1', S.y1], ['b0', S.b0], ['b1', S.b1]]) { const el = $(id); el.value = val; el.min = ya; el.max = yb; }
      $('yearsRange').textContent = `(data: ${ya}–${yb})`;
      const monthly = t.freq === 'monthly' || t.freq === 'daily' || t.freq === 'subdaily' || t.freq === 'weekly';
      $('monthBox').style.display = monthly ? '' : 'none';
    }
  }
  function updateTimeLabel() {
    const t = S.time;
    $('tlabel').textContent = t ? t.steps[S.ti].label : '—';
  }
  function setMode(m) {
    S.mode = m;
    document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    document.body.dataset.mode = m;
    $('modeHelp').innerHTML = {
      single: 'One time step (e.g. one month). Use the slider or ▶ to animate.',
      mean: 'Average over the chosen months and years — this is a <b>climatology</b> when you average many years.',
      trend: 'Change per decade from a straight-line fit through the yearly (or seasonal) means. Red = warming / increasing.',
      std: 'How much the value varies from one year to the next (standard deviation). Large where e.g. El Niño acts.',
    }[m];
    if (m === 'trend' || m === 'std') $('anom').checked = false, S.anom = false;
    document.body.classList.toggle('anom', S.anom);
  }

  // ------------------------------------------------------------------ playback
  function stopPlay() { S.playing = false; $('play').textContent = '▶ Play'; }
  async function play() {
    if (S.playing) return stopPlay();
    if (!S.time || S.time.n < 2) return;
    if ($('range').value !== 'manual') {
      $('range').value = 'manual'; document.body.classList.add('manualrange');
      toast('Colour range fixed so that the animation frames are comparable. Switch “Range” back to Auto any time.');
    }
    S.playing = true; $('play').textContent = '❚❚ Pause';
    const fps = +$('speed').value;
    while (S.playing) {
      const t0 = performance.now();
      S.ti = (S.ti + 1) % S.time.n;
      $('tslider').value = S.ti; updateTimeLabel();
      await computeMap();
      const wait = 1000 / fps - (performance.now() - t0);
      await new Promise(r => setTimeout(r, Math.max(0, wait)));
    }
  }

  // ------------------------------------------------------------------ file info (like ncdump -h)
  function renderFileInfo() {
    const ds = S.ds;
    const nVar = Object.keys(ds.vars).length;
    const title = ds.globalAttrs.title || ds.globalAttrs.source || '';
    $('fileInfo').innerHTML = `<b>${escapeHtml(ds.name)}</b> · ${ds.format} · ${nVar} variables${title ? '<br><span class="muted">' + escapeHtml(String(title).slice(0, 160)) + '</span>' : ''}`;
    const fa = v => (Array.isArray(v) ? v.map(fa).join(', ') : typeof v === 'string' ? `"${v}"` : String(+(+v).toPrecision(7)));
    let s = `netcdf ${ds.name} {   // ${ds.format}\ndimensions:\n`;
    for (const [d, n] of Object.entries(ds.dims)) s += `\t${d} = ${n}${ds.unlimited === d ? ' ; // (UNLIMITED)' : ' ;'}\n`;
    s += 'variables:\n';
    for (const [vn, v] of Object.entries(ds.vars)) {
      s += `\t${v.dtype} ${vn}(${v.dims.map(baseName).join(', ')}) ;\n`;
      for (const [k, a] of Object.entries(v.attrs)) s += `\t\t${baseName(vn)}:${k} = ${fa(a)} ;\n`;
    }
    s += '\n// global attributes:\n';
    for (const [k, a] of Object.entries(ds.globalAttrs)) s += `\t\t:${k} = ${fa(a)} ;\n`;
    s += '}\n';
    $('ncdump').textContent = s;
  }

  // ------------------------------------------------------------------ export & print
  async function composeFigure(scale = 2) {
    const W = mapView.W, H = mapView.H;
    const pad = 18, titleH = 50, cbH = 70, footH = 30;
    const c = document.createElement('canvas');
    c.width = (W + 2 * pad) * scale; c.height = (titleH + H + cbH + footH + pad) * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W + 2 * pad, titleH + H + cbH + footH + pad);
    ctx.fillStyle = '#1d2433'; ctx.font = '650 17px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText($('mapTitle').textContent, pad, 26);
    ctx.fillStyle = '#5b6474'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText($('mapSub').textContent, pad, 45);
    ctx.drawImage(mapView.cR, pad, titleH, W, H);
    ctx.save(); ctx.translate(pad, titleH); mapView.drawVectors(ctx); ctx.restore();
    const cbw = Math.min(620, W - 40);
    MapView.drawColorbar(ctx, pad + (W - cbw) / 2, titleH + H + 10, cbw, 16, mapView.style, S.fieldMeta.units, 12);
    ctx.fillStyle = '#7a8394'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    const src = S.ds.globalAttrs.title || S.ds.globalAttrs.source || '';
    ctx.fillText(`Data: ${S.fileName}${src ? ' — ' + String(src).slice(0, 90) : ''}`, pad, titleH + H + cbH + 16);
    ctx.textAlign = 'right';
    ctx.fillText('Climate Data Explorer', W + pad, titleH + H + cbH + 16);
    return c;
  }
  async function downloadMapPNG() {
    if (!S.field) return toast('Nothing to export yet.');
    const c = await composeFigure(2);
    c.toBlob(b => download(b, safe(`${baseName(S.vn)}_${S.fieldMeta.sub}`) + '.png'));
  }
  function downloadMapCSV() {
    if (!S.field) return;
    const g = S.grid; const f = S.field;
    const lines = [`# ${$('mapTitle').textContent}`, `# ${$('mapSub').textContent}`, 'lat,lon,value'];
    for (let i = 0; i < g.nlat; i++) for (let j = 0; j < g.nlon; j++) {
      const v = f[i * g.nlon + j];
      lines.push(`${+g.lat[i].toFixed(4)},${+g.lon[j].toFixed(4)},${isFinite(v) ? +v.toPrecision(6) : ''}`);
    }
    download(new Blob([lines.join('\n')], { type: 'text/csv' }), safe(`${baseName(S.vn)}_${S.fieldMeta.sub}`) + '.csv');
  }
  function downloadTSCSV() {
    const L = S.lastSeries; if (!L) return;
    const head = ['time', 'decimal_year', ...L.series.map(s => s.name.replace(/,/g, ''))];
    const lines = [`# ${L.title} (${L.units})`, head.join(',')];
    L.x.forEach((x, i) => lines.push([L.labels[i], x.toFixed(4), ...L.series.map(s => (isFinite(s.y[i]) ? +s.y[i].toPrecision(6) : ''))].join(',')));
    download(new Blob([lines.join('\n')], { type: 'text/csv' }), safe(L.title) + '.csv');
  }
  async function downloadSVG(el, name) {
    const svg = el.querySelector('svg'); if (!svg) return;
    const c = await Charts.svgToCanvas(svg, 2);
    c.toBlob(b => download(b, safe(name) + '.png'));
  }
  function downloadZonalCSV() {
    if (!S.field) return;
    const z = zonalValues();
    const lines = ['lat,zonal_mean'];
    S.grid.lat.forEach((la, i) => lines.push(`${+la.toFixed(4)},${isFinite(z[i]) ? +z[i].toPrecision(6) : ''}`));
    download(new Blob([lines.join('\n')], { type: 'text/csv' }), safe(`zonal_mean_${baseName(S.vn)}`) + '.csv');
  }
  async function printPage() {
    const area = $('printArea'); area.innerHTML = '';
    const add = (src, cls) => { const img = new Image(); img.src = src; if (cls) img.className = cls; area.appendChild(img); return new Promise(r => { img.onload = r; img.onerror = r; }); };
    const jobs = [];
    if (S.field && !document.body.classList.contains('nomap')) jobs.push(add((await composeFigure(2)).toDataURL('image/png')));
    const tsSvg = $('tsChart').querySelector('svg');
    if (tsSvg && $('printTS').checked) jobs.push(add((await Charts.svgToCanvas(tsSvg, 2)).toDataURL('image/png'), 'chartimg'));
    const zSvg = $('zonalChart').querySelector('svg');
    if (zSvg && $('printZonal').checked) jobs.push(add((await Charts.svgToCanvas(zSvg, 2)).toDataURL('image/png'), 'chartimg'));
    if (!jobs.length) return toast('Nothing to print yet — load a file first.');
    await Promise.all(jobs);
    window.print();
  }

  // ------------------------------------------------------------------ tabs
  function activeTab() { const b = document.querySelector('.tabs button.active'); return b ? b.dataset.tab : 'ts'; }
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'zonal') drawZonal();
    if (name === 'ts' && S.ds) updateTimeSeries();
  }

  // ------------------------------------------------------------------ update scheduling
  let updTimer = null;
  function update(delay = 0) {
    clearTimeout(updTimer);
    updTimer = setTimeout(() => computeMap(), delay);
  }

  // ------------------------------------------------------------------ wiring
  function init() {
    mapView = new MapView.View($('map'), {
      onHover: h => {
        const el = $('hover'), tip = $('maptip');
        if (!h) { el.textContent = ''; tip.style.display = 'none'; return; }
        const txt = `${MapView.latLabel(+h.lat.toFixed(2))}, ${MapView.lonLabel(+h.lon.toFixed(2))}`;
        const val = isFinite(h.value) ? `${fmt(h.value)} ${S.fieldMeta ? S.fieldMeta.units : ''}` : 'no data';
        el.textContent = `${txt}: ${val}`;
        tip.innerHTML = `${txt}<br><b>${escapeHtml(val)}</b>`;
        tip.style.display = 'block';
        const mw = $('map').clientWidth;
        tip.style.left = (h.x + 14 + 150 > mw ? h.x - 160 : h.x + 14) + 'px';
        tip.style.top = (h.y + 12) + 'px';
      },
      onClick: ({ lon, lat }) => {
        if (!S.grid) return;
        const g = mapView.grid;
        const i = Math.round(MapView.fracLat(g, lat));
        let j = Math.round(MapView.fracLon(g, lon));
        if (!isFinite(i) || !isFinite(j)) return;
        if (j >= S.grid.nlon) j = 0;
        S.click = { i, j, lon, lat };
        mapView.setMarker([S.grid.lon[j], S.grid.lat[i]]);
        $('tsSource').value = 'point';
        showTab('ts');
        $('tsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      onBox: bbox => {
        $('region').value = 'custom';
        ['bw', 'be', 'bs', 'bn'].forEach((id, k) => { $(id).value = bbox[k]; });
        document.body.classList.add('customregion');
        if ($('proj').value === 'ortho' || $('proj').value.endsWith('polar')) $('proj').value = 'robinson';
        drawMap();
        toast('Zoomed to the box you drew. Choose “Whole globe” under Region to zoom out.');
      },
    });

    // world outlines (coastlines & borders) from lib/world-data.js
    const W = window.WORLD_DATA;
    if (W) {
      mapView.setWorld({
        land110: topojson.feature(W.land110, W.land110.objects.land),
        land50: topojson.feature(W.land50, W.land50.objects.land),
        borders: W.borders,
      });
    } else toast('Could not load lib/world-data.js, so coastlines are unavailable.', 9000);

    // samples
    const ss = $('sample');
    SAMPLES.forEach(s => { const o = document.createElement('option'); o.value = s.file; o.textContent = s.label; ss.appendChild(o); });
    ss.onchange = () => { if (ss.value) loadSample(ss.value); };

    // file input & drag-and-drop
    $('file').onchange = e => { const f = e.target.files[0]; if (f) { ss.value = ''; loadFile(f); } e.target.value = ''; };
    const drop = $('drop');
    window.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    window.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
    window.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('over');
      const f = e.dataTransfer.files[0]; if (f) { ss.value = ''; loadFile(f); }
    });

    // variable, units
    $('var').onchange = e => selectVar(e.target.value);
    $('units').onchange = e => { S.unitIdx = +e.target.value; S.cache.clear(); S.tsCache.clear(); climCache.clear(); update(); if (activeTab() === 'ts') updateTimeSeries(); };

    // mode
    document.querySelectorAll('#mode button').forEach(b => { b.onclick = () => { stopPlay(); setMode(b.dataset.mode); update(); }; });
    setMode('single');
    $('tslider').oninput = e => { S.ti = +e.target.value; updateTimeLabel(); update(S.anom ? 120 : 10); };
    $('prev').onclick = () => { if (!S.time) return; S.ti = Math.max(0, S.ti - 1); $('tslider').value = S.ti; updateTimeLabel(); update(); };
    $('next').onclick = () => { if (!S.time) return; S.ti = Math.min(S.time.n - 1, S.ti + 1); $('tslider').value = S.ti; updateTimeLabel(); update(); };
    $('play').onclick = play;

    // months
    const mb = $('months');
    MONTHS.forEach((m, k) => {
      const b = document.createElement('button'); b.textContent = m[0]; b.title = m; b.dataset.m = k + 1;
      b.onclick = () => { if (S.months.has(k + 1) && S.months.size > 1) S.months.delete(k + 1); else S.months.add(k + 1); syncMonths(); update(300); };
      mb.appendChild(b);
    });
    const PRE = { Annual: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], DJF: [12, 1, 2], MAM: [3, 4, 5], JJA: [6, 7, 8], SON: [9, 10, 11], 'JJAS (monsoon)': [6, 7, 8, 9] };
    const pb = $('presets');
    for (const [k, ms] of Object.entries(PRE)) {
      const b = document.createElement('button'); b.textContent = k;
      b.onclick = () => { S.months = new Set(ms); syncMonths(); update(); };
      pb.appendChild(b);
    }
    function syncMonths() {
      mb.querySelectorAll('button').forEach(b => b.classList.toggle('on', S.months.has(+b.dataset.m)));
      $('monthsLabel').textContent = monthsLabel(S.months);
    }
    syncMonths();
    for (const id of ['y0', 'y1', 'b0', 'b1']) $(id).onchange = e => { S[id] = parseInt(e.target.value, 10); update(); if (id[0] === 'b' && activeTab() === 'ts') updateTimeSeries(); };
    $('anom').onchange = e => {
      S.anom = e.target.checked; document.body.classList.toggle('anom', S.anom);
      if (S.anom && S.mode !== 'single' && S.mode !== 'mean') setMode('mean');
      update();
    };

    // map style
    const rs = $('region');
    for (const [k, r] of Object.entries(MapView.REGIONS)) { const o = document.createElement('option'); o.value = k; o.textContent = r.label; rs.appendChild(o); }
    const oc = document.createElement('option'); oc.value = 'custom'; oc.textContent = 'Custom box…'; rs.appendChild(oc);
    rs.onchange = () => {
      document.body.classList.toggle('customregion', rs.value === 'custom');
      const r = MapView.REGIONS[rs.value];
      if (r && r.bbox && r.bbox[1] > 180) $('center').value = '180';
      if (r && r.bbox) ['bw', 'be', 'bs', 'bn'].forEach((id, k) => { $(id).value = r.bbox[k]; });
      if (r && !r.bbox && !r.projection && ($('proj').value.endsWith('polar'))) $('proj').value = 'robinson';
      if (r && r.projection) $('proj').value = r.projection;
      drawMap();
    };
    const cs = $('cmap');
    Colormaps.list.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; cs.appendChild(o); });
    cs.onchange = () => { S.cmapAuto = false; drawMap(); };
    $('range').onchange = e => { document.body.classList.toggle('manualrange', e.target.value === 'manual'); drawMap(); };
    for (const id of ['proj', 'center', 'reverse', 'levels', 'smooth', 'coast', 'borders', 'gridlines', 'contours', 'bw', 'be', 'bs', 'bn']) {
      $(id).addEventListener('change', () => drawMap());
    }
    for (const id of ['vmin', 'vmax']) $(id).addEventListener('change', () => { $('range').value = 'manual'; drawMap(); });

    // time series controls
    const ts = $('tsSource');
    for (const [k, r] of Object.entries(TS_REGIONS)) { const o = document.createElement('option'); o.value = k; o.textContent = r.label; ts.appendChild(o); }
    for (const id of ['tsSource', 'tsAnom', 'tsSmooth', 'tsTrend', 'tsStyle']) $(id).onchange = () => updateTimeSeries();
    $('csvCol').onchange = drawCSVSeries;
    $('tsCSV').onclick = downloadTSCSV;
    $('tsPNG').onclick = () => downloadSVG($('tsChart'), S.lastSeries ? S.lastSeries.title : 'timeseries');
    $('zCSV').onclick = downloadZonalCSV;
    $('zPNG').onclick = () => downloadSVG($('zonalChart'), 'zonal_mean');

    document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
    $('btnPng').onclick = downloadMapPNG;
    $('btnCsv').onclick = downloadMapCSV;
    $('btnPrint').onclick = printPage;
    $('btnGuide').onclick = () => { showTab('guide'); $('tsPanel').scrollIntoView({ behavior: 'smooth' }); };

    let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { drawColorbarEl(); if (activeTab() === 'ts' && (S.ds || S.csv)) updateTimeSeries(); if (activeTab() === 'zonal') drawZonal(); }, 250); });

    mapView.layout(); mapView.render();
    // ?sample=N or ?file=URL lets a workshop link open straight into a dataset
    const qp = new URLSearchParams(location.search);
    if (qp.get('file')) loadSample(qp.get('file'));
    else if (qp.get('sample')) { const s = SAMPLES[+qp.get('sample')]; if (s) { ss.value = s.file; loadSample(s.file); } }
  }

  window.addEventListener('DOMContentLoaded', init);
  window.ClimateApp = { S, selectVar, loadSample };
})();
