/* cftime.js — decode CF-convention time axes ("days since 1850-01-01", calendars
 * standard / gregorian / proleptic_gregorian / noleap / 365_day / all_leap / 366_day / 360_day).
 * Returns per time step: year, month (1-12), day, hour, decimal year and a readable label. */
const CFTime = (() => {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const UNIT_DAYS = {
    second: 1 / 86400, seconds: 1 / 86400, sec: 1 / 86400, secs: 1 / 86400, s: 1 / 86400,
    minute: 1 / 1440, minutes: 1 / 1440, min: 1 / 1440, mins: 1 / 1440,
    hour: 1 / 24, hours: 1 / 24, hr: 1 / 24, hrs: 1 / 24, h: 1 / 24,
    day: 1, days: 1, d: 1,
  };
  const DPM = { noleap: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], all_leap: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], '360_day': Array(12).fill(30) };

  function parseUnits(units) {
    const m = /^\s*([a-zA-Z]+)\s+since\s+(.+?)\s*$/.exec(units || '');
    if (!m) return null;
    const d = /(-?\d+)-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d*)?))?)?/.exec(m[2]);
    if (!d) return null;
    return {
      unit: m[1].toLowerCase(),
      base: { y: +d[1], m: +d[2], d: +d[3], H: +(d[4] || 0), M: +(d[5] || 0), S: parseFloat(d[6] || 0) },
    };
  }

  function normCalendar(c) {
    c = (c || 'standard').toLowerCase();
    if (c === 'noleap' || c === '365_day') return 'noleap';
    if (c === 'all_leap' || c === '366_day') return 'all_leap';
    if (c === '360_day') return '360_day';
    return 'standard'; // gregorian, proleptic_gregorian, julian (approximated)
  }

  // ---- fixed-length-year calendars: work in "days since year 0"
  function fixedToYMD(totalDays, cal) {
    const dpm = DPM[cal]; const ylen = dpm.reduce((a, b) => a + b, 0);
    const y = Math.floor(totalDays / ylen);
    let rem = totalDays - y * ylen;
    let m = 0;
    while (m < 11 && rem >= dpm[m]) { rem -= dpm[m]; m++; }
    const d = Math.floor(rem);
    return { y, m: m + 1, d: d + 1, H: (rem - d) * 24, yearFrac: (totalDays - y * ylen) / ylen };
  }
  function fixedFromYMD(b, cal) {
    const dpm = DPM[cal]; const ylen = dpm.reduce((a, c) => a + c, 0);
    let days = b.y * ylen;
    for (let k = 0; k < b.m - 1; k++) days += dpm[k];
    return days + (b.d - 1) + (b.H + b.M / 60 + b.S / 3600) / 24;
  }

  function utcMs(y, m, d, H, M, S) {
    const dt = new Date(Date.UTC(2000, m - 1, d, H, M, 0, 0) + S * 1000);
    dt.setUTCFullYear(y); // allow years < 100
    return dt.getTime();
  }
  function msToParts(ms) {
    const dt = new Date(ms);
    const y = dt.getUTCFullYear();
    const y0 = utcMs(y, 1, 1, 0, 0, 0), y1 = utcMs(y + 1, 1, 1, 0, 0, 0);
    return { y, m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), H: dt.getUTCHours() + dt.getUTCMinutes() / 60, yearFrac: (ms - y0) / (y1 - y0) };
  }

  /** decode(values, units, calendar) -> {ok, steps:[{y,m,d,H,dec,label}], freq} */
  function decode(values, units, calendar) {
    const pu = parseUnits(units);
    if (!pu) return { ok: false, reason: 'time units not understood: ' + units };
    const cal = normCalendar(calendar);
    const steps = [];
    const unit = pu.unit;
    const isMonths = /^months?$/.test(unit), isYears = /^(years?|yr|yrs)$/.test(unit);
    if (!isMonths && !isYears && !(unit in UNIT_DAYS)) return { ok: false, reason: 'unknown time unit ' + unit };

    for (const raw of values) {
      let p;
      if (isMonths || isYears) {
        // calendar months/years: integer part steps months, fraction ~ mid-month
        const mo = isMonths ? raw : raw * 12;
        const whole = Math.floor(mo + 1e-6);
        const tot = (pu.base.y * 12 + pu.base.m - 1) + whole;
        const y = Math.floor(tot / 12), m = tot - y * 12 + 1;
        const frac = mo - whole;
        p = { y, m, d: Math.max(1, Math.round(pu.base.d + frac * 30)), H: 0, yearFrac: (m - 1 + frac) / 12 };
      } else if (cal === 'standard') {
        const ms = utcMs(pu.base.y, pu.base.m, pu.base.d, pu.base.H, pu.base.M, pu.base.S) + raw * UNIT_DAYS[unit] * 864e5;
        p = msToParts(ms);
      } else {
        p = fixedToYMD(fixedFromYMD(pu.base, cal) + raw * UNIT_DAYS[unit], cal);
      }
      steps.push({ y: p.y, m: p.m, d: p.d, H: p.H, dec: p.y + p.yearFrac });
    }
    return Object.assign({ ok: true, steps, calendar: cal }, finalize(steps));
  }

  // ---------------------------------------------------------------- calendar helpers
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  function daysInMonth(y, m, cal) {
    if (cal === '360_day') return 30;
    if (m === 2) return cal === 'noleap' ? 28 : cal === 'all_leap' ? 29 : isLeap(y) ? 29 : 28;
    return DPM.noleap[m - 1];
  }
  /** calendar date -> decimal year (same definition as decode() uses) */
  function toDec(y, m, d, H, cal) {
    if (cal === 'noleap' || cal === 'all_leap' || cal === '360_day') {
      const dpm = DPM[cal], ylen = dpm.reduce((a, b) => a + b, 0);
      let days = 0; for (let k = 0; k < m - 1; k++) days += dpm[k];
      return y + (days + d - 1 + (H || 0) / 24) / ylen;
    }
    const y0 = utcMs(y, 1, 1, 0, 0, 0), y1 = utcMs(y + 1, 1, 1, 0, 0, 0);
    return y + (utcMs(y, m, d, H || 0, 0, 0) - y0) / (y1 - y0);
  }
  function fromDec(dec, cal) {
    const y = Math.floor(dec), f = dec - y;
    if (cal === 'noleap' || cal === 'all_leap' || cal === '360_day') {
      const ylen = DPM[cal].reduce((a, b) => a + b, 0);
      const p = fixedToYMD(y * ylen + f * ylen, cal);
      return { y: p.y, m: p.m, d: p.d, H: p.H };
    }
    const y0 = utcMs(y, 1, 1, 0, 0, 0), y1 = utcMs(y + 1, 1, 1, 0, 0, 0);
    const p = msToParts(y0 + f * (y1 - y0));
    return { y: p.y, m: p.m, d: p.d, H: p.H };
  }
  /** Calendar-day index used for daily climatologies: 0..364 (Feb 29 shares Feb 28), or 0..359 for 360_day. */
  function dayIndex(s, cal) {
    if (cal === '360_day') return (s.m - 1) * 30 + s.d - 1;
    if (s.m === 2 && s.d === 29) return 58;
    return CUM[s.m - 1] + s.d - 1;
  }
  const dayPeriod = cal => (cal === '360_day' ? 360 : 365);

  /** Work out the sampling frequency from the median spacing and give every step a label. */
  function finalize(steps) {
    let freq = 'single', stepDays = NaN;
    if (steps.length > 1) {
      const diffs = [];
      for (let i = 1; i < steps.length; i++) diffs.push((steps[i].dec - steps[i - 1].dec) * 365.25);
      diffs.sort((a, b) => a - b);
      stepDays = diffs[Math.floor(diffs.length / 2)];
      const md = stepDays;
      freq = md < 0.9 ? 'subdaily' : md < 1.5 ? 'daily' : md < 20 ? 'weekly' : md < 45 ? 'monthly' : md < 120 ? 'seasonal' : md < 400 ? 'yearly' : 'multiyear';
    }
    const pad = n => String(n).padStart(2, '0');
    for (const s of steps) {
      if (freq === 'monthly' || freq === 'seasonal') s.label = `${MONTHS[s.m - 1]} ${s.y}`;
      else if (freq === 'yearly' || freq === 'multiyear') s.label = `${s.y}`;
      else if (freq === 'subdaily') {
        const hm = Math.round((s.H || 0) * 60);
        s.label = `${s.d} ${MONTHS[s.m - 1]} ${s.y}, ${pad(Math.floor(hm / 60) % 24)}:${pad(hm % 60)}`;
      } else s.label = `${s.d} ${MONTHS[s.m - 1]} ${s.y}`;
    }
    return { freq, stepDays };
  }

  // ---------------------------------------------------------------- axis ticks
  const INTERVALS = [['hour', 1], ['hour', 3], ['hour', 6], ['hour', 12], ['day', 1], ['day', 2], ['day', 5], ['day', 10], ['day', 15],
    ['month', 1], ['month', 2], ['month', 3], ['month', 6], ['year', 1], ['year', 2], ['year', 5], ['year', 10], ['year', 20],
    ['year', 50], ['year', 100], ['year', 200], ['year', 500], ['year', 1000]];
  const LEN = { hour: 1 / 8766, day: 1 / 365.25, month: 1 / 12, year: 1 };
  const LABEL_PX = { hour: 50, day: 56, month: 64, year: 44 }; // room each label needs, incl. a gap

  function generate([unit, k], d0, d1, cal) {
    const out = [];
    let guard = 0;
    if (unit === 'year') {
      for (let y = Math.ceil((Math.floor(d0) - k) / k) * k; guard++ < 5000; y += k) {
        const v = toDec(y, 1, 1, 0, cal);
        if (v > d1) break;
        if (v >= d0) out.push({ v, p: { y, m: 1, d: 1, H: 0 } });
      }
      return out;
    }
    const p = fromDec(d0, cal);
    let { y, m, d } = p, H = Math.floor(p.H);
    if (unit === 'month') d = 1;
    if (unit !== 'hour') H = 0;
    while (guard++ < 200000) {
      let ok;
      if (unit === 'month') ok = (m - 1) % k === 0;
      else if (unit === 'day') ok = (d - 1) % k === 0 && daysInMonth(y, m, cal) - d + 1 >= k * 0.5;
      else ok = H % k === 0;
      if (ok) {
        const v = toDec(y, m, unit === 'month' ? 1 : d, H, cal);
        if (v > d1) break;
        if (v >= d0) out.push({ v, p: { y, m, d: unit === 'month' ? 1 : d, H } });
      }
      // advance one unit
      if (unit === 'hour') { if (++H < 24) continue; H = 0; }
      if (unit !== 'month') { if (++d <= daysInMonth(y, m, cal)) continue; d = 1; }
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }
  function tickLabel(unit, p, first) {
    const mon = MONTHS[p.m - 1];
    if (unit === 'year') return `${p.y}`;
    if (unit === 'month') return first || p.m === 1 ? `${mon} ${p.y}` : mon;
    if (unit === 'day') return first || (p.m === 1 && p.d === 1) ? `${p.d} ${mon} ${p.y}` : `${p.d} ${mon}`;
    const hh = String(p.H).padStart(2, '0') + ':00';
    if (first) return `${p.d} ${mon} ${p.y} ${hh}`;
    return p.H === 0 ? `${p.d} ${mon}` : hh;
  }
  /**
   * Calendar-aware axis ticks for decimal-year positions d0..d1 on an axis widthPx wide.
   * Returns { major:[{v,label}], minor:[v], unit }. The step is chosen so labels do not collide.
   */
  function ticks(d0, d1, widthPx, cal) {
    cal = normCalendar(cal);
    const span = Math.max(d1 - d0, 1e-9);
    let mi = INTERVALS.length - 1;
    for (let i = 0; i < INTERVALS.length; i++) {
      const [u, k] = INTERVALS[i];
      if (span / (k * LEN[u]) <= widthPx / LABEL_PX[u]) { mi = i; break; }
    }
    const major = INTERVALS[mi];
    // minor ticks: the finest interval that stays at least ~12 px apart and lines up with the major ones
    let minor = null;
    for (let i = 0; i < mi; i++) {
      const [u, k] = INTERVALS[i];
      if (span / (k * LEN[u]) > widthPx / 12) continue;
      if (u === major[0] && major[1] % k !== 0) continue;
      if (u !== major[0] && u === 'day' && k > 1) continue;
      if (u !== major[0] && u === 'hour' && 24 % k !== 0) continue;
      minor = INTERVALS[i]; break;
    }
    const maj = generate(major, d0, d1, cal).map((t, i) => ({ v: t.v, label: tickLabel(major[0], t.p, i === 0) }));
    const majSet = new Set(maj.map(t => t.v.toFixed(9)));
    const min = minor ? generate(minor, d0, d1, cal).map(t => t.v).filter(v => !majSet.has(v.toFixed(9))) : [];
    return { major: maj, minor: min, unit: major[0] };
  }

  return { decode, MONTHS, toDec, fromDec, daysInMonth, dayIndex, dayPeriod, finalize, ticks, normCalendar };
})();
