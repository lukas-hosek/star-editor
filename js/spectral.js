// Spectral type decoding for BSC5 SpType strings.
// Exports: decodeSpectralClass(spType), formatDistance(parallaxArcsec, unit)

const LUMINOSITY_CLASS_NAMES = {
	Iab: 'Supergiant',
	Ia:  'Supergiant',
	Ib:  'Supergiant',
	I:   'Supergiant',
	II:  'Bright giant',
	III: 'Giant',
	IV:  'Subgiant',
	V:   'Main sequence',
	VI:  'Subdwarf',
};


// Classifies a single spectral type component (no '+') into a spectral class
// letter (O B A F G K M …) and a luminosity class name (Giant, Supergiant …).
// Either field may be null if the component doesn't encode it.
// Returns null when nothing useful can be extracted.
function classifyComponent(s)
{
	if (!s) return null;
	s = s.trim();
	if (!s) return null;

	// Special prefixes that override the standard letter+Roman-numeral scheme.
	// 'sd' = subdwarf prefix (e.g. sdM2); D = white dwarf family (DA, DB, DC …);
	// W[NCO] = Wolf-Rayet nitrogen/carbon/oxygen subtypes.
	if (/^sd/i.test(s)) return { letter: null, name: 'Subdwarf' };
	if (/^D[A-Z0-9]?/.test(s)) return { letter: null, name: 'White dwarf' };
	if (/^W[NCO]/i.test(s)) return { letter: null, name: 'Wolf-Rayet' };

	// Leading letter encodes temperature / colour (O hottest → M coolest, plus
	// exotic carbon/S-type classes C, S, R).
	const letterMatch = s.match(/^([OBAFGKMCSR])/);
	const letter = letterMatch ? letterMatch[1] : null;

	// Luminosity class Roman numeral appears after the subclass digit(s) and any
	// peculiarity flags. Longest alternatives are listed first so 'III' beats 'II',
	// 'Iab' beats 'Ia', etc.
	const lcMatch = s.match(/Iab|Ia|Ib|III|II|IV|VI|V|I/);
	if (!lcMatch) return letter ? { letter, name: null } : null;
	const name = LUMINOSITY_CLASS_NAMES[lcMatch[0]];
	return name ? { letter, name } : (letter ? { letter, name: null } : null);
}


function formatComponent(result)
{
	if (!result) return null;
	if (result.letter && result.name) return `Class ${result.letter} ${result.name}`;
	if (result.letter) return `Class ${result.letter}`;
	return result.name ?? null;
}


// Decodes a BSC5 SpType string into a human-readable class description.
// Handles binary/multiple systems ('+'-separated), spectral qualifiers,
// and special types (Wolf-Rayet, white dwarf, subdwarf).
export function decodeSpectralClass(spType)
{
	if (!spType) return null;
	const s = spType.trim();
	if (!s) return null;

	// Split binary/multiple systems on '+', but only when the '+' is followed by
	// a spectral class starting character. A bare '+' before a Roman numeral is a
	// spectral qualifier (e.g. 'G8+III' = "slightly later than G8"), not a
	// component separator.
	const parts = s.split(/\+(?=[OBAFGKMWCSRDs])/).map((p) => p.trim()).filter(Boolean);
	const labels = parts.map(classifyComponent).map(formatComponent).filter(Boolean);
	return labels.length > 0 ? labels.join(' · ') : null;
}


// Converts a BSC5 trigonometric parallax (arcseconds) to a formatted distance
// string in the requested unit ('pc' or 'ly').
export function formatDistance(parallaxArcsec, unit)
{
	if (!parallaxArcsec || parallaxArcsec <= 0) return null;
	const pc = 1 / parallaxArcsec;
	if (!isFinite(pc)) return null;
	const value = unit === 'ly' ? pc * 3.26156 : pc;
	const suffix = unit === 'ly' ? 'ly' : 'pc';
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${suffix}`;
}
