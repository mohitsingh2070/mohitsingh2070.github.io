/* colormaps.js — perceptually ordered colour scales built from d3-scale-chromatic.
 * "_r" = reversed. Sequential scales for magnitudes, diverging scales for anomalies/trends. */
const Colormaps = (() => {
  'use strict';
  const rev = f => t => f(1 - t);
  const list = [
    { id: 'viridis', label: 'Viridis', type: 'seq', f: d3.interpolateViridis },
    { id: 'cividis', label: 'Cividis (colour-blind safe)', type: 'seq', f: d3.interpolateCividis },
    { id: 'magma', label: 'Magma', type: 'seq', f: d3.interpolateMagma },
    { id: 'inferno', label: 'Inferno', type: 'seq', f: d3.interpolateInferno },
    { id: 'plasma', label: 'Plasma', type: 'seq', f: d3.interpolatePlasma },
    { id: 'YlOrRd', label: 'Yellow–Orange–Red (heat)', type: 'seq', f: d3.interpolateYlOrRd },
    { id: 'YlGnBu', label: 'Yellow–Green–Blue (rain)', type: 'seq', f: d3.interpolateYlGnBu },
    { id: 'Blues', label: 'Blues', type: 'seq', f: d3.interpolateBlues },
    { id: 'Greys', label: 'Greys', type: 'seq', f: d3.interpolateGreys },
    { id: 'RdYlBu_r', label: 'Blue–Yellow–Red (temperature)', type: 'div', f: rev(d3.interpolateRdYlBu) },
    { id: 'RdBu_r', label: 'Blue–White–Red (anomaly)', type: 'div', f: rev(d3.interpolateRdBu) },
    { id: 'BrBG', label: 'Brown–White–Green (wet/dry)', type: 'div', f: d3.interpolateBrBG },
    { id: 'PuOr_r', label: 'Purple–White–Orange', type: 'div', f: rev(d3.interpolatePuOr) },
    { id: 'PiYG', label: 'Pink–White–Green', type: 'div', f: d3.interpolatePiYG },
  ];
  const byId = Object.fromEntries(list.map(c => [c.id, c]));

  /** Build a 256-entry RGBA lookup (or nLevels discrete colours). */
  function lut(id, reverse, nLevels) {
    const c = byId[id] || byId.viridis;
    const f = reverse ? rev(c.f) : c.f;
    const n = nLevels > 0 ? nLevels : 256;
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const t = nLevels > 0 ? (n === 1 ? 0.5 : i / (n - 1)) : i / 255;
      const col = d3.rgb(f(t));
      out[i * 4] = col.r; out[i * 4 + 1] = col.g; out[i * 4 + 2] = col.b; out[i * 4 + 3] = 255;
    }
    return out;
  }
  function css(id, reverse, t) {
    const c = byId[id] || byId.viridis;
    return (reverse ? rev(c.f) : c.f)(t);
  }
  return { list, byId, lut, css };
})();
