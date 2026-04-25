// Shared coordinate conversion helpers for UI display and catalog serialization.

const HRS_PER_RAD = 12 / Math.PI;
const DEG_PER_RAD = 180 / Math.PI;


export function radiansToHMS(ra, secondDecimals = 1)
{
	let r = ((ra % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	const total = r * HRS_PER_RAD;
	let h = Math.floor(total);
	let rem = (total - h) * 60;
	let m = Math.floor(rem);
	let s = (rem - m) * 60;
	const scale = Math.pow(10, secondDecimals);
	s = Math.round(s * scale) / scale;
	if (s >= 60)
	{
		s -= 60;
		m += 1;
	}
	if (m >= 60)
	{
		m -= 60;
		h += 1;
	}
	if (h >= 24)
	{
		h -= 24;
	}
	return { h, m, s };
}


export function radiansToDMS(dec)
{
	const sign = dec < 0 ? '-' : '+';
	let abs = Math.abs(dec) * DEG_PER_RAD;
	let d = Math.floor(abs);
	let rem = (abs - d) * 60;
	let m = Math.floor(rem);
	let s = Math.round((rem - m) * 60);
	if (s >= 60)
	{
		s -= 60;
		m += 1;
	}
	if (m >= 60)
	{
		m -= 60;
		d += 1;
	}
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