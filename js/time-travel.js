// Time travel: propagates star positions and brightness from J2000 by a year offset.
// The vertex shader does the per-frame work for the GPU buffer; helpers below mirror
// the same math on the CPU for the picker hit-test and the selection-ring uniform.
//
// HYG units (verified against Dubhe 2026-05): x/y/z in parsecs, vx/vy/vz in pc/year.
// (Not km/s, despite some older HYG documentation suggesting otherwise.) Propagation
// is therefore simply newPos_pc = pos_pc + vel_pc_per_yr * dtYears.

import { sphereDir } from './camera.js';


// HYG sentinel distance (100000 pc) gate — matches the Manage dialog's filter and
// keeps stars with unknown distance from "moving" based on a fabricated baseline.
const PARALLAX_MIN = 1 / 99999;


// True iff the star has all six HYG Cartesian fields finite AND a real parallax.
// Stars without this are treated as non-kinematic and stay at their catalog positions.
export function hasKinematics(star)
{
	return Number.isFinite(star.x) && Number.isFinite(star.y) && Number.isFinite(star.z)
		&& Number.isFinite(star.vx) && Number.isFinite(star.vy) && Number.isFinite(star.vz)
		&& star.Parallax !== null && star.Parallax > PARALLAX_MIN;
}


// Single-star CPU mirror of the vertex shader's propagation. Returns the renderer-
// convention unit direction vector and the apparent flux at the given year offset.
// Falls back to the catalog values when dtYears is 0 or the star lacks kinematics.
export function displayedDirAndFlux(star, dtYears)
{
	if (dtYears === 0 || !hasKinematics(star))
	{
		return { dir: sphereDir(star.ra, star.dec), flux: star.flux };
	}

	const nx = star.x + star.vx * dtYears;
	const ny = star.y + star.vy * dtYears;
	const nz = star.z + star.vz * dtYears;
	const newDist = Math.sqrt(nx * nx + ny * ny + nz * nz);
	// HYG cartesian → renderer convention applies a y-flip; see sphereDir in camera.js.
	const dir = [nx / newDist, -ny / newDist, nz / newDist];

	let flux = star.flux;
	if (star.absmag !== null && Number.isFinite(star.absmag))
	{
		const newVmag = star.absmag + 5 * Math.log10(newDist) - 5;
		flux = Math.pow(10, -newVmag / 2.5);
	}

	return { dir, flux };
}


// Year label: dt=0 → "Year 2000", dt=+500 → "Year 2500", dt=-2500 → "Year 500 BCE".
// Astronomical year 0 maps to "1 BCE", year -1 to "2 BCE", etc.
export function formatTravelYear(dtYears)
{
	const astroYear = 2000 + dtYears;
	if (astroYear >= 1) return `Year ${astroYear}`;
	return `Year ${1 - astroYear} BCE`;
}
