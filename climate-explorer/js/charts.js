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

  /**
   * opts: { title, subtitle, yLabel, x:[dec years], labels:[str], series:[{name,y,color,width,dash}],
   *         style:'line'|'bars'|'stripes', trend:bool, zero:bool, units }
   */
  function timeSeries(el, opts) {
    const H = opts.height || 340;
    const { svg, W } = baseSvg(el, H);
    const m = { l: 62, r: 18, t: 54, b: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = opts.x;
    svg.append('text').attr('x', m.l).attr('y', 20).attr('font-weight', 650).attr('font-size', 14).attr('fill', INK).text(opts.title || '');
    if (opts.subtitle) svg.append('text').attr('x', m.l).attr('y', 37).attr('fill', MUTED).attr('font-size', 12).text(opts.subtitle);

    const xs = d3.scaleLinear().domain(d3.extent(x)).range([m.l, m.l + iw]);
    const xaxis = d3.axisBottom(xs).ticks(Math.min(12, Math.floor(iw / 70))).tickFormat(d3.format('d'));

    if (opts.style === 'stripes') {
      // one stripe per year: annual mean of the first series
      const by = d3.rollups(x.map((v, i) => [Math.floor(v + 1e-6), opts.series[0].y[i]]).filter(d => isFinite(d[1])), v => d3.mean(v, d => d[1]), d => d[0]);
      const years = by.map(d => d[0]), vals = by.map(d => d[1]);
      if (!years.length) return;
      const mean = opts.zero ? 0 : d3.mean(vals);
      const amp = d3.max(vals, v => Math.abs(v - mean)) || 1;
      const ys = d3.scaleBand().domain(years).range([m.l, m.l + iw]).padding(0);
      const g = svg.append('g');
      g.selectAll('rect').data(by).join('rect')
        .attr('x', d => ys(d[0])).attr('y', m.t).attr('width', ys.bandwidth() + 0.6).attr('height', ih)
        .attr('fill', d => d3.interpolateRdBu(0.5 - (d[1] - mean) / amp / 2));
      const xb = d3.scaleLinear().domain([years[0], years[years.length - 1] + 1]).range([m.l, m.l + iw]);
      styleAxis(svg.append('g').attr('transform', `translate(0,${m.t + ih})`).call(d3.axisBottom(xb).ticks(Math.min(12, Math.floor(iw / 70))).tickFormat(d3.format('d'))));
      svg.append('text').attr('x', m.l + iw).attr('y', 37).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11)
        .text(`Each stripe = one year. Blue = below ${opts.zero ? 'baseline' : 'average'}, red = above (±${fmt(amp)} ${opts.units || ''})`);
      const tip = tooltip(el);
      g.selectAll('rect').on('pointermove', (ev, d) => {
        tip.style.display = 'block';
        tip.innerHTML = `<b>${d[0]}</b><br>${fmt(d[1])} ${opts.units || ''}`;
        placeTip(el, tip, ev);
      }).on('pointerleave', () => { tip.style.display = 'none'; });
      return { svg: svg.node() };
    }

    const allY = opts.series.flatMap(s => s.y.filter(isFinite));
    if (opts.zero) allY.push(0);
    let [y0, y1] = d3.extent(allY);
    if (y0 === undefined) { y0 = 0; y1 = 1; }
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const ys = d3.scaleLinear().domain([y0, y1]).nice().range([m.t + ih, m.t]);
    // grid
    svg.append('g').selectAll('line').data(ys.ticks(6)).join('line')
      .attr('x1', m.l).attr('x2', m.l + iw).attr('y1', d => ys(d)).attr('y2', d => ys(d)).attr('stroke', GRID);
    styleAxis(svg.append('g').attr('transform', `translate(0,${m.t + ih})`).call(xaxis));
    styleAxis(svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(ys).ticks(6).tickFormat(fmt)));
    svg.append('text').attr('transform', `translate(16,${m.t + ih / 2}) rotate(-90)`).attr('text-anchor', 'middle')
      .attr('fill', MUTED).attr('font-size', 12).text(opts.yLabel || '');
    if (opts.zero && y0 < 0 && y1 > 0) svg.append('line').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', ys(0)).attr('y2', ys(0)).attr('stroke', INK).attr('stroke-width', 1);

    const plot = svg.append('g');
    if (opts.style === 'bars') {
      const s = opts.series[0];
      const bw = Math.max(1, iw / x.length - 0.5);
      const base = opts.zero ? 0 : d3.mean(s.y.filter(isFinite));
      plot.selectAll('rect').data(s.y.map((v, i) => [x[i], v]).filter(d => isFinite(d[1]))).join('rect')
        .attr('x', d => xs(d[0]) - bw / 2).attr('width', bw)
        .attr('y', d => ys(Math.max(d[1], base))).attr('height', d => Math.abs(ys(d[1]) - ys(base)))
        .attr('fill', d => (d[1] >= base ? POS : NEG));
      opts.series.slice(1).forEach(s2 => drawLine(plot, x, s2, xs, ys));
    } else {
      opts.series.forEach(s => drawLine(plot, x, s, xs, ys));
    }
    let trendText = '';
    if (opts.trend) {
      const r = linreg(x, opts.series[0].y);
      if (r) {
        const xa = d3.extent(x);
        plot.append('line').attr('x1', xs(xa[0])).attr('x2', xs(xa[1]))
          .attr('y1', ys(r.intercept + r.slope * xa[0])).attr('y2', ys(r.intercept + r.slope * xa[1]))
          .attr('stroke', TREND).attr('stroke-width', 2).attr('stroke-dasharray', '6 4');
        trendText = `Trend: ${r.slope * 10 >= 0 ? '+' : ''}${fmt(r.slope * 10)} ${opts.units || ''} per decade`;
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
        const tw = t.node().getComputedTextLength ? t.node().getComputedTextLength() : it.name.length * 6;
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

    // hover crosshair
    const tip = tooltip(el);
    const cross = svg.append('line').attr('y1', m.t).attr('y2', m.t + ih).attr('stroke', MUTED).attr('stroke-width', 1).attr('display', 'none');
    const dots = opts.series.map(s => svg.append('circle').attr('r', 4).attr('fill', s.color).attr('stroke', '#fff').attr('stroke-width', 2).attr('display', 'none'));
    const bis = d3.bisector(d => d).center;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', ev => {
        const [mx] = d3.pointer(ev);
        const i = bis(x, xs.invert(mx));
        cross.attr('display', null).attr('x1', xs(x[i])).attr('x2', xs(x[i]));
        let html = `<b>${opts.labels ? opts.labels[i] : x[i].toFixed(2)}</b>`;
        opts.series.forEach((s, k) => {
          const v = s.y[i];
          if (isFinite(v)) dots[k].attr('display', null).attr('cx', xs(x[i])).attr('cy', ys(v)); else dots[k].attr('display', 'none');
          html += `<br><span class="sw" style="background:${s.color}"></span>${s.name}: <b>${isFinite(v) ? fmt(v) : '–'}</b> ${opts.units || ''}`;
        });
        tip.innerHTML = html; tip.style.display = 'block';
        placeTip(el, tip, ev);
      })
      .on('pointerleave', () => { tip.style.display = 'none'; cross.attr('display', 'none'); dots.forEach(d => d.attr('display', 'none')); });
    return { svg: svg.node() };
  }

  function drawLine(g, x, s, xs, ys) {
    const line = d3.line().defined(d => isFinite(d[1])).x(d => xs(d[0])).y(d => ys(d[1]));
    g.append('path').datum(s.y.map((v, i) => [x[i], v])).attr('d', line).attr('fill', 'none')
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
      const xml = new XMLSerializer().serializeToString(svgNode);
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
