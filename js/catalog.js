// Yale Bright Star Catalog (BSC5) fixed-width parser + serializer.
// Byte offsets follow ybsc5.readme (1-based there, 0-based here).

const RECORD_LEN = 197;
const D2R = Math.PI / 180;

// --- Field slicing helpers (0-based, half-open intervals) ----------
function slice(line, aOneBased, bOneBased) {
  // readme uses inclusive 1-based ranges: "1-4" means chars 1..4 → slice(0,4)
  return line.slice(aOneBased - 1, bOneBased);
}

function parseIntBlank(s) {
  const t = s.trim();
  return t === '' ? null : parseInt(t, 10);
}

function parseFloatBlank(s) {
  const t = s.trim();
  return t === '' ? null : parseFloat(t);
}

// --- Ballester (1995): B-V → Teff (K) ------------------------------
// T = 4600 * (1/(0.92*bv + 1.70) + 1/(0.92*bv + 0.62))
const DEFAULT_TEMP = 6500;  // sun-ish, when B-V is unknown
export function bvToTemperature(bv) {
  if (bv === null || bv === undefined || !isFinite(bv)) return DEFAULT_TEMP;
  const x = 0.92 * bv;
  const t = 4600 * (1 / (x + 1.70) + 1 / (x + 0.62));
  // Clamp to a sensible stellar range.
  return Math.max(1500, Math.min(40000, t));
}

// --- Tanner Helland: blackbody T (K) → sRGB [0..1] -----------------
export function temperatureToRGB(T) {
  const t = T / 100;
  let r, g, b;

  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  return [
    Math.max(0, Math.min(255, r)) / 255,
    Math.max(0, Math.min(255, g)) / 255,
    Math.max(0, Math.min(255, b)) / 255,
  ];
}

// --- Vmag → linear flux (Pogson) -----------------------------------
export function vmagToFlux(vmag) {
  return Math.pow(10, -vmag / 2.5);
}

// Recompute derived color/flux after an edit.
export function refreshStarPhotometry(star) {
  const T = bvToTemperature(star.BV);
  star.temp = T;
  star.color = temperatureToRGB(T);
  star.flux = vmagToFlux(star.Vmag);
}

// --- Parser --------------------------------------------------------
export function parseCatalog(text) {
  const rawLines = text.split('\n');
  const stars = [];

  for (const rawLine of rawLines) {
    if (rawLine.length === 0) continue;
    const line = rawLine.padEnd(RECORD_LEN, ' ');

    // Skip non-stars: novae / extragalactic records have blank J2000 RA hours
    // AND blank Vmag (14 records per the 1993 CDS historical notes).
    const rahStr = slice(line, 76, 77);
    const vmagStr = slice(line, 103, 107);
    if (rahStr.trim() === '' || vmagStr.trim() === '') continue;

    const rah = parseInt(rahStr, 10);
    const ram = parseInt(slice(line, 78, 79), 10);
    const ras = parseFloat(slice(line, 80, 83));
    const deSign = slice(line, 84, 84) === '-' ? -1 : 1;
    const ded = parseInt(slice(line, 85, 86), 10);
    const dem = parseInt(slice(line, 87, 88), 10);
    const des = parseInt(slice(line, 89, 90), 10);

    const ra = (rah + ram / 60 + ras / 3600) * 15 * D2R;
    const dec = deSign * (ded + dem / 60 + des / 3600) * D2R;

    const star = {
      HR:       parseIntBlank(slice(line, 1, 4)),
      Name:     slice(line, 5, 14).trim(),
      DM:       slice(line, 15, 25),
      HD:       parseIntBlank(slice(line, 26, 31)),
      SAO:      parseIntBlank(slice(line, 32, 37)),
      FK5:      parseIntBlank(slice(line, 38, 41)),

      ra, dec,

      Vmag:     parseFloat(vmagStr),
      BV:       parseFloatBlank(slice(line, 110, 114)),
      UB:       parseFloatBlank(slice(line, 116, 120)),
      RI:       parseFloatBlank(slice(line, 122, 126)),
      SpType:   slice(line, 128, 147).trimEnd(),

      pmRA:     parseFloatBlank(slice(line, 149, 154)),
      pmDE:     parseFloatBlank(slice(line, 155, 160)),
      Parallax: parseFloatBlank(slice(line, 162, 166)),
      RadVel:   parseIntBlank(slice(line, 167, 170)),

      _raw:     rawLine,      // original, so unedited fields round-trip byte-exact
      _edited:  false,
    };

    refreshStarPhotometry(star);
    stars.push(star);
  }

  return stars;
}

// --- Formatters ----------------------------------------------------
function padSpace(w) { return ' '.repeat(w); }

// Fortran I format: right-justified, space-padded.
function fmtI(n, w) {
  if (n === null || n === undefined || !isFinite(n)) return padSpace(w);
  return String(Math.trunc(n)).padStart(w, ' ');
}

// I with zero-padded digits (e.g. "05" for minutes).
function fmtI0(n, w) {
  if (n === null || n === undefined || !isFinite(n)) return padSpace(w);
  const neg = n < 0;
  const abs = Math.abs(Math.trunc(n)).toString().padStart(w - (neg ? 1 : 0), '0');
  return (neg ? '-' : '') + abs;
}

// Explicitly-signed integer with zero-padding (for RadVel: "+013", "-018").
function fmtIsigned(n, w) {
  if (n === null || n === undefined || !isFinite(n)) return padSpace(w);
  const sign = n < 0 ? '-' : '+';
  const body = Math.abs(Math.trunc(n)).toString().padStart(w - 1, '0');
  return sign + body;
}

// Fortran F format: right-justified, space-padded.
function fmtF(n, w, d) {
  if (n === null || n === undefined || !isFinite(n)) return padSpace(w);
  const s = n.toFixed(d);
  return s.padStart(w, ' ');
}

// F with zero-padded integer part (for HMS/DMS seconds fields: "09.9").
function fmtF0(n, w, d) {
  if (n === null || n === undefined || !isFinite(n)) return padSpace(w);
  const s = n.toFixed(d);
  const dot = s.indexOf('.');
  const intStr = dot < 0 ? s : s.slice(0, dot);
  const fracStr = dot < 0 ? '' : s.slice(dot);
  const neg = intStr.startsWith('-');
  const absInt = neg ? intStr.slice(1) : intStr;
  const padded = absInt.padStart(w - fracStr.length - (neg ? 1 : 0), '0');
  return (neg ? '-' : '') + padded + fracStr;
}

// Fortran A format: left-justified, space-padded, truncated to width.
function fmtA(s, w) {
  if (s === null || s === undefined) return padSpace(w);
  const str = String(s);
  if (str.length >= w) return str.slice(0, w);
  return str + padSpace(w - str.length);
}

function spliceField(buf, aOneBased, bOneBased, value) {
  const start = aOneBased - 1;
  const width = bOneBased - aOneBased + 1;
  const v = value.length === width ? value
          : value.length > width ? value.slice(0, width)
          : value + padSpace(width - value.length);
  for (let i = 0; i < width; i++) buf[start + i] = v[i];
}

// --- RA/Dec packing ------------------------------------------------
function radiansToHMS(ra) {
  // ra is in radians; wrap to [0, 2π)
  let r = ra % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  const totalHours = r * 12 / Math.PI;  // radians → hours
  let h = Math.floor(totalHours);
  let rem = (totalHours - h) * 60;
  let m = Math.floor(rem);
  let s = (rem - m) * 60;
  // Round seconds to 1 decimal and cascade carries.
  s = Math.round(s * 10) / 10;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; h += 1; }
  if (h >= 24) { h -= 24; }
  return { h, m, s };
}

function radiansToDMS(dec) {
  // Clamp to [-π/2, π/2] then produce DMS.
  const sign = dec < 0 ? '-' : '+';
  let abs = Math.abs(dec) * 180 / Math.PI;
  let d = Math.floor(abs);
  let rem = (abs - d) * 60;
  let m = Math.floor(rem);
  let s = Math.round((rem - m) * 60);
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  if (d > 90) { d = 90; m = 0; s = 0; }
  return { sign, d, m, s };
}

// --- Serializer ----------------------------------------------------
export function serializeCatalog(stars) {
  const out = [];
  for (const star of stars) {
    if (!star._edited && star._raw !== undefined && star._raw !== '') {
      // Un-edited stars: pass through original bytes unchanged.
      out.push(star._raw);
      continue;
    }
    const buf = (star._raw || '').padEnd(RECORD_LEN, ' ').split('');

    // HR
    spliceField(buf, 1, 4, fmtI(star.HR, 4));
    // Name (A10)
    spliceField(buf, 5, 14, fmtA(star.Name, 10));
    // RA J2000 (bytes 76-83): HH MM SS.S zero-padded
    const hms = radiansToHMS(star.ra);
    spliceField(buf, 76, 77, fmtI0(hms.h, 2));
    spliceField(buf, 78, 79, fmtI0(hms.m, 2));
    spliceField(buf, 80, 83, fmtF0(hms.s, 4, 1));
    // Dec J2000 (bytes 84-90)
    const dms = radiansToDMS(star.dec);
    spliceField(buf, 84, 84, dms.sign);
    spliceField(buf, 85, 86, fmtI0(dms.d, 2));
    spliceField(buf, 87, 88, fmtI0(dms.m, 2));
    spliceField(buf, 89, 90, fmtI0(dms.s, 2));
    // Vmag (F5.2)
    spliceField(buf, 103, 107, fmtF(star.Vmag, 5, 2));
    // B-V (F5.2)
    spliceField(buf, 110, 114, fmtF(star.BV, 5, 2));
    // Spectral type (A20)
    spliceField(buf, 128, 147, fmtA(star.SpType, 20));
    // pmRA, pmDE (F6.3)
    spliceField(buf, 149, 154, fmtF(star.pmRA, 6, 3));
    spliceField(buf, 155, 160, fmtF(star.pmDE, 6, 3));
    // Parallax (F5.3)
    spliceField(buf, 162, 166, fmtF(star.Parallax, 5, 3));
    // RadVel (I4 with explicit sign + zero-pad, matching file convention)
    if (star.RadVel === null || star.RadVel === undefined) {
      spliceField(buf, 167, 170, padSpace(4));
    } else {
      spliceField(buf, 167, 170, fmtIsigned(star.RadVel, 4));
    }

    // Trim trailing spaces to match the variable-width rows in the original file.
    out.push(buf.join('').replace(/\s+$/, ''));
  }
  return out.join('\n') + '\n';
}

// --- Construction of a new star ------------------------------------
export function makeNewStar({ ra, dec, HR }) {
  const star = {
    HR,
    Name: '',
    DM: '',
    HD: null,
    SAO: null,
    FK5: null,
    ra, dec,
    Vmag: 0,
    BV:   0,
    UB:   null,
    RI:   null,
    SpType: '',
    pmRA: null,
    pmDE: null,
    Parallax: null,
    RadVel: null,
    _raw: '',
    _edited: true,
  };
  refreshStarPhotometry(star);
  return star;
}
