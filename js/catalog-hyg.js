// HYG Star Database v4.2 CSV parser + serializer.
// HYG merges Hipparcos, Yale Bright Star, and Gliese catalogs.
// Field layout follows hyg_v42.csv column order (0-based indices noted inline).

import { refreshStarPhotometry } from './catalog-bsc.js';

const R2H  = 12 / Math.PI;          // radians → decimal hours
const R2D  = 180 / Math.PI;         // radians → decimal degrees
const AS2R = Math.PI / (180 * 3600);// arcsec → radians (for pmrarad/pmdecrad output)

// Header row for HYG v4.2 CSV output (column order must match the parser indices below).
const HYG_HEADER = '"id","hip","hd","hr","gl","bf","proper","ra","dec","dist","pmra","pmdec","rv","mag","absmag","spect","ci","x","y","z","vx","vy","vz","rarad","decrad","pmrarad","pmdecrad","bayer","flam","con","comp","comp_primary","base","lum","var","var_min","var_max"';


// --- CSV helpers ---------------------------------------------------

// Simple CSV line parser: handles quoted fields (no embedded quotes or newlines,
// which HYG does not use). Unquoted fields are returned as-is.
function parseCsvLine(line) {
	const fields = [];
	let i = 0;
	const n = line.length;
	while (i <= n) {
		if (i < n && line[i] === '"') {
			// Quoted field: find closing quote.
			let j = i + 1;
			while (j < n && line[j] !== '"') j++;
			fields.push(line.slice(i + 1, j));
			i = j + 2; // skip closing quote + comma separator
		}
		else {
			// Unquoted field: read up to next comma.
			let j = i;
			while (j < n && line[j] !== ',') j++;
			fields.push(line.slice(i, j));
			i = j + 1;
		}
	}
	return fields;
}


function parseNum(s) {
	const t = s.trim();
	return t === '' ? null : parseFloat(t);
}


function parseInt2(s) {
	const t = s.trim();
	return t === '' ? null : parseInt(t, 10);
}


// --- Parser --------------------------------------------------------
export function parseHygCatalog(text) {
	const lines = text.split('\n');
	const stars = [];
	let firstLine = true;

	for (const rawLine of lines) {
		if (rawLine.trim() === '') continue;
		if (firstLine) {
			firstLine = false;
			continue; // skip header row
		}

		const f = parseCsvLine(rawLine);
		// Require at least through decrad (col 24).
		if (f.length < 25) continue;
		// Skip Sol (id === '0').
		if (f[0] === '0') continue;

		const rarad  = parseNum(f[23]);
		const decrad = parseNum(f[24]);
		if (rarad === null || decrad === null) continue;

		const dist      = parseNum(f[9]);
		// HYG pmra/pmdec are in mas/yr; internal pmRA/pmDE are arcsec/yr.
		const pmra_mas  = parseNum(f[10]);
		const pmdec_mas = parseNum(f[11]);
		// HYG stores Cartesian position in parsecs and velocity in km/s.

		const star = {
			HR:           parseInt2(f[3]),
			Name:         f[5].trim(),   // bf field — same format as BSC Name
			DM:           '',
			HD:           parseInt2(f[2]),
			SAO:          null,
			FK5:          null,
			hygId:        parseInt2(f[0]),
			glieseId:     f[4].trim() || null,
			properName:   f[6].trim() || null,
			primaryHygId: f.length > 31 ? parseInt2(f[31]) : null,

			ra:  rarad,
			dec: decrad,

			Vmag:   parseNum(f[13]),
			BV:     parseNum(f[16]),
			UB:     null,
			RI:     null,
			SpType: f[15].trim(),

			pmRA:     pmra_mas  !== null ? pmra_mas  / 1000 : null,
			pmDE:     pmdec_mas !== null ? pmdec_mas / 1000 : null,
			Parallax: (dist !== null && dist > 0) ? 1 / dist : null,
			RadVel:   parseNum(f[12]),

			x:  parseNum(f[17]),
			y:  parseNum(f[18]),
			z:  parseNum(f[19]),
			vx: parseNum(f[20]),
			vy: parseNum(f[21]),
			vz: parseNum(f[22]),

			_raw:    rawLine,
			_edited: false,
		};

		refreshStarPhotometry(star);
		stars.push(star);
	}

	return stars;
}


// --- Serializer ----------------------------------------------------

function csvNum(v, precision) {
	if (v === null || v === undefined || !isFinite(v)) return '';
	return precision !== undefined ? v.toFixed(precision) : String(v);
}


function csvStr(v) {
	return '"' + (v === null || v === undefined ? '' : String(v)) + '"';
}


export function serializeHygCatalog(stars) {
	const out = [HYG_HEADER];
	for (const star of stars) {
		if (!star._edited && star._raw) {
			out.push(star._raw);
			continue;
		}

		// Reverse-map internal fields back to HYG column values.
		const dist      = (star.Parallax !== null && star.Parallax > 0) ? 1 / star.Parallax : null;
		const pmra_mas  = star.pmRA !== null ? star.pmRA * 1000  : null; // arcsec/yr → mas/yr
		const pmdec_mas = star.pmDE !== null ? star.pmDE * 1000  : null;
		const pmrarad   = star.pmRA !== null ? star.pmRA * AS2R  : null; // arcsec/yr → rad/yr
		const pmdecrad  = star.pmDE !== null ? star.pmDE * AS2R  : null;

		const row = [
			csvNum(star.hygId),            // id
			csvNum(null),                  // hip (not tracked)
			csvNum(star.HD),               // hd
			csvNum(star.HR),               // hr
			csvStr(star.glieseId),         // gl
			csvStr(star.Name || ''),       // bf
			csvStr(star.properName),       // proper
			csvNum(star.ra  * R2H, 6),    // ra (decimal hours)
			csvNum(star.dec * R2D, 6),    // dec (decimal degrees)
			csvNum(dist, 4),               // dist
			csvNum(pmra_mas,  4),          // pmra (mas/yr)
			csvNum(pmdec_mas, 4),          // pmdec (mas/yr)
			csvNum(star.RadVel, 2),        // rv
			csvNum(star.Vmag,   2),        // mag
			csvNum(null),                  // absmag (not tracked)
			star.SpType || '',             // spect (unquoted, like original)
			csvNum(star.BV, 3),            // ci
			csvNum(star.x,  6),            // x (in parsecs)
			csvNum(star.y,  6),            // y
			csvNum(star.z,  6),            // z
			csvNum(star.vx, 8),            // vx (in km/s)
			csvNum(star.vy, 8),            // vy
			csvNum(star.vz, 8),            // vz
			csvNum(star.ra,  16),          // rarad
			csvNum(star.dec, 16),          // decrad
			csvNum(pmrarad,  16),          // pmrarad
			csvNum(pmdecrad, 16),          // pmdecrad
			csvStr(''),                    // bayer (not tracked)
			csvStr(''),                    // flam (not tracked)
			'',                            // con (not tracked, unquoted like original)
			csvNum(null),                  // comp (not tracked)
			csvNum(star.primaryHygId),     // comp_primary
			csvStr(''),                    // base (not tracked)
			csvNum(null),                  // lum (not tracked)
			csvStr(''),                    // var (not tracked)
			'',                            // var_min (not tracked)
			'',                            // var_max (not tracked)
		];
		out.push(row.join(','));
	}
	return out.join('\n') + '\n';
}
