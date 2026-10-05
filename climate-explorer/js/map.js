/* map.js — draws a lat/lon grid on a map projection.
 *
 * Two stacked canvases: a raster layer (the data, coloured, plus contour lines) and an
 * overlay layer (coastlines, borders, grid lines, labels, markers) that also takes the
 * mouse. The grid must be "canonical": latitude ascending, longitude ascending within
 * [lon0, lon0+360). The field is a Float32Array of nlat*nlon (row = latitude), NaN = missing.
 */
const MapView = (() => {
  'use strict';
  const RAD = Math.PI / 180;
  const MISSING_COLOR = [208, 208, 208];

  const REGIONS = {
    global: { label: 'Whole globe', bbox: null },
    south_asia: { label: 'South Asia / India', bbox: [60, 100, 0, 40] },
    indian_ocean: { label: 'Indian Ocean', bbox: [30, 120, -40, 30] },
    tropical_pacific: { label: 'Tropical Pacific (El Niño)', bbox: [120, 290, -30, 30] },
    east_asia: { label: 'East Asia', bbox: [90, 150, 5, 55] },
    maritime: { label: 'Southeast Asia / Maritime Continent', bbox: [90, 160, -15, 25] },
    europe: { label: 'Europe', bbox: [-15, 45, 32, 72] },
    africa: { label: 'Africa', bbox: [-20, 55, -37, 38] },
    north_america: { label: 'North America', bbox: [-170, -50, 10, 75] },
    south_america: { label: 'South America', bbox: [-85, -30, -57, 15] },
    australia: { label: 'Australia', bbox: [105, 180, -50, 0] },
    north_atlantic: { label: 'North Atlantic', bbox: [-80, 0, 0, 70] },
    arctic: { label: 'Arctic (polar view)', bbox: null, projection: 'npolar' },
    antarctic: { label: 'Antarctic (polar view)', bbox: null, projection: 'spolar' },
  };

  // ------------------------------------------------------------ grid helpers
  function makeGrid(lat, lon) {
    const nlat = lat.length, nlon = lon.length;
    const off = new Float64Array(nlon);
    for (let j = 0; j < nlon; j++) off[j] = lon[j] - lon[0];
    const dLast = nlon > 1 ? off[nlon - 1] - off[nlon - 2] : 360;
    const dFirst = nlon > 1 ? off[1] - off[0] : 360;
    const global = nlon > 1 && off[nlon - 1] + dLast * 1.5 >= 360;
    const latLo = nlat > 1 ? Math.max(-90, lat[0] - (lat[1] - lat[0]) / 2) : lat[0] - 1;
    const latHi = nlat > 1 ? Math.min(90, lat[nlat - 1] + (lat[nlat - 1] - lat[nlat - 2]) / 2) : lat[0] + 1;
    // allow filling right up to the pole when the first/last row is within one cell of it
    const lo = latLo - (lat[0] - latLo) <= -90 + 1e-6 ? -90 : latLo;
    const hi = latHi + (latHi - lat[nlat - 1]) >= 90 - 1e-6 ? 90 : latHi;
    return { lat, lon, nlat, nlon, off, global, dLast, dFirst, latLo: lo, latHi: hi };
  }
  function fracLat(g, phi) {
    const lat = g.lat, n = g.nlat;
    if (!(phi >= g.latLo && phi <= g.latHi)) return NaN;
    if (n === 1 || phi <= lat[0]) return 0;
    if (phi >= lat[n - 1]) return n - 1;
    let a = 0, b = n - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (lat[m] <= phi) a = m; else b = m; }
    return a + (phi - lat[a]) / (lat[b] - lat[a]);
  }
  function fracLon(g, lam) {
    const n = g.nlon, off = g.off;
    let x = (lam - g.lon[0]) % 360; if (x < 0) x += 360;
    if (n === 1) return x < 0.5 * g.dLast || 360 - x < 0.5 * g.dLast ? 0 : NaN;
    if (x <= off[n - 1]) {
      let a = 0, b = n - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (off[m] <= x) a = m; else b = m; }
      return a + (x - off[a]) / (off[b] - off[a]);
    }
    if (g.global) return (n - 1) + (x - off[n - 1]) / (360 - off[n - 1]);
    if (x - off[n - 1] <= g.dLast / 2) return n - 1;
    if (360 - x <= g.dFirst / 2) return 0;
    return NaN;
  }
  function latAt(g, fi) {
    const i0 = Math.min(Math.floor(fi), g.nlat - 1), i1 = Math.min(i0 + 1, g.nlat - 1);
    return g.lat[i0] + (fi - i0) * (g.lat[i1] - g.lat[i0]);
  }
  function lonAt(g, fj) {
    const n = g.nlon;
    const j0 = Math.floor(fj);
    if (j0 >= n - 1) return g.lon[n - 1] + (fj - (n - 1)) * (360 - g.off[n - 1]);
    return g.lon[j0] + (fj - j0) * (g.lon[j0 + 1] - g.lon[j0]);
  }
  function sampleNearest(g, field, fi, fj) {
    const i = Math.round(fi); let j = Math.round(fj); if (j >= g.nlon) j = g.global ? 0 : g.nlon - 1;
    return field[i * g.nlon + j];
  }
  function sampleBilinear(g, field, fi, fj) {
    const n = g.nlon;
    const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, g.nlat - 1), ti = fi - i0;
    let j0 = Math.floor(fj), tj = fj - j0;
    if (j0 >= n) j0 = n - 1;
    let j1 = j0 + 1; if (j1 >= n) j1 = g.global ? 0 : n - 1;
    const a = field[i0 * n + j0], b = field[i0 * n + j1], c = field[i1 * n + j0], d = field[i1 * n + j1];
    if (a !== a || b !== b || c !== c || d !== d) return sampleNearest(g, field, fi, fj);
    return (a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti;
  }

  // ------------------------------------------------------------ contours (marching squares)
  function contourPaths(g, field, levels) {
    const out = [];
    const { nlat, nlon } = g;
    const ncol = g.global ? nlon : nlon - 1;
    for (const L of levels) {
      const seg = [];
      for (let i = 0; i < nlat - 1; i++) {
        for (let j = 0; j < ncol; j++) {
          const jj = j + 1 === nlon ? 0 : j + 1;
          const v0 = field[i * nlon + j], v1 = field[i * nlon + jj], v2 = field[(i + 1) * nlon + jj], v3 = field[(i + 1) * nlon + j];
          if (v0 !== v0 || v1 !== v1 || v2 !== v2 || v3 !== v3) continue;
          const code = (v0 > L) | ((v1 > L) << 1) | ((v2 > L) << 2) | ((v3 > L) << 3);
          if (code === 0 || code === 15) continue;
          const e = k => {
            if (k === 0) return [i, j + (L - v0) / (v1 - v0)];
            if (k === 1) return [i + (L - v1) / (v2 - v1), j + 1];
            if (k === 2) return [i + 1, j + (L - v3) / (v2 - v3)];
            return [i + (L - v0) / (v3 - v0), j];
          };
          const add = (a, b) => { const p = e(a), q = e(b); seg.push(p[0], p[1], q[0], q[1]); };
          switch (code) {
            case 1: case 14: add(3, 0); break;
            case 2: case 13: add(0, 1); break;
            case 3: case 12: add(3, 1); break;
            case 4: case 11: add(1, 2); break;
            case 6: case 9: add(0, 2); break;
            case 7: case 8: add(3, 2); break;
            case 5: { const c = (v0 + v1 + v2 + v3) / 4 > L; if (c) { add(3, 2); add(0, 1); } else { add(3, 0); add(1, 2); } break; }
            case 10: { const c = (v0 + v1 + v2 + v3) / 4 > L; if (c) { add(3, 0); add(1, 2); } else { add(3, 2); add(0, 1); } break; }
          }
        }
      }
      out.push({ level: L, seg });
    }
    return out;
  }

  // ------------------------------------------------------------ colour bar
  function niceTicks(vmin, vmax, n) { return d3.ticks(vmin, vmax, n).filter(t => t >= vmin - 1e-9 && t <= vmax + 1e-9); }
  function fmt(v) {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
    return d3.format('~r')(+v.toPrecision(4));
  }

  /** Draw a horizontal colour bar with end triangles into ctx at (x,y,w,h). */
  function drawColorbar(ctx, x, y, w, h, st, label, fontPx) {
    const fs = fontPx || 12;
    const tri = h * 0.9;
    const bx = x + tri, bw = w - 2 * tri;
    const levels = st.levels > 0 ? st.levels : 0;
    const col = t => Colormaps.css(st.cmap, st.reverse, t);
    if (levels) {
      for (let k = 0; k < levels; k++) {
        ctx.fillStyle = col(levels === 1 ? 0.5 : k / (levels - 1));
        ctx.fillRect(bx + (k * bw) / levels, y, bw / levels + 0.5, h);
      }
    } else {
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      for (let k = 0; k <= 20; k++) grad.addColorStop(k / 20, col(k / 20));
      ctx.fillStyle = grad; ctx.fillRect(bx, y, bw, h);
    }
    // extension triangles (values beyond the range get the end colours)
    ctx.fillStyle = col(0);
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(bx, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col(1);
    ctx.beginPath(); ctx.moveTo(bx + bw, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(bx + bw, y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(bx, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(bx, y + h); ctx.lineTo(bx + bw, y + h);
    ctx.lineTo(x + w, y + h / 2); ctx.lineTo(bx + bw, y); ctx.closePath(); ctx.stroke();
    // ticks
    const { vmin, vmax } = st;
    let ticks;
    if (levels && levels <= 14) ticks = d3.range(levels + 1).map(k => vmin + (k * (vmax - vmin)) / levels);
    else ticks = niceTicks(vmin, vmax, Math.max(3, Math.floor(bw / (fs * 6))));
    ctx.fillStyle = '#222'; ctx.font = `${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let lastX = -1e9;
    for (const t of ticks) {
      const tx = bx + ((t - vmin) / (vmax - vmin)) * bw;
      ctx.beginPath(); ctx.moveTo(tx, y + h); ctx.lineTo(tx, y + h + 4); ctx.stroke();
      const s = fmt(t); const tw = ctx.measureText(s).width;
      if (tx - tw / 2 > lastX + 4) { ctx.fillText(s, tx, y + h + 6); lastX = tx + tw / 2; }
    }
    if (label) { ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.fillText(label, x + w / 2, y + h + 8 + fs * 1.3); }
  }

  // ------------------------------------------------------------ the view
  class View {
    constructor(el, cb) {
      this.el = el; this.cb = cb || {};
      el.classList.add('mapview');
      this.cR = document.createElement('canvas');
      this.cO = document.createElement('canvas');
      this.cO.className = 'overlay';
      this.band = document.createElement('div'); this.band.className = 'band';
      el.append(this.cR, this.cO, this.band);
      this.off = document.createElement('canvas');
      this.style = {
        projection: 'robinson', region: 'global', bbox: null, center: 0,
        cmap: 'viridis', reverse: false, vmin: 0, vmax: 1, levels: 0, smooth: true,
        coast: true, borders: false, grid: true, contours: false,
      };
      this.rot = null; this.grid = null; this.field = null; this.world = null;
      this.marker = null; this.box = null; this.lowres = false;
      this._bindEvents();
      let lastW = 0;
      new ResizeObserver(() => {
        const w = this.el.clientWidth;
        if (Math.abs(w - lastW) > 2) { lastW = w; this.layout(); this.render(); }
      }).observe(el);
    }

    setWorld(w) { this.world = w; this.drawOverlay(); }
    setGrid(lat, lon) { this.grid = makeGrid(lat, lon); this.lutKey = null; }
    setField(f) { this.field = f; }
    setStyle(s) {
      const geo = ['projection', 'region', 'bbox', 'center'];
      const changed = geo.some(k => k in s && JSON.stringify(s[k]) !== JSON.stringify(this.style[k]));
      Object.assign(this.style, s);
      if (changed) { this.rot = null; this.layout(); }
    }
    setMarker(ll) { this.marker = ll; this.drawOverlay(); }
    setBox(b) { this.box = b; this.drawOverlay(); }

    kind() {
      const s = this.style;
      if (s.bbox && (s.projection === 'robinson' || s.projection === 'mollweide')) return 'equirect';
      return s.projection;
    }

    // ---- geometry
    layout() {
      const s = this.style;
      const W = Math.max(280, this.el.clientWidth);
      const maxH = Math.max(300, Math.min(680, window.innerHeight * 0.72));
      const kind = this.kind();
      let H, proj, rect = null, ext = null;
      const sphere = { type: 'Sphere' };
      if (kind === 'equirect') {
        const m = { l: 44, r: 14, t: 8, b: 24 };
        let [w0, e0, s0, n0] = s.bbox || [s.center - 180, s.center + 180, -90, 90];
        let dlon = e0 - w0; if (dlon <= 0) dlon += 360;
        const dlat = n0 - s0;
        let iw = W - m.l - m.r, ih = (iw * dlat) / dlon;
        if (ih > maxH) { ih = maxH; iw = (ih * dlon) / dlat; }
        const ox = m.l + (W - m.l - m.r - iw) / 2;
        const clon = w0 + dlon / 2, latc = (s0 + n0) / 2;
        const k = iw / (dlon * RAD);
        proj = d3.geoEquirectangular().rotate([-clon, 0]).scale(k)
          .translate([ox + iw / 2, m.t + ih / 2 + k * latc * RAD])
          .clipExtent([[ox, m.t], [ox + iw, m.t + ih]]);
        rect = { x: ox, y: m.t, w: iw, h: ih };
        ext = { w0, e0: w0 + dlon, s0, n0, clon, latc };
        H = Math.ceil(ih + m.t + m.b);
      } else if (kind === 'robinson' || kind === 'mollweide') {
        const aspect = kind === 'robinson' ? 0.5072 : 0.5;
        let iw = W - 12, ih = iw * aspect;
        if (ih > maxH) { ih = maxH; iw = ih / aspect; }
        const ox = (W - iw) / 2;
        proj = (kind === 'robinson' ? d3.geoRobinson() : d3.geoMollweide()).rotate([-s.center, 0])
          .fitExtent([[ox, 6], [ox + iw, 6 + ih]], sphere);
        H = Math.ceil(ih + 12);
      } else {
        const size = Math.min(W - 12, maxH, 620);
        const ox = (W - size) / 2;
        if (kind === 'ortho') {
          if (!this.rot) {
            const b = s.bbox;
            this.rot = b ? [-(b[0] + ((b[1] - b[0] + 360) % 360 || 360) / 2), -(b[2] + b[3]) / 2, 0] : [-(s.center || 80), -15, 0];
          }
          proj = d3.geoOrthographic().rotate(this.rot).clipAngle(90);
        } else {
          proj = d3.geoStereographic().rotate(kind === 'npolar' ? [0, -90, 0] : [0, 90, 0]).clipAngle(65);
        }
        proj.fitExtent([[ox, 6], [ox + size, 6 + size]], sphere);
        H = Math.ceil(size + 12);
      }
      this.W = W; this.H = H; this.proj = proj; this.rect = rect; this.ext = ext; this._kind = kind;
      const dpr = window.devicePixelRatio || 1;
      for (const c of [this.cR, this.cO]) {
        c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
        c.style.width = W + 'px'; c.style.height = H + 'px';
      }
      this.el.style.height = H + 'px';
      this.dpr = dpr;
      this.lutKey = null;
    }

    visible(ll) {
      const k = this._kind;
      if (k === 'ortho') return d3.geoDistance(ll, [-this.rot[0], -this.rot[1]]) < Math.PI / 2 - 1e-6;
      if (k === 'npolar') return d3.geoDistance(ll, [0, 90]) < 65 * RAD;
      if (k === 'spolar') return d3.geoDistance(ll, [0, -90]) < 65 * RAD;
      return true;
    }
    /** screen (css px) -> [lon,lat] or null when outside the map */
    invert(x, y) {
      if (!this.proj) return null;
      if (this.rect) {
        const r = this.rect;
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return null;
      }
      const ll = this.proj.invert([x, y]);
      if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
      if (!this.rect) {
        if (!this.visible(ll)) return null;
        const p = this.proj(ll);
        if (!p || Math.abs(p[0] - x) > 0.75 || Math.abs(p[1] - y) > 0.75) return null;
      }
      return ll;
    }

    // per-pixel lookup table: fractional grid indices for every raster pixel
    buildLUT() {
      const rs = this.rasterScale();
      const rw = Math.max(1, Math.round(this.W * rs)), rh = Math.max(1, Math.round(this.H * rs));
      const key = [rw, rh, this._kind, JSON.stringify(this.rot), JSON.stringify(this.style.bbox), this.style.center, this.W].join('|');
      if (this.lutKey === key && this.lut) return;
      const g = this.grid;
      const n = rw * rh;
      const fi = new Float32Array(n).fill(NaN), fj = new Float32Array(n).fill(NaN);
      const inside = new Uint8Array(n);
      for (let py = 0; py < rh; py++) {
        const y = (py + 0.5) / rs;
        for (let px = 0; px < rw; px++) {
          const x = (px + 0.5) / rs;
          const ll = this.invert(x, y);
          if (!ll) continue;
          const k = py * rw + px;
          inside[k] = 1;
          const a = fracLat(g, ll[1]); if (a !== a) continue;
          const b = fracLon(g, ll[0]); if (b !== b) continue;
          fi[k] = a; fj[k] = b;
        }
      }
      this.lut = { rw, rh, fi, fj, inside };
      this.lutKey = key;
    }
    rasterScale() {
      const dpr = this.dpr || 1;
      if (this.lowres) return 0.5;
      let rs = Math.min(dpr, 2);
      const maxPix = 2.4e6;
      if (this.W * this.H * rs * rs > maxPix) rs = Math.sqrt(maxPix / (this.W * this.H));
      return rs;
    }

    render() {
      if (!this.proj) this.layout();
      this.drawRaster();
      this.drawOverlay();
    }

    drawRaster() {
      const ctx = this.cR.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cR.width, this.cR.height);
      if (!this.grid || !this.field) { this._drawEmpty(ctx); return; }
      this.buildLUT();
      const { rw, rh, fi, fj, inside } = this.lut;
      const st = this.style, g = this.grid, field = this.field;
      const nl = st.levels > 0 ? st.levels : 0;
      const lut = Colormaps.lut(st.cmap, st.reverse, nl);
      const ncol = nl || 256;
      const vmin = st.vmin, span = st.vmax - st.vmin || 1;
      this.off.width = rw; this.off.height = rh;
      const octx = this.off.getContext('2d');
      const img = octx.createImageData(rw, rh);
      const px = img.data;
      const sample = st.smooth ? sampleBilinear : sampleNearest;
      for (let k = 0; k < rw * rh; k++) {
        if (!inside[k]) continue;
        const o = k * 4;
        const a = fi[k];
        let v = NaN;
        if (a === a) v = sample(g, field, a, fj[k]);
        if (v !== v) { px[o] = MISSING_COLOR[0]; px[o + 1] = MISSING_COLOR[1]; px[o + 2] = MISSING_COLOR[2]; px[o + 3] = 255; continue; }
        let t = (v - vmin) / span; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const c = (nl ? Math.min(nl - 1, Math.floor(t * nl)) : Math.round(t * 255)) * 4;
        px[o] = lut[c]; px[o + 1] = lut[c + 1]; px[o + 2] = lut[c + 2]; px[o + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.off, 0, 0, this.cR.width, this.cR.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (st.contours) this._drawContours(ctx);
    }

    contourLevels() {
      const st = this.style;
      if (st.levels > 0) return d3.range(1, st.levels).map(k => st.vmin + (k * (st.vmax - st.vmin)) / st.levels);
      return niceTicks(st.vmin, st.vmax, 12);
    }
    _drawContours(ctx) {
      const g = this.grid;
      const paths = contourPaths(g, this.field, this.contourLevels());
      const proj = this.proj, maxJump = this.W / 4;
      ctx.save();
      if (this.rect) { ctx.beginPath(); ctx.rect(this.rect.x, this.rect.y, this.rect.w, this.rect.h); ctx.clip(); }
      for (const { level, seg } of paths) {
        ctx.beginPath();
        for (let s = 0; s < seg.length; s += 4) {
          const l1 = [lonAt(g, seg[s + 1]), latAt(g, seg[s])], l2 = [lonAt(g, seg[s + 3]), latAt(g, seg[s + 2])];
          if (!this.visible(l1) || !this.visible(l2)) continue;
          const p = proj(l1), q = proj(l2);
          if (!p || !q || Math.abs(p[0] - q[0]) > maxJump) continue;
          ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
        }
        ctx.strokeStyle = 'rgba(20,20,20,0.75)';
        ctx.lineWidth = Math.abs(level) < 1e-9 ? 1.6 : 0.7;
        ctx.setLineDash(level < 0 ? [3, 2] : []);
        ctx.stroke();
      }
      ctx.restore();
    }
    _drawEmpty(ctx) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const path = d3.geoPath(this.proj, ctx);
      ctx.beginPath();
      if (this.rect) ctx.rect(this.rect.x, this.rect.y, this.rect.w, this.rect.h); else path({ type: 'Sphere' });
      ctx.fillStyle = '#eef2f6'; ctx.fill();
    }

    drawOverlay() {
      if (!this.proj) return;
      const ctx = this.cO.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cO.width, this.cO.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawVectors(ctx);
    }

    /** Coastlines, borders, graticule, frame, labels, marker — also used for export. */
    drawVectors(ctx) {
      const st = this.style, proj = this.proj;
      const path = d3.geoPath(proj, ctx);
      const w = this.world;
      const span = this.ext ? this.ext.e0 - this.ext.w0 : 360;
      if (st.grid) {
        const step = this.gridStep(span);
        ctx.beginPath();
        path(d3.geoGraticule().step([step, step]).extent([[-180, -90 + 1e-6], [180, 90 - 1e-6]])());
        ctx.strokeStyle = 'rgba(40,40,40,0.28)'; ctx.lineWidth = 0.6; ctx.stroke();
      }
      if (w && st.borders && w.borders) {
        ctx.beginPath(); path(w.borders);
        ctx.strokeStyle = 'rgba(15,15,15,0.8)'; ctx.lineWidth = span < 60 ? 1 : 0.7; ctx.stroke();
      }
      if (w && st.coast) {
        const land = (span < 120 || this._kind === 'ortho') && w.land50 ? w.land50 : (w.land110 || w.land50);
        ctx.beginPath(); path(land);
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = span < 60 ? 1 : 0.8; ctx.stroke();
      }
      if (this.box) {
        const [b0, b1, b2, b3] = this.box;
        let e = b1; if (e <= b0) e += 360;
        const ring = [];
        for (let x = b0; x <= e; x += (e - b0) / 40) ring.push([x, b2]);
        for (let y = b2; y <= b3; y += (b3 - b2) / 20) ring.push([e, y]);
        for (let x = e; x >= b0; x -= (e - b0) / 40) ring.push([x, b3]);
        for (let y = b3; y >= b2; y -= (b3 - b2) / 20) ring.push([b0, y]);
        ring.push([b0, b2]);
        ctx.beginPath(); path({ type: 'LineString', coordinates: ring });
        ctx.setLineDash([5, 3]); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.setLineDash([5, 3]); ctx.lineDashOffset = 5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      // frame
      ctx.beginPath();
      if (this.rect) ctx.rect(this.rect.x, this.rect.y, this.rect.w, this.rect.h); else path({ type: 'Sphere' });
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
      if (this.rect && st.grid) this._drawTicks(ctx);
      if (this.marker && this.visible(this.marker)) {
        const p = proj(this.marker);
        if (p && (!this.rect || (p[0] >= this.rect.x && p[0] <= this.rect.x + this.rect.w))) {
          ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 2 * Math.PI);
          ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.lineWidth = 1.8; ctx.strokeStyle = '#000'; ctx.stroke();
        }
      }
    }
    gridStep(span) {
      for (const s of [1, 2, 5, 10, 15, 20, 30, 60]) if (span / s <= 9) return s;
      return 60;
    }
    _drawTicks(ctx) {
      const e = this.ext, r = this.rect, proj = this.proj;
      const step = this.gridStep(e.e0 - e.w0);
      ctx.fillStyle = '#333'; ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let v = Math.ceil(e.w0 / step) * step; v <= e.e0 + 1e-9; v += step) {
        const p = proj([v, e.latc]); if (!p) continue;
        ctx.fillText(lonLabel(v), p[0], r.y + r.h + 5);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = Math.ceil(e.s0 / step) * step; v <= e.n0 + 1e-9; v += step) {
        const p = proj([e.clon, v]); if (!p) continue;
        ctx.fillText(latLabel(v), r.x - 5, p[1]);
      }
    }

    /** value at lon/lat (nearest grid cell) */
    valueAt(ll) {
      if (!this.grid || !this.field) return NaN;
      const a = fracLat(this.grid, ll[1]), b = fracLon(this.grid, ll[0]);
      if (a !== a || b !== b) return NaN;
      return sampleNearest(this.grid, this.field, a, b);
    }

    // ---- mouse
    _bindEvents() {
      const c = this.cO;
      let down = null;
      const pos = ev => { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
      c.addEventListener('pointerdown', ev => {
        down = { p: pos(ev), rot: this.rot && this.rot.slice(), moved: false };
        if (this.cb.onHover) this.cb.onHover(null);
        c.setPointerCapture(ev.pointerId);
      });
      c.addEventListener('pointermove', ev => {
        const p = pos(ev);
        if (down) {
          const dx = p[0] - down.p[0], dy = p[1] - down.p[1];
          if (!down.moved && Math.hypot(dx, dy) > 5) down.moved = true;
          if (down.moved) {
            if (this._kind === 'ortho') {
              const k = 75 / this.proj.scale();
              this.rot = [down.rot[0] + dx * k * 1.2, Math.max(-90, Math.min(90, down.rot[1] - dy * k * 1.2)), 0];
              this.proj.rotate(this.rot);
              this.lowres = true; this.lutKey = null; this.render();
            } else if (this._kind === 'equirect' || this._kind === 'robinson' || this._kind === 'mollweide') {
              const b = this.band;
              b.style.display = 'block';
              b.style.left = Math.min(p[0], down.p[0]) + 'px'; b.style.top = Math.min(p[1], down.p[1]) + 'px';
              b.style.width = Math.abs(dx) + 'px'; b.style.height = Math.abs(dy) + 'px';
            }
            return;
          }
        }
        const ll = this.invert(p[0], p[1]);
        if (this.cb.onHover) this.cb.onHover(ll ? { lon: ll[0], lat: ll[1], value: this.valueAt(ll), x: p[0], y: p[1] } : null);
      });
      c.addEventListener('pointerleave', () => { if (!down && this.cb.onHover) this.cb.onHover(null); });
      c.addEventListener('pointerup', ev => {
        if (!down) return;
        const p = pos(ev);
        const d = down; down = null;
        this.band.style.display = 'none';
        if (!d.moved) {
          const ll = this.invert(p[0], p[1]);
          if (ll && this.cb.onClick) this.cb.onClick({ lon: ll[0], lat: ll[1] });
          return;
        }
        if (this._kind === 'ortho') { this.lowres = false; this.lutKey = null; this.render(); return; }
        if (this.cb.onBox && Math.abs(p[0] - d.p[0]) > 12 && Math.abs(p[1] - d.p[1]) > 12) {
          // sample the box edges to find its lon/lat extent
          const x0 = Math.min(p[0], d.p[0]), x1 = Math.max(p[0], d.p[0]);
          const y0 = Math.min(p[1], d.p[1]), y1 = Math.max(p[1], d.p[1]);
          const lls = [];
          for (let k = 0; k <= 20; k++) for (const [x, y] of [[x0 + (k / 20) * (x1 - x0), y0], [x0 + (k / 20) * (x1 - x0), y1], [x0, y0 + (k / 20) * (y1 - y0)], [x1, y0 + (k / 20) * (y1 - y0)]]) {
            const ll = this.proj.invert([x, y]); if (ll && isFinite(ll[0]) && isFinite(ll[1])) lls.push(ll);
          }
          if (lls.length < 4) return;
          const cx = this.proj.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
          const c0 = cx ? cx[0] : 0;
          const rel = lls.map(l => ((l[0] - c0 + 540) % 360) - 180);
          const w = c0 + Math.min(...rel), e = c0 + Math.max(...rel);
          const s = Math.max(-90, Math.min(...lls.map(l => l[1]))), n = Math.min(90, Math.max(...lls.map(l => l[1])));
          this.cb.onBox([+w.toFixed(1), +e.toFixed(1), +s.toFixed(1), +n.toFixed(1)]);
        }
      });
    }
  }

  function lonLabel(v) {
    let x = ((v + 180) % 360 + 360) % 360 - 180;
    x = +x.toFixed(2);
    if (x === 0) return '0°';
    if (Math.abs(x) === 180) return '180°';
    return Math.abs(x) + '°' + (x > 0 ? 'E' : 'W');
  }
  function latLabel(v) { v = +v.toFixed(2); return v === 0 ? 'EQ' : Math.abs(v) + '°' + (v > 0 ? 'N' : 'S'); }

  return { View, REGIONS, drawColorbar, lonLabel, latLabel, fmt, makeGrid, fracLat, fracLon };
})();
