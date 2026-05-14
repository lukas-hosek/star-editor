// Time travel: propagates star positions and brightness from J2000 by a year offset.
// The vertex shader does the per-frame work for the GPU buffer; helpers below mirror
// the same math on the CPU for the picker hit-test and the selection-ring uniform.
//
// HYG units (verified against Dubhe 2026-05): x/y/z in parsecs, vx/vy/vz in pc/year.
// (Not km/s, despite some older HYG documentation suggesting otherwise.) Propagation
// is therefore simply newPos_pc = pos_pc + vel_pc_per_yr * dtYears.

import { sphereDir } from './camera.js';


const AS2R = Math.PI / (180 * 3600);


function isFiniteNum(v)
{
	return typeof v === 'number' && isFinite(v);
}


function hasKinematics(star)
{
	return isFiniteNum(star.x) && isFiniteNum(star.y) && isFiniteNum(star.z)
		&& isFiniteNum(star.vx) && isFiniteNum(star.vy) && isFiniteNum(star.vz)
		&& isFiniteNum(star.absmag);
}


// Single-star CPU mirror of the vertex shader's propagation. Returns the renderer-
// convention unit direction vector and the apparent flux at the given year offset.
// At dtYears = 0 we short-circuit to the catalog values to avoid producing NaNs for
// stars that lack HYG kinematics (BSC stars, newly added stars). Once time travel is
// active those stars propagate from whatever (likely zero) values they carry — the
// resulting direction may be degenerate and that's by design.
export function displayedDirAndFlux(star, dtYears)
{
	if (dtYears === 0)
	{
		return { dir: sphereDir(star.ra, star.dec), flux: star.flux };
	}

	const nx = star.x + star.vx * dtYears;
	const ny = star.y + star.vy * dtYears;
	const nz = star.z + star.vz * dtYears;
	const newDist = Math.sqrt(nx * nx + ny * ny + nz * nz);
	// HYG cartesian → renderer convention applies a y-flip; see sphereDir in camera.js.
	const dir = [nx / newDist, -ny / newDist, nz / newDist];
	const newVmag = star.absmag + 5 * Math.log10(newDist) - 5;
	const flux = Math.pow(10, -newVmag / 2.5);
	return { dir, flux };
}


// Bake the propagated state back into the catalog fields of `star`. Rewrites
// ra/dec/x/y/z/Vmag/Parallax/pmRA/pmDE in place so that, at dtYears=0, the star
// renders exactly where the time-travel display had it. Returns true if the star
// was baked, false if skipped (dt=0 or kinematics missing). Velocities and
// absmag are left untouched — they are intrinsic to the star, not epoch-bound.
export function bakeStar(star, dtYears)
{
	if (dtYears === 0) return false;
	if (!hasKinematics(star)) return false;

	const nx = star.x + star.vx * dtYears;
	const ny = star.y + star.vy * dtYears;
	const nz = star.z + star.vz * dtYears;
	const newDist = Math.sqrt(nx * nx + ny * ny + nz * nz);

	star.x = nx;
	star.y = ny;
	star.z = nz;
	star.Vmag = star.absmag + 5 * Math.log10(newDist) - 5;
	star.Parallax = 1 / newDist;
	let newRa = Math.atan2(ny, nx);
	if (newRa < 0) newRa += 2 * Math.PI;
	star.ra = newRa;
	star.dec = Math.asin(nz / newDist);

	// Proper motion at the new epoch from the same kinematics. East/north
	// bases at the new RA/Dec; v_ra and v_dec are pc/yr in those directions.
	// HYG's pmra column stores the great-circle rate (μ_α · cos δ), so dividing
	// by dist gives that directly — no extra cos δ factor.
	const sinRa = Math.sin(star.ra);
	const cosRa = Math.cos(star.ra);
	const sinDec = Math.sin(star.dec);
	const cosDec = Math.cos(star.dec);
	const v_ra  = -star.vx * sinRa + star.vy * cosRa;
	const v_dec = -star.vx * sinDec * cosRa - star.vy * sinDec * sinRa + star.vz * cosDec;
	star.pmRA = (v_ra  / newDist) / AS2R;
	star.pmDE = (v_dec / newDist) / AS2R;

	return true;
}


// Year label: dt=0 → "Year 2000", dt=+500 → "Year 2500", dt=-2500 → "Year 500 BCE".
// Astronomical year 0 maps to "1 BCE", year -1 to "2 BCE", etc.
export function formatTravelYear(dtYears)
{
	const astroYear = 2000 + dtYears;
	if (astroYear >= 1) return `Year ${astroYear}`;
	return `Year ${1 - astroYear} BCE`;
}
