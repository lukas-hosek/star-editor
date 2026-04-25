// Astronomical math: sidereal time, altitude computation, observer state, and location presets.

import { fwdToAltAz } from './camera.js';

const DEG = Math.PI / 180;
const DEFAULT_LOCATION_PRESET_NAME = 'CZE - Prague';

export const LOCATION_PRESETS = [
	{ name: 'ALB - Tirana', lat: 41.3275 * DEG, lon: 19.8187 * DEG },
	{ name: 'ARG - Buenos Aires', lat: -34.6037 * DEG, lon: -58.3816 * DEG },
	{ name: 'AUS - Perth', lat: -31.9522 * DEG, lon: 115.8613 * DEG },
	{ name: 'AUS - Sydney', lat: -33.8688 * DEG, lon: 151.2093 * DEG },
	{ name: 'AUT - Vienna', lat: 48.2082 * DEG, lon: 16.3738 * DEG },
	{ name: 'BEL - Brussels', lat: 50.8503 * DEG, lon: 4.3517 * DEG },
	{ name: 'BGR - Sofia', lat: 42.6977 * DEG, lon: 23.3219 * DEG },
	{ name: 'BIH - Sarajevo', lat: 43.8563 * DEG, lon: 18.4131 * DEG },
	{ name: 'BLR - Minsk', lat: 53.9006 * DEG, lon: 27.5590 * DEG },
	{ name: 'BRA - Sao Paulo', lat: -23.5505 * DEG, lon: -46.6333 * DEG },
	{ name: 'CAN - Vancouver', lat: 49.2827 * DEG, lon: -123.1207 * DEG },
	{ name: 'CHE - Zurich', lat: 47.3769 * DEG, lon: 8.5417 * DEG },
	{ name: 'CHL - Santiago', lat: -33.4489 * DEG, lon: -70.6693 * DEG },
	{ name: 'CHN - Beijing', lat: 39.9042 * DEG, lon: 116.4074 * DEG },
	{ name: 'COL - Bogota', lat: 4.7110 * DEG, lon: -74.0721 * DEG },
	{ name: 'CYP - Nicosia', lat: 35.1856 * DEG, lon: 33.3823 * DEG },
	{ name: 'CZE - Prague', lat: 50.0755 * DEG, lon: 14.4378 * DEG },
	{ name: 'DEU - Berlin', lat: 52.5200 * DEG, lon: 13.4050 * DEG },
	{ name: 'DNK - Copenhagen', lat: 55.6761 * DEG, lon: 12.5683 * DEG },
	{ name: 'EGY - Cairo', lat: 30.0444 * DEG, lon: 31.2357 * DEG },
	{ name: 'ESP - Barcelona', lat: 41.3874 * DEG, lon: 2.1686 * DEG },
	{ name: 'ESP - Madrid', lat: 40.4168 * DEG, lon: -3.7038 * DEG },
	{ name: 'EST - Tallinn', lat: 59.4370 * DEG, lon: 24.7536 * DEG },
	{ name: 'FIN - Helsinki', lat: 60.1699 * DEG, lon: 24.9384 * DEG },
	{ name: 'FRA - Lyon', lat: 45.7640 * DEG, lon: 4.8357 * DEG },
	{ name: 'FRA - Paris', lat: 48.8566 * DEG, lon: 2.3522 * DEG },
	{ name: 'GBR - Edinburgh', lat: 55.9533 * DEG, lon: -3.1883 * DEG },
	{ name: 'GBR - Greenwich', lat: 51.4769 * DEG, lon: 0.0005 * DEG },
	{ name: 'GBR - London', lat: 51.5074 * DEG, lon: -0.1278 * DEG },
	{ name: 'GRC - Athens', lat: 37.9838 * DEG, lon: 23.7275 * DEG },
	{ name: 'HRV - Zagreb', lat: 45.8150 * DEG, lon: 15.9819 * DEG },
	{ name: 'HUN - Budapest', lat: 47.4979 * DEG, lon: 19.0402 * DEG },
	{ name: 'IND - Mumbai', lat: 19.0760 * DEG, lon: 72.8777 * DEG },
	{ name: 'IRL - Dublin', lat: 53.3498 * DEG, lon: -6.2603 * DEG },
	{ name: 'ISL - Reykjavik', lat: 64.1466 * DEG, lon: -21.9426 * DEG },
	{ name: 'ITA - Milan', lat: 45.4642 * DEG, lon: 9.1900 * DEG },
	{ name: 'ITA - Rome', lat: 41.9028 * DEG, lon: 12.4964 * DEG },
	{ name: 'JPN - Tokyo', lat: 35.6762 * DEG, lon: 139.6503 * DEG },
	{ name: 'KEN - Nairobi', lat: -1.2921 * DEG, lon: 36.8219 * DEG },
	{ name: 'LTU - Vilnius', lat: 54.6872 * DEG, lon: 25.2797 * DEG },
	{ name: 'LUX - Luxembourg', lat: 49.6116 * DEG, lon: 6.1319 * DEG },
	{ name: 'LVA - Riga', lat: 56.9496 * DEG, lon: 24.1052 * DEG },
	{ name: 'MDA - Chisinau', lat: 47.0105 * DEG, lon: 28.8638 * DEG },
	{ name: 'MEX - Mexico City', lat: 19.4326 * DEG, lon: -99.1332 * DEG },
	{ name: 'MKD - Skopje', lat: 41.9981 * DEG, lon: 21.4254 * DEG },
	{ name: 'MLT - Valletta', lat: 35.8989 * DEG, lon: 14.5146 * DEG },
	{ name: 'MNE - Podgorica', lat: 42.4304 * DEG, lon: 19.2594 * DEG },
	{ name: 'NGA - Lagos', lat: 6.5244 * DEG, lon: 3.3792 * DEG },
	{ name: 'NLD - Amsterdam', lat: 52.3676 * DEG, lon: 4.9041 * DEG },
	{ name: 'NOR - Oslo', lat: 59.9139 * DEG, lon: 10.7522 * DEG },
	{ name: 'NZL - Auckland', lat: -36.8509 * DEG, lon: 174.7645 * DEG },
	{ name: 'PER - Lima', lat: -12.0464 * DEG, lon: -77.0428 * DEG },
	{ name: 'POL - Krakow', lat: 50.0647 * DEG, lon: 19.9450 * DEG },
	{ name: 'POL - Warsaw', lat: 52.2297 * DEG, lon: 21.0122 * DEG },
	{ name: 'PRT - Lisbon', lat: 38.7223 * DEG, lon: -9.1393 * DEG },
	{ name: 'ROU - Bucharest', lat: 44.4268 * DEG, lon: 26.1025 * DEG },
	{ name: 'SGP - Singapore', lat: 1.3521 * DEG, lon: 103.8198 * DEG },
	{ name: 'SRB - Belgrade', lat: 44.7866 * DEG, lon: 20.4489 * DEG },
	{ name: 'SVK - Bratislava', lat: 48.1486 * DEG, lon: 17.1077 * DEG },
	{ name: 'SVN - Ljubljana', lat: 46.0569 * DEG, lon: 14.5058 * DEG },
	{ name: 'SWE - Stockholm', lat: 59.3293 * DEG, lon: 18.0686 * DEG },
	{ name: 'TUR - Istanbul', lat: 41.0082 * DEG, lon: 28.9784 * DEG },
	{ name: 'UAE - Dubai', lat: 25.2048 * DEG, lon: 55.2708 * DEG },
	{ name: 'UKR - Kyiv', lat: 50.4501 * DEG, lon: 30.5234 * DEG },
	{ name: 'USA - Anchorage', lat: 61.2181 * DEG, lon: -149.9003 * DEG },
	{ name: 'USA - Honolulu', lat: 21.3099 * DEG, lon: -157.8581 * DEG },
	{ name: 'USA - New York', lat: 40.7128 * DEG, lon: -74.0060 * DEG },
	{ name: 'ZAF - Johannesburg', lat: -26.2041 * DEG, lon: 28.0473 * DEG },
];

export function createObserver() {
	let defaultPreset = LOCATION_PRESETS.find((preset) => preset.name === DEFAULT_LOCATION_PRESET_NAME);
	if (!defaultPreset) {
		console.warn(`createObserver: default preset '${DEFAULT_LOCATION_PRESET_NAME}' not found, falling back to '${LOCATION_PRESETS[0].name}'.`);
		defaultPreset = LOCATION_PRESETS[0];
	}
	return {
		lat: defaultPreset.lat,
		lon: defaultPreset.lon,
		utcMs: Date.now(),
		lst: 0,               // derived by updateObserver()
		zenithWorld: [1, 0, 0], // derived by updateObserver()
	};
}

// Greenwich Mean Sidereal Time in radians for a given UTC epoch (ms since Unix epoch).
export function gmstRadians(utcMs) {
	const T = utcMs / 86400000.0 - 10957.5; // days since J2000.0
	return (((18.697374558 + 24.06570982441908 * T) % 24) + 24) % 24 * (Math.PI / 12);
}

export function lstRadians(utcMs, lonRad) {
	// gmst ∈ [0, 2π); lonRad ∈ [-π, π]; add 2π to keep the sum non-negative
	// before the final wrap (JS % preserves sign of the dividend).
	return (gmstRadians(utcMs) + lonRad + 2 * Math.PI) % (2 * Math.PI);
}

// Altitude of a star in radians given observer lat, Local Sidereal Time, and star RA/Dec.
export function starAltitude(ra, dec, lat, lst) {
	const ha = (lst - ra + 4 * Math.PI) % (2 * Math.PI);
	return Math.asin(
		Math.sin(dec) * Math.sin(lat) +
		Math.cos(dec) * Math.cos(lat) * Math.cos(ha)
	);
}

// Zenith direction as a unit vector in the equatorial world frame.
// Uses the same sphereDir convention as camera.js: x=cos(dec)*cos(ra), y=-cos(dec)*sin(ra), z=sin(dec).
// Zenith is at dec=lat, ra=lst.
export function zenithDir(lat, lst) {
	const cd = Math.cos(lat);
	return [cd * Math.cos(lst), -cd * Math.sin(lst), Math.sin(lat)];
}

// Snapshot the camera's current center alt/az into skyState so the next
// frame can restore it after the zenith updates. Local mode only — other
// modes don't preserve alt/az across observer changes.
export function captureAltAzForRestore(skyState, camera)
{
	if (skyState.mode !== 'local') return;
	const { alt, az } = fwdToAltAz(camera, skyState.observer.zenithWorld);
	skyState.savedAlt = alt;
	skyState.savedAz = az;
	skyState.preserveAltAz = true;
}


// Recompute derived fields (lst, zenithWorld) from observer's utcMs + lon/lat.
export function updateObserver(obs) {
	obs.lst = lstRadians(obs.utcMs, obs.lon);
	obs.zenithWorld = zenithDir(obs.lat, obs.lst);
}

// Fill out[i] = altitude of stars[i] in radians. Allocates a new Float32Array if
// out is missing or the wrong length; otherwise reuses it.
export function computeAltitudes(stars, lat, lst, out) {
	if (!out || out.length !== stars.length) out = new Float32Array(stars.length);
	for (let i = 0; i < stars.length; i++) {
		out[i] = starAltitude(stars[i].ra, stars[i].dec, lat, lst);
	}
	return out;
}

const STORAGE_KEY = 'starEditor_locationPresets';

export function loadUserPresets() {
	try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
	catch { return []; }
}

export function saveUserPresets(presets) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
