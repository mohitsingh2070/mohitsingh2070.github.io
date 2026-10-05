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
    // frequency from the median spacing (in days)
    let freq = 'single';
    if (steps.length > 1) {
      const diffs = [];
      for (let i = 1; i < steps.length; i++) diffs.push((steps[i].dec - steps[i - 1].dec) * 365.25);
      diffs.sort((a, b) => a - b);
      const md = diffs[Math.floor(diffs.length / 2)];
      freq = md < 0.9 ? 'subdaily' : md < 1.5 ? 'daily' : md < 20 ? 'weekly' : md < 45 ? 'monthly' : md < 120 ? 'seasonal' : md < 400 ? 'yearly' : 'multiyear';
    }
    const pad = n => String(n).padStart(2, '0');
    for (const s of steps) {
      if (freq === 'monthly' || freq === 'seasonal') s.label = `${MONTHS[s.m - 1]} ${s.y}`;
      else if (freq === 'yearly' || freq === 'multiyear') s.label = `${s.y}`;
      else if (freq === 'subdaily') s.label = `${s.y}-${pad(s.m)}-${pad(s.d)} ${pad(Math.round(s.H))}:00`;
      else s.label = `${s.y}-${pad(s.m)}-${pad(s.d)}`;
    }
    return { ok: true, steps, freq, calendar: cal };
  }

  return { decode, MONTHS };
})();
