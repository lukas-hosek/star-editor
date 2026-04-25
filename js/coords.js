// Shared coordinate conversion helpers for UI display and catalog serialization.

const HRS_PER_RAD = 12 / Math.PI;
const DEG_PER_RAD = 180 / Math.PI;


// Propagate sub-unit overflow from rounded seconds → minutes → major.
// `major` is hours (HMS) or degrees (DMS). Returns { major, m, s }.
function carrySexagesimal(major, m, s)
{
	if (s >= 60)
	{
		s -= 60;
		m += 1;
	}
	if (m >= 60)
	{
		m -= 60;
		major += 1;
	}
	return { major, m, s };
}


export function radiansToHMS(ra, secondDecimals = 1)
{
	const r = ((ra % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	const total = r * HRS_PER_RAD;
	const hRaw = Math.floor(total);
	const rem = (total - hRaw) * 60;
	const mRaw = Math.floor(rem);
	const scale = Math.pow(10, secondDecimals);
	const sRaw = Math.round((rem - mRaw) * 60 * scale) / scale;
	let { major: h, m, s } = carrySexagesimal(hRaw, mRaw, sRaw);
	if (h >= 24) h -= 24;
	return { h, m, s };
}


export function radiansToDMS(dec)
{
	const sign = dec < 0 ? '-' : '+';
	const abs = Math.abs(dec) * DEG_PER_RAD;
	const dRaw = Math.floor(abs);
	const rem = (abs - dRaw) * 60;
	const mRaw = Math.floor(rem);
	const sRaw = Math.round((rem - mRaw) * 60);
	let { major: d, m, s } = carrySexagesimal(dRaw, mRaw, sRaw);
	if (d > 90)
	{
		d = 90;
		m = 0;
		s = 0;
	}
	return { sign, d, m, s };
}


export function hmsToRadians(h, m, s)
{
	return ((h + m / 60 + s / 3600) * 15) * Math.PI / 180;
}


export function dmsToRadians(sign, d, m, s)
{
	const signNum = sign === '-' ? -1 : 1;
	return signNum * (d + m / 60 + s / 3600) * Math.PI / 180;
}