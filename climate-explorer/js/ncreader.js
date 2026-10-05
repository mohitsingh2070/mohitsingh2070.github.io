/* ncreader.js — open NetCDF files in the browser.
 *
 *   NetCDF-3 (classic, 64-bit offset, CDF-5) : parsed here, no dependencies.
 *   NetCDF-4 / HDF5                          : via h5wasm (lib/h5wasm.js, loaded on demand).
 *
 * Both return the same object:
 *   { format, name, globalAttrs, dims:{name:len}, vars:{name:{name,dims,shape,attrs,dtype}},
 *     read(varName, start[], count[]) -> Float64Array, close() }
 */
const NCReader = (() => {
  'use strict';

  // ---------------------------------------------------------------- helpers
  function detectFormat(buf) {
    const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    const s = String.fromCharCode(...b);
    if (s.startsWith('CDF')) return 'netcdf3';
    if (s.startsWith('\x89HDF')) return 'hdf5';
    if (s.startsWith('GRIB')) return 'grib';
    // HDF5 may start after a user block of 512, 1024, ... bytes
    for (let off = 512; off < Math.min(buf.byteLength, 65536); off *= 2) {
      const c = new Uint8Array(buf, off, 4);
      if (c[0] === 0x89 && c[1] === 0x48 && c[2] === 0x44 && c[3] === 0x46) return 'hdf5';
    }
    return 'unknown';
  }

  async function open(buf, name) {
    const fmt = detectFormat(buf);
    if (fmt === 'netcdf3') return openNetCDF3(buf, name);
    if (fmt === 'hdf5') return openHDF5(buf, name);
    if (fmt === 'grib') throw new Error('This is a GRIB file. Convert it to NetCDF first, e.g.  cdo -f nc copy in.grib out.nc  (or select "NetCDF" as the format when downloading from the Copernicus CDS).');
    throw new Error('Not a NetCDF file (unrecognised header). Supported: NetCDF-3 and NetCDF-4 (.nc, .nc4, .h5).');
  }

  // ---------------------------------------------------------------- NetCDF-3
  const NC3_TYPES = {
    1: { t: 'byte', size: 1, get: (v, o) => v.getInt8(o) },
    2: { t: 'char', size: 1, get: (v, o) => v.getUint8(o) },
    3: { t: 'short', size: 2, get: (v, o) => v.getInt16(o, false) },
    4: { t: 'int', size: 4, get: (v, o) => v.getInt32(o, false) },
    5: { t: 'float', size: 4, get: (v, o) => v.getFloat32(o, false) },
    6: { t: 'double', size: 8, get: (v, o) => v.getFloat64(o, false) },
    7: { t: 'ubyte', size: 1, get: (v, o) => v.getUint8(o) },
    8: { t: 'ushort', size: 2, get: (v, o) => v.getUint16(o, false) },
    9: { t: 'uint', size: 4, get: (v, o) => v.getUint32(o, false) },
    10: { t: 'int64', size: 8, get: (v, o) => Number(v.getBigInt64(o, false)) },
    11: { t: 'uint64', size: 8, get: (v, o) => Number(v.getBigUint64(o, false)) },
  };

  function openNetCDF3(buf, name) {
    const view = new DataView(buf);
    const version = view.getUint8(3); // 1 classic, 2 64-bit offset, 5 64-bit data
    if (![1, 2, 5].includes(version)) throw new Error('Unknown NetCDF-3 version ' + version);
    let p = 4;
    const u32 = () => { const x = view.getUint32(p, false); p += 4; return x; };
    const u64 = () => { const x = Number(view.getBigUint64(p, false)); p += 8; return x; };
    const count = version === 5 ? u64 : u32;          // NON_NEG
    const offset = version === 1 ? u32 : u64;          // OFFSET
    const pad4 = n => (4 - (n % 4)) % 4;
    const str = () => {
      const n = count();
      const s = new TextDecoder().decode(new Uint8Array(buf, p, n));
      p += n + pad4(n);
      return s;
    };
    const attrList = () => {
      const tag = u32(); const n = count();
      const out = {};
      if (tag === 0 && n === 0) return out;
      for (let i = 0; i < n; i++) {
        const an = str(); const type = u32(); const len = count();
        const T = NC3_TYPES[type];
        if (!T) throw new Error('Bad attribute type ' + type);
        if (type === 2) {
          out[an] = new TextDecoder().decode(new Uint8Array(buf, p, len)).replace(/\0+$/, '');
        } else {
          const vals = [];
          for (let k = 0; k < len; k++) vals.push(T.get(view, p + k * T.size));
          out[an] = vals.length === 1 ? vals[0] : vals;
        }
        const nb = len * T.size; p += nb + pad4(nb);
      }
      return out;
    };

    let numrecs = count();
    // dimensions
    const dimNames = [], dimLens = [];
    let recDim = -1;
    { const tag = u32(); const n = count();
      if (!(tag === 0 && n === 0)) for (let i = 0; i < n; i++) {
        const dn = str(); const len = count();
        if (len === 0) recDim = i;
        dimNames.push(dn); dimLens.push(len);
      } }
    const globalAttrs = attrList();
    // variables
    const vars = {}; const recVars = [];
    { const tag = u32(); const n = count();
      if (!(tag === 0 && n === 0)) for (let i = 0; i < n; i++) {
        const vn = str(); const nd = count(); const dimids = [];
        for (let k = 0; k < nd; k++) dimids.push(count());
        const attrs = attrList(); const type = u32(); const vsize = count(); const begin = offset();
        const T = NC3_TYPES[type];
        const isRec = nd > 0 && dimids[0] === recDim;
        vars[vn] = { name: vn, dimids, attrs, type, T, dtype: T ? T.t : '?', vsize, begin, isRec };
        if (isRec) recVars.push(vn);
      } }
    // record size (special case: a single record variable is not padded)
    let recSize = 0;
    for (const vn of recVars) recSize += vars[vn].vsize;
    if (recVars.length === 1) {
      const v = vars[recVars[0]];
      recSize = v.dimids.slice(1).reduce((a, d) => a * dimLens[d], 1) * v.T.size;
    }
    if (numrecs === 0xFFFFFFFF && recSize > 0) { // streaming: infer from file length
      const first = Math.min(...recVars.map(vn => vars[vn].begin));
      numrecs = Math.floor((buf.byteLength - first) / recSize);
    }
    const dims = {};
    dimNames.forEach((d, i) => { dims[d] = i === recDim ? numrecs : dimLens[i]; });
    for (const vn in vars) {
      const v = vars[vn];
      v.dims = v.dimids.map(i => dimNames[i]);
      v.shape = v.dims.map(d => dims[d]);
    }

    function read(vn, start, cnt) {
      const v = vars[vn];
      if (!v) throw new Error('No variable ' + vn);
      if (!v.T) throw new Error('Unsupported type in ' + vn);
      const nd = v.shape.length;
      start = start || v.shape.map(() => 0);
      cnt = cnt || v.shape.slice();
      const total = cnt.reduce((a, b) => a * b, 1);
      const out = new Float64Array(total);
      if (total === 0) return out;
      if (nd === 0) { out[0] = v.T.get(view, v.begin); return out; }
      // element strides (inside one record for record vars)
      const strides = new Array(nd).fill(1);
      for (let k = nd - 2; k >= 0; k--) strides[k] = strides[k + 1] * (v.isRec && k + 1 === 0 ? 1 : v.shape[k + 1]);
      const es = v.T.size, get = v.T.get;
      let o = 0;
      const idx = new Array(nd).fill(0);
      const last = nd - 1;
      const runLen = cnt[last];
      while (true) {
        // byte offset of idx (with last index = start[last])
        let byte = v.begin;
        let elem = 0;
        for (let k = 0; k < nd; k++) {
          const i = start[k] + idx[k];
          if (k === 0 && v.isRec) byte += i * recSize;
          else elem += i * strides[k];
        }
        if (nd === 1 && v.isRec) {
          // 1-D record variable: each element sits in its own record
          for (let r = 0; r < runLen; r++) out[o++] = get(view, v.begin + (start[0] + r) * recSize);
        } else {
          byte += elem * es;
          for (let r = 0; r < runLen; r++) out[o++] = get(view, byte + r * es);
        }
        // advance idx over all but the last dimension
        let k = last - 1;
        while (k >= 0) { idx[k]++; if (idx[k] < cnt[k]) break; idx[k] = 0; k--; }
        if (k < 0) break;
      }
      return out;
    }

    const pub = {};
    for (const vn in vars) {
      const v = vars[vn];
      pub[vn] = { name: vn, dims: v.dims, shape: v.shape, attrs: v.attrs, dtype: v.dtype, isChar: v.type === 2 };
    }
    return {
      format: { 1: 'NetCDF-3 classic', 2: 'NetCDF-3 64-bit offset', 5: 'NetCDF-3 CDF-5' }[version],
      name, globalAttrs, dims, unlimited: recDim >= 0 ? dimNames[recDim] : null,
      vars: pub, read, close() {},
    };
  }

  // ---------------------------------------------------------------- NetCDF-4 / HDF5
  let h5Promise = null;
  function loadH5wasm() {
    if (h5Promise) return h5Promise;
    h5Promise = new Promise((resolve, reject) => {
      if (window.h5wasm) return resolve(window.h5wasm);
      const s = document.createElement('script');
      s.src = 'lib/h5wasm.js';
      s.onload = () => resolve(window.h5wasm);
      s.onerror = () => { h5Promise = null; reject(new Error('Could not load lib/h5wasm.js (needed for NetCDF-4 files).')); };
      document.head.appendChild(s);
    }).then(async h5 => { const Module = await h5.ready; return { h5, Module }; });
    return h5Promise;
  }

  const HIDDEN_ATTRS = new Set(['DIMENSION_LIST', 'REFERENCE_LIST', 'CLASS', 'NAME', '_Netcdf4Dimid',
    '_Netcdf4Coordinates', '_nc3_strict', '_NCProperties', '_SuperblockVersion', '_IsNetcdf4']);

  function attrValue(a) {
    let v;
    try { v = a.value; } catch (e) { return undefined; }
    if (v === null || v === undefined) return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'string') return v.replace(/\0+$/, '');
    if (ArrayBuffer.isView(v) || Array.isArray(v)) {
      const arr = Array.from(v, x => (typeof x === 'bigint' ? Number(x) : x));
      return arr.length === 1 ? arr[0] : arr;
    }
    return v;
  }
  function readAttrs(obj) {
    const out = {};
    let attrs;
    try { attrs = obj.attrs; } catch (e) { return out; }
    for (const k of Object.keys(attrs)) {
      if (HIDDEN_ATTRS.has(k)) continue;
      const v = attrValue(attrs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  function rawAttr(obj, key) {
    try { const a = obj.attrs[key]; return a ? attrValue(a) : undefined; } catch (e) { return undefined; }
  }

  let fileCounter = 0;
  async function openHDF5(buf, name) {
    const { h5, Module } = await loadH5wasm();
    const FS = Module.FS;
    try { FS.mkdir('/work'); } catch (e) { /* exists */ }
    const path = `/work/f${++fileCounter}.h5`;
    FS.writeFile(path, new Uint8Array(buf));
    const f = new h5.File(path, 'r');

    const dsets = {}; // name -> h5 Dataset
    const walk = (grp, prefix) => {
      for (const k of grp.keys()) {
        let obj;
        try { obj = grp.get(k); } catch (e) { continue; }
        if (!obj) continue;
        const full = prefix ? prefix + '/' + k : k;
        if (obj instanceof h5.Group) walk(obj, full);
        else if (obj instanceof h5.Dataset) dsets[full] = obj;
      }
    };
    walk(f, '');

    const dims = {}; const vars = {}; const phony = new Set();
    for (const [vn, ds] of Object.entries(dsets)) {
      const shape = ds.shape || [];
      const nameAttr = rawAttr(ds, 'NAME');
      const isDimOnly = typeof nameAttr === 'string' && nameAttr.startsWith('This is a netCDF dimension but not a netCDF variable');
      const isScale = rawAttr(ds, 'CLASS') === 'DIMENSION_SCALE';
      if (isScale && shape.length === 1) dims[vn.split('/').pop()] = shape[0];
      if (isDimOnly) phony.add(vn);
    }
    for (const [vn, ds] of Object.entries(dsets)) {
      if (phony.has(vn)) continue;
      const shape = ds.shape || [];
      const isScale = rawAttr(ds, 'CLASS') === 'DIMENSION_SCALE';
      const dnames = [];
      for (let i = 0; i < shape.length; i++) {
        let dn = null;
        if (isScale && shape.length === 1) dn = vn.split('/').pop();
        if (!dn) {
          try {
            const sc = ds.get_attached_scales(i);
            if (sc && sc.length) dn = sc[0].split('/').pop();
          } catch (e) { /* no scales */ }
        }
        if (!dn) { // fall back: a dimension with the same length, else synthetic
          const match = Object.keys(dims).filter(d => dims[d] === shape[i]);
          dn = match.length === 1 ? match[0] : `dim${i}_${shape[i]}`;
          if (!(dn in dims)) dims[dn] = shape[i];
        }
        dnames.push(dn);
      }
      let dtype = '?', isChar = false;
      try {
        const dt = ds.dtype;
        const names = { f: 'float', d: 'double', b: 'byte', B: 'ubyte', h: 'short', H: 'ushort', i: 'int', I: 'uint', q: 'int64', Q: 'uint64' };
        dtype = typeof dt === 'string' ? (names[dt.replace(/^[<>=|]/, '')] || dt) : 'compound';
        isChar = typeof dt !== 'string' || /^[<>=|]?[SU]/.test(dt);
      } catch (e) { /* ignore */ }
      vars[vn] = { name: vn, dims: dnames, shape, attrs: readAttrs(ds), dtype, isChar };
    }

    function read(vn, start, cnt) {
      const ds = dsets[vn];
      if (!ds) throw new Error('No variable ' + vn);
      const shape = ds.shape || [];
      let raw;
      if (shape.length === 0) raw = ds.value;
      else {
        start = start || shape.map(() => 0);
        cnt = cnt || shape.slice();
        raw = ds.slice(start.map((s, k) => [s, s + cnt[k]]));
      }
      if (typeof raw === 'number' || typeof raw === 'bigint') return Float64Array.of(Number(raw));
      if (raw instanceof BigInt64Array || raw instanceof BigUint64Array) return Float64Array.from(raw, Number);
      if (ArrayBuffer.isView(raw)) return new Float64Array(raw);
      if (Array.isArray(raw)) return Float64Array.from(raw.flat(Infinity), Number);
      throw new Error('Cannot read ' + vn + ' as numbers');
    }

    return {
      format: 'NetCDF-4 / HDF5', name, globalAttrs: readAttrs(f), dims, unlimited: null, vars, read,
      close() { try { f.close(); FS.unlink(path); } catch (e) { /* ignore */ } },
    };
  }

  return { open, detectFormat, loadH5wasm };
})();
