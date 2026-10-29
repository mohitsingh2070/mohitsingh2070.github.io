/* charts.js — small d3 charts: time series (line / +- bars / warming stripes) and zonal mean.
 * All styling is set as SVG attributes so the SVG can be exported to PNG as-is. */
const Charts = (() => {
  'use strict';
  const INK = '#1d2433', MUTED = '#5b6474', GRID = '#e3e7ee';
  const RAW = '#7f9cc7', SMOOTH = '#1f4e9a', TREND = '#b23b2e', POS = '#c4473a', NEG = '#3b6fb6';
  const fmt = v => MapView.fmt(v);

  function linreg(x, y) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < x.length; i++) {
      if (!isFinite(y[i])) continue;
      n++; sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i];
    }
    if (n < 3) return null;
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { slope, intercept: (sy - slope * sx) / n, n };
  }

  function baseSvg(el, height) {
    el.innerHTML = '';
    const W = Math.max(320, el.clientWidth);
    const svg = d3.select(el).append('svg')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('width', W).attr('height', height).attr('viewBox', `0 0 ${W} ${height}`)
      .attr('font-family', 'system-ui, -apple-system, Segoe UI, sans-serif').attr('font-size', 12);
    svg.append('rect').attr('width', W).attr('height', height).attr('fill', '#fff');
    return { svg, W };
  }
  function styleAxis(g) {
    g.selectAll('path').attr('stroke', MUTED);
    g.selectAll('line').attr('stroke', MUTED);
    g.selectAll('text').attr('fill', MUTED).attr('font-size', 11);
  }
  function tooltip(el) {
    let tip = el.querySelector('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; el.appendChild(tip); }
    tip.style.display = 'none';
    return tip;
  }

  /** Calendar-aware time axis: years, months, days or hours depending on the visible span. */
  function timeAxis(svg, xs, dom, y0, cal, W) {
    const [r0, r1] = xs.range();
    const t = CFTime.ticks(dom[0], dom[1], r1 - r0, cal);
    const g = svg.append('g').attr('class', 'xaxis');
    g.append('line').attr('x1', r0).attr('x2', r1).attr('y1', y0).attr('y2', y0).attr('stroke', MUTED);
    for (const v of t.minor) g.append('line').attr('x1', xs(v)).attr('x2', xs(v)).attr('y1', y0).attr('y2', y0 + 3).attr('stroke', MUTED);
    let lastRight = -Infinity;
    for (const tk of t.major) {
      const px = xs(tk.v);
      g.append('line').attr('x1', px).attr('x2', px).attr('y1', y0).attr('y2', y0 + 6).attr('stroke', MUTED);
      const txt = g.append('text').attr('x', px).attr('y', y0 + 19).attr('text-anchor', 'middle').attr('fill', MUTED).attr('font-size', 11).text(tk.label);
      const w = txt.node().getComputedTextLength() || tk.label.length * 6.3;
      // never let labels touch: drop any that would overlap the previous one or run off the edge
      if (px - w / 2 < lastRight + 10 || px + w / 2 > W - 2) txt.remove(); else lastRight = px + w / 2;
    }
    return t;
  }

  function trendScale(spanYears) {
    if (spanYears >= 10) return [10, 'per decade'];
    if (spanYears >= 1) return [1, 'per year'];
    if (spanYears >= 2 / 365.25) return [1 / 365.25, 'per day'];
    return [1 / 8766, 'per hour'];
  }

  /**
   * opts: { title, subtitle, yLabel, x:[decimal years, ascending], labels:[str], parts:[{y,m,d,H}], calendar,
   *         series:[{name,y,color,width,dash}], style:'line'|'bars'|'stripes', trend, zero, units,
   *         weights:[w] (optional, for averaging into stripes), domain:[d0,d1] (zoom), onZoom(fn) }
   */
  function timeSeries(el, opts) {
    const H = opts.height || 340;
    const { svg, W } = baseSvg(el, H);
    const m = { l: 62, r: 18, t: 54, b: opts.style === 'stripes' ? 52 : 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = opts.x, cal = opts.calendar || 'standard';
    svg.append('text').attr('x', m.l).attr('y', 20).attr('font-weight', 650).attr('font-size', 14).attr('fill', INK).text(opts.title || '');
    if (opts.subtitle) svg.append('text').attr('x', m.l).attr('y', 37).attr('fill', MUTED).attr('font-size', 12).text(opts.subtitle);

    const full = d3.extent(x);
    let dom = opts.domain ? [Math.max(full[0], opts.domain[0]), Math.min(full[1], opts.domain[1])] : full.slice();
    if (!(dom[1] > dom[0])) dom = full[1] > full[0] ? full.slice() : [full[0] - 0.5, full[0] + 0.5];
    const xs = d3.scaleLinear().domain(dom).range([m.l, m.l + iw]);
    const lo = d3.bisectLeft(x, dom[0]), hi = d3.bisectRight(x, dom[1]); // visible indices [lo, hi)
    const a0 = Math.max(0, lo - 1), a1 = Math.min(x.length, hi + 1);       // plus one point each side for lines
    const clipId = 'clip' + Math.random().toString(36).slice(2, 9);
    svg.append('defs').append('clipPath').attr('id', clipId).append('rect')
      .attr('x', m.l).attr('y', m.t - 4).attr('width', iw).attr('height', ih + 8);
    const tip = tooltip(el);

    if (opts.style === 'stripes') {
      const span = dom[1] - dom[0];
      const unit = span >= 3 ? 'year' : span >= 0.25 ? 'month' : 'day';
      const P = opts.parts, yv = opts.series[0].y, wts = opts.weights;
      const buckets = new Map();
      for (let i = 0; i < x.length; i++) {
        if (!isFinite(yv[i])) continue;
        const p = P[i];
        const key = unit === 'year' ? p.y : unit === 'month' ? p.y * 12 + p.m - 1 : (p.y * 12 + p.m - 1) * 32 + p.d;
        let b = buckets.get(key);
        if (!b) { b = { p, s: 0, c: 0, n: 0 }; buckets.set(key, b); }
        const w = wts ? wts[i] : 1;
        b.s += yv[i] * w; b.c += w; b.n++;
      }
      // leave out incomplete years/months/days (e.g. a year with only 5 months of data)
      const typical = d3.median([...buckets.values()], b => b.n) || 1;
      const bars = [...buckets.values()].filter(b => b.n >= 0.8 * typical).map(b => {
        const p = b.p, mon = CFTime.MONTHS[p.m - 1];
        let s, e, label;
        if (unit === 'year') { s = CFTime.toDec(p.y, 1, 1, 0, cal); e = CFTime.toDec(p.y + 1, 1, 1, 0, cal); label = `${p.y}`; }
        else if (unit === 'month') { s = CFTime.toDec(p.y, p.m, 1, 0, cal); e = p.m === 12 ? CFTime.toDec(p.y + 1, 1, 1, 0, cal) : CFTime.toDec(p.y, p.m + 1, 1, 0, cal); label = `${mon} ${p.y}`; }
        else {
          s = CFTime.toDec(p.y, p.m, p.d, 0, cal);
          const last = p.d >= CFTime.daysInMonth(p.y, p.m, CFTime.normCalendar(cal));
          e = last ? (p.m === 12 ? CFTime.toDec(p.y + 1, 1, 1, 0, cal) : CFTime.toDec(p.y, p.m + 1, 1, 0, cal)) : CFTime.toDec(p.y, p.m, p.d + 1, 0, cal);
          label = `${p.d} ${mon} ${p.y}`;
        }
        return { s, e, v: b.s / b.c, label };
      }).filter(b => b.e > dom[0] && b.s < dom[1]);
      if (!bars.length) { svg.append('text').attr('x', m.l).attr('y', m.t + 20).attr('fill', MUTED).text('Not enough complete periods to draw stripes.'); return { svg: svg.node() }; }
      const mean = opts.zero ? 0 : d3.mean(bars, b => b.v);
      const amp = d3.max(bars, b => Math.abs(b.v - mean)) || 1;
      const g = svg.append('g').attr('clip-path', `url(#${clipId})`);
      g.selectAll('rect').data(bars).join('rect')
        .attr('x', b => xs(b.s)).attr('y', m.t).attr('width', b => Math.max(0.5, xs(b.e) - xs(b.s) + 0.4)).attr('height', ih)
        .attr('fill', b => d3.interpolateRdBu(0.5 - (b.v - mean) / amp / 2))
        .on('pointermove', (ev, b) => { tip.style.display = 'block'; tip.innerHTML = `<b>${b.label}</b><br>${fmt(b.v)} ${opts.units || ''}`; placeTip(el, tip, ev); })
        .on('pointerleave', () => { tip.style.display = 'none'; });
      timeAxis(svg, xs, dom, m.t + ih, cal, W);
      svg.append('text').attr('x', m.l + iw).attr('y', H - 4).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11)
        .text(`Each stripe = one ${unit}. Blue = below ${opts.zero ? 'the baseline' : 'average'}, red = above (colour scale ±${fmt(amp)} ${opts.units || ''})`);
      addZoom(svg, xs, x, m, iw, ih, opts, null);
      return { svg: svg.node() };
    }

    // y range from the visible part only, so zooming in also rescales the values
    const vis = [];
    for (const s of opts.series) for (let i = lo; i < hi; i++) if (isFinite(s.y[i])) vis.push(s.y[i]);
    if (opts.zero) vis.push(0);
    let [y0, y1] = d3.extent(vis);
    if (y0 === undefined) { y0 = 0; y1 = 1; }
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const ys = d3.scaleLinear().domain([y0, y1]).nice().range([m.t + ih, m.t]);
    svg.append('g').selectAll('line').data(ys.ticks(6)).join('line')
      .attr('x1', m.l).attr('x2', m.l + iw).attr('y1', d => ys(d)).attr('y2', d => ys(d)).attr('stroke', GRID);
    timeAxis(svg, xs, dom, m.t + ih, cal, W);
    styleAxis(svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(ys).ticks(6).tickFormat(fmt)));
    svg.append('text').attr('transform', `translate(16,${m.t + ih / 2}) rotate(-90)`).attr('text-anchor', 'middle')
      .attr('fill', MUTED).attr('font-size', 12).text(opts.yLabel || '');
    if (opts.zero && ys.domain()[0] < 0 && ys.domain()[1] > 0) svg.append('line').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', ys(0)).attr('y2', ys(0)).attr('stroke', INK).attr('stroke-width', 1);

    const plot = svg.append('g').attr('clip-path', `url(#${clipId})`);
    if (opts.style === 'bars') {
      const s = opts.series[0];
      const n = Math.max(1, hi - lo);
      const bw = Math.max(0.6, iw / n - (iw / n > 4 ? 1 : 0));
      const base = opts.zero ? 0 : d3.mean(s.y.slice(lo, hi).filter(isFinite));
      const data = [];
      for (let i = lo; i < hi; i++) if (isFinite(s.y[i])) data.push([x[i], s.y[i]]);
      plot.selectAll('rect').data(data).join('rect')
        .attr('x', d => xs(d[0]) - bw / 2).attr('width', bw)
        .attr('y', d => ys(Math.max(d[1], base))).attr('height', d => Math.abs(ys(d[1]) - ys(base)))
        .attr('fill', d => (d[1] >= base ? POS : NEG));
      opts.series.slice(1).forEach(s2 => drawLine(plot, x, s2, xs, ys, a0, a1));
    } else {
      opts.series.forEach(s => drawLine(plot, x, s, xs, ys, a0, a1));
    }
    let trendText = '';
    if (opts.trend) {
      const r = linreg(x.slice(lo, hi), opts.series[0].y.slice(lo, hi));
      if (r) {
        plot.append('line').attr('x1', xs(dom[0])).attr('x2', xs(dom[1]))
          .attr('y1', ys(r.intercept + r.slope * dom[0])).attr('y2', ys(r.intercept + r.slope * dom[1]))
          .attr('stroke', TREND).attr('stroke-width', 2).attr('stroke-dasharray', '6 4');
        const [k, per] = trendScale(x[hi - 1] - x[lo]);
        const v = r.slope * k;
        trendText = `Trend: ${v >= 0 ? '+' : ''}${fmt(v)} ${opts.units || ''} ${per}`;
      }
    }
    // legend (only when there is more than one thing to tell apart)
    const items = opts.series.map(s => ({ name: s.name, color: s.color, dash: s.dash, bars: opts.style === 'bars' && s === opts.series[0] }));
    if (trendText) items.push({ name: trendText, color: TREND, dash: '6 4' });
    if (items.length > 1) {
      let lx = m.l + iw;
      const lg = svg.append('g');
      for (let k = items.length - 1; k >= 0; k--) {
        const it = items[k];
        const t = lg.append('text').attr('y', 37).attr('fill', INK).attr('font-size', 11).text(it.name);
        const tw = t.node().getComputedTextLength() || it.name.length * 6;
        lx -= tw; t.attr('x', lx);
        if (it.bars) {
          lg.append('rect').attr('x', lx - 22).attr('y', 30).attr('width', 7).attr('height', 9).attr('fill', POS);
          lg.append('rect').attr('x', lx - 13).attr('y', 30).attr('width', 7).attr('height', 9).attr('fill', NEG);
        } else {
          lg.append('line').attr('x1', lx - 24).attr('x2', lx - 6).attr('y1', 33).attr('y2', 33).attr('stroke', it.color).attr('stroke-width', 2.2).attr('stroke-dasharray', it.dash || null);
        }
        lx -= 36;
      }
    }

    // hover crosshair + tooltip (on top of the zoom brush)
    const cross = svg.append('line').attr('y1', m.t).attr('y2', m.t + ih).attr('stroke', MUTED).attr('stroke-width', 1).attr('display', 'none').attr('pointer-events', 'none');
    const dots = opts.series.map(s => svg.append('circle').attr('r', 4).attr('fill', s.color).attr('stroke', '#fff').attr('stroke-width', 2).attr('display', 'none').attr('pointer-events', 'none'));
    const bis = d3.bisector(d => d).center;
    const hover = {
      move(ev) {
        const [mx] = d3.pointer(ev, svg.node());
        let i = bis(x, xs.invert(mx));
        i = Math.max(lo, Math.min(hi - 1, i));
        if (i < 0 || i >= x.length) return;
        cross.attr('display', null).attr('x1', xs(x[i])).attr('x2', xs(x[i]));
        let html = `<b>${opts.labels ? opts.labels[i] : x[i].toFixed(3)}</b>`;
        opts.series.forEach((s, k) => {
          const v = s.y[i];
          if (isFinite(v)) dots[k].attr('display', null).attr('cx', xs(x[i])).attr('cy', ys(v)); else dots[k].attr('display', 'none');
          html += `<br><span class="sw" style="background:${s.color}"></span>${s.name}: <b>${isFinite(v) ? fmt(v) : '–'}</b> ${opts.units || ''}`;
        });
        tip.innerHTML = html; tip.style.display = 'block';
        placeTip(el, tip, ev);
      },
      leave() { tip.style.display = 'none'; cross.attr('display', 'none'); dots.forEach(d => d.attr('display', 'none')); },
    };
    addZoom(svg, xs, x, m, iw, ih, opts, hover);
    return { svg: svg.node() };
  }

  /** Drag across the plot to zoom into that time range; double-click to zoom out again. */
  function addZoom(svg, xs, x, m, iw, ih, opts, hover) {
    let target;
    if (opts.onZoom) {
      const brush = d3.brushX().extent([[m.l, m.t], [m.l + iw, m.t + ih]]).on('end', ev => {
        if (!ev.selection || !ev.sourceEvent) return;
        const [a, b] = ev.selection.map(xs.invert);
        const n = d3.bisectRight(x, b) - d3.bisectLeft(x, a);
        if (n >= 3) opts.onZoom([a, b]); else target.call(brush.move, null);
      });
      target = svg.append('g').attr('class', 'brush').call(brush);
      target.select('.overlay').attr('fill', 'none').attr('cursor', 'crosshair');
      target.select('.selection').attr('fill', '#2f5fa7').attr('fill-opacity', 0.15).attr('stroke', '#2f5fa7');
      target.on('dblclick', () => opts.onZoom(null));
    } else {
      target = svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', iw).attr('height', ih).attr('fill', 'transparent');
    }
    if (hover) target.on('pointermove.tip', hover.move).on('pointerleave.tip', hover.leave);
  }

  function drawLine(g, x, s, xs, ys, a0 = 0, a1 = x.length) {
    const pts = [];
    for (let i = a0; i < a1; i++) pts.push([x[i], s.y[i]]);
    const line = d3.line().defined(d => isFinite(d[1])).x(d => xs(d[0])).y(d => ys(d[1]));
    g.append('path').datum(pts).attr('d', line).attr('fill', 'none')
      .attr('stroke', s.color).attr('stroke-width', s.width || 1.5).attr('stroke-dasharray', s.dash || null)
      .attr('stroke-linejoin', 'round');
  }

  function placeTip(el, tip, ev) {
    const r = el.getBoundingClientRect();
    let left = ev.clientX - r.left + 14, top = ev.clientY - r.top + 10;
    if (left + tip.offsetWidth > r.width) left = ev.clientX - r.left - tip.offsetWidth - 14;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }

  /** Zonal mean: latitude on the vertical axis, value on the horizontal axis. */
  function zonal(el, opts) {
    const H = opts.height || 340;
    const { svg, W } = baseSvg(el, H);
    const m = { l: 56, r: 24, t: 48, b: 42 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    svg.append('text').attr('x', m.l).attr('y', 20).attr('font-weight', 650).attr('font-size', 14).attr('fill', INK).text(opts.title || '');
    if (opts.subtitle) svg.append('text').attr('x', m.l).attr('y', 37).attr('fill', MUTED).attr('font-size', 12).text(opts.subtitle);
    const pts = opts.lat.map((la, i) => [opts.values[i], la]).filter(d => isFinite(d[0]));
    if (!pts.length) return;
    let [x0, x1] = d3.extent(pts, d => d[0]);
    if (opts.zero) { x0 = Math.min(x0, 0); x1 = Math.max(x1, 0); }
    if (x0 === x1) { x0 -= 1; x1 += 1; }
    const xs = d3.scaleLinear().domain([x0, x1]).nice().range([m.l, m.l + iw]);
    const ys = d3.scaleLinear().domain([-90, 90]).range([m.t + ih, m.t]);
    svg.append('g').selectAll('line').data(xs.ticks(6)).join('line').attr('y1', m.t).attr('y2', m.t + ih).attr('x1', d => xs(d)).attr('x2', d => xs(d)).attr('stroke', GRID);
    styleAxis(svg.append('g').attr('transform', `translate(0,${m.t + ih})`).call(d3.axisBottom(xs).ticks(6).tickFormat(fmt)));
    styleAxis(svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(ys).tickValues([-90, -60, -30, 0, 30, 60, 90]).tickFormat(MapView.latLabel)));
    svg.append('text').attr('x', m.l + iw / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('fill', MUTED).text(opts.xLabel || '');
    if (opts.zero && x0 < 0 && x1 > 0) svg.append('line').attr('y1', m.t).attr('y2', m.t + ih).attr('x1', xs(0)).attr('x2', xs(0)).attr('stroke', INK);
    svg.append('path').datum(opts.lat.map((la, i) => [opts.values[i], la]))
      .attr('d', d3.line().defined(d => isFinite(d[0])).x(d => xs(d[0])).y(d => ys(d[1])))
      .attr('fill', 'none').attr('stroke', SMOOTH).attr('stroke-width', 2);
    const tip = tooltip(el);
    const dot = svg.append('circle').attr('r', 4).attr('fill', SMOOTH).attr('stroke', '#fff').attr('stroke-width', 2).attr('display', 'none');
    const lats = opts.lat;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', ev => {
        const [, my] = d3.pointer(ev);
        const la = ys.invert(my);
        let i = 0; for (let k = 1; k < lats.length; k++) if (Math.abs(lats[k] - la) < Math.abs(lats[i] - la)) i = k;
        const v = opts.values[i];
        if (!isFinite(v)) { tip.style.display = 'none'; dot.attr('display', 'none'); return; }
        dot.attr('display', null).attr('cx', xs(v)).attr('cy', ys(lats[i]));
        tip.innerHTML = `<b>${MapView.latLabel(+lats[i].toFixed(2))}</b><br>${fmt(v)} ${opts.units || ''}`;
        tip.style.display = 'block'; placeTip(el, tip, ev);
      })
      .on('pointerleave', () => { tip.style.display = 'none'; dot.attr('display', 'none'); });
    return { svg: svg.node() };
  }

  /** Render an SVG element to a PNG blob (2x). */
  function svgToCanvas(svgNode, scale = 2) {
    return new Promise((resolve, reject) => {
      const clone = svgNode.cloneNode(true);
      clone.querySelectorAll('.brush, [display="none"]').forEach(n => n.remove()); // no zoom/hover helpers in exports
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      const w = +svgNode.getAttribute('width'), h = +svgNode.getAttribute('height');
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
        const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0); resolve(c);
      };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }

  return { timeSeries, zonal, svgToCanvas, linreg, COLORS: { RAW, SMOOTH, TREND } };
})();
