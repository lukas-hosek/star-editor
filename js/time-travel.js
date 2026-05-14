// Time travel: propagates star positions and brightness from J2000 by a year offset.
// The vertex shader does the per-frame work for the GPU buffer; helpers below mirror
// the same math on the CPU for the picker hit-test and the selection-ring uniform.
//
// HYG units (verified against Dubhe 2026-05): x/y/z in parsecs, vx/vy/vz in pc/year.
// (Not km/s, despite some older HYG documentation suggesting otherwise.) Propagation
// is therefore simply newPos_pc = pos_pc + vel_pc_per_yr * dtYears.

import { sphereDir } from './camera.js';


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


// Year label: dt=0 → "Year 2000", dt=+500 → "Year 2500", dt=-2500 → "Year 500 BCE".
// Astronomical year 0 maps to "1 BCE", year -1 to "2 BCE", etc.
export function formatTravelYear(dtYears)
{
	const astroYear = 2000 + dtYears;
	if (astroYear >= 1) return `Year ${astroYear}`;
	return `Year ${1 - astroYear} BCE`;
}
