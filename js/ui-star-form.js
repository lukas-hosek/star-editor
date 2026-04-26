// Star selection panel: selection state, form rendering, and edit propagation.

import {
	radiansToHMS as radiansToFormHMS,
	radiansToDMS as radiansToFormDMS,
	hmsToRadians as formHMSToRadians,
	dmsToRadians as formDMSToRadians,
} from './coords.js';


function numOr(s, fb)
{
	if (s === '' || s === null || s === undefined) return fb;
	const n = parseFloat(s);
	return isFinite(n) ? n : fb;
}


function fmt(n, d)
{
	return (n === null || n === undefined || !isFinite(n)) ? '' : n.toFixed(d);
}


const GREEK_LETTER_SYMBOLS = {
	Alp: 'α',
	Bet: 'β',
	Gam: 'γ',
	Del: 'δ',
	Eps: 'ε',
	Zet: 'ζ',
	Eta: 'η',
	The: 'θ',
	Iot: 'ι',
	Kap: 'κ',
	Lam: 'λ',
	Mu: 'μ',
	Nu: 'ν',
	Xi: 'ξ',
	Omi: 'ο',
	Pi: 'π',
	Rho: 'ρ',
	Sig: 'σ',
	Tau: 'τ',
	Ups: 'υ',
	Phi: 'φ',
	Chi: 'χ',
	Psi: 'ψ',
	Ome: 'ω',
};


const CONSTELLATION_GENITIVES = {
	And: 'Andromedae',
	Ant: 'Antliae',
	Aps: 'Apodis',
	Aql: 'Aquilae',
	Aqr: 'Aquarii',
	Ara: 'Arae',
	Ari: 'Arietis',
	Aur: 'Aurigae',
	Boo: 'Bootis',
	Cae: 'Caeli',
	Cam: 'Camelopardalis',
	Cap: 'Capricorni',
	Car: 'Carinae',
	Cas: 'Cassiopeiae',
	Cen: 'Centauri',
	Cep: 'Cephei',
	Cet: 'Ceti',
	Cha: 'Chamaeleontis',
	Cir: 'Circini',
	CMa: 'Canis Majoris',
	CMi: 'Canis Minoris',
	Cnc: 'Cancri',
	Col: 'Columbae',
	Com: 'Comae Berenices',
	CrA: 'Coronae Australis',
	CrB: 'Coronae Borealis',
	Crt: 'Crateris',
	Cru: 'Crucis',
	Crv: 'Corvi',
	CVn: 'Canum Venaticorum',
	Cyg: 'Cygni',
	Del: 'Delphini',
	Dor: 'Doradus',
	Dra: 'Draconis',
	Equ: 'Equulei',
	Eri: 'Eridani',
	For: 'Fornacis',
	Gem: 'Geminorum',
	Gru: 'Gruis',
	Her: 'Herculis',
	Hor: 'Horologii',
	Hya: 'Hydrae',
	Hyi: 'Hydri',
	Ind: 'Indi',
	Lac: 'Lacertae',
	Leo: 'Leonis',
	Lep: 'Leporis',
	Lib: 'Librae',
	LMi: 'Leonis Minoris',
	Lup: 'Lupi',
	Lyn: 'Lyncis',
	Lyr: 'Lyrae',
	Men: 'Mensae',
	Mic: 'Microscopii',
	Mon: 'Monocerotis',
	Mus: 'Muscae',
	Nor: 'Normae',
	Oct: 'Octantis',
	Oph: 'Ophiuchi',
	Ori: 'Orionis',
	Pav: 'Pavonis',
	Peg: 'Pegasi',
	Per: 'Persei',
	Phe: 'Phoenicis',
	Pic: 'Pictoris',
	PsA: 'Piscis Austrini',
	Psc: 'Piscium',
	Pup: 'Puppis',
	Pyx: 'Pyxidis',
	Ret: 'Reticuli',
	Scl: 'Sculptoris',
	Sco: 'Scorpii',
	Sct: 'Scuti',
	Ser: 'Serpentis',
	Sex: 'Sextantis',
	Sge: 'Sagittae',
	Sgr: 'Sagittarii',
	Tau: 'Tauri',
	Tel: 'Telescopii',
	TrA: 'Trianguli Australis',
	Tri: 'Trianguli',
	Tuc: 'Tucanae',
	UMa: 'Ursae Majoris',
	UMi: 'Ursae Minoris',
	Vel: 'Velorum',
	Vir: 'Virginis',
	Vol: 'Volantis',
	Vul: 'Vulpeculae',
};

const GREEK_BAYER_TOKENS = Object.keys(GREEK_LETTER_SYMBOLS)
	.sort((left, right) => right.length - left.length)
	.join('|');

const CONSTELLATION_TOKENS = Object.keys(CONSTELLATION_GENITIVES)
	.sort((left, right) => right.length - left.length)
	.join('|');

const SIMPLE_BAYER_TITLE_NAME_RE = new RegExp(
	`^(${GREEK_BAYER_TOKENS})\\s+(${CONSTELLATION_TOKENS})$`
);

const COMPONENT_BAYER_TITLE_NAME_RE = new RegExp(
	`^(${GREEK_BAYER_TOKENS})\\s*(\\d{1,3})\\s*(${CONSTELLATION_TOKENS})$`
);

const FLAMSTEED_TITLE_NAME_RE = new RegExp(
	`^(\\d{1,3})\\s+(${CONSTELLATION_TOKENS})$`
);

const LEADING_FLAMSTEED_RE = /^\d{1,3}\s*/;

const SUPERSCRIPT_DIGITS = {
	0: '⁰',
	1: '¹',
	2: '²',
	3: '³',
	4: '⁴',
	5: '⁵',
	6: '⁶',
	7: '⁷',
	8: '⁸',
	9: '⁹',
};


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


function decodeSpectralClass(spType)
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


function formatDistance(parallaxArcsec, unit)
{
	if (!parallaxArcsec || parallaxArcsec <= 0) return null;
	const pc = 1 / parallaxArcsec;
	if (!isFinite(pc)) return null;
	const value = unit === 'ly' ? pc * 3.26156 : pc;
	const suffix = unit === 'ly' ? 'ly' : 'pc';
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${suffix}`;
}


function superscriptDigits(text)
{
	return text.split('').map((digit) => SUPERSCRIPT_DIGITS[digit] ?? digit).join('');
}


function formatSidebarTitleName(name)
{
	if (!name) return '';

	const trimmedName = name.trim();
	const normalizedName = trimmedName.replace(/\s+/g, ' ');
	let match = normalizedName.match(FLAMSTEED_TITLE_NAME_RE);
	if (match)
	{
		const constellation = CONSTELLATION_GENITIVES[match[2]];
		if (!constellation) return trimmedName;

		return `${match[1]} ${constellation}`;
	}

	const bayerName = normalizedName.replace(LEADING_FLAMSTEED_RE, '');

	match = bayerName.match(COMPONENT_BAYER_TITLE_NAME_RE);
	if (match)
	{
		const greekLetter = GREEK_LETTER_SYMBOLS[match[1]];
		const constellation = CONSTELLATION_GENITIVES[match[3]];
		if (!greekLetter || !constellation) return trimmedName;

		return `${greekLetter}${superscriptDigits(match[2])} ${constellation}`;
	}

	match = bayerName.match(SIMPLE_BAYER_TITLE_NAME_RE);
	if (!match) return trimmedName;

	const greekLetter = GREEK_LETTER_SYMBOLS[match[1]];
	const constellation = CONSTELLATION_GENITIVES[match[2]];
	if (!greekLetter || !constellation) return trimmedName;

	return `${greekLetter} ${constellation}`;
}


function formatSidebarTitle(star)
{
	const displayName = formatSidebarTitleName(star.Name);
	return displayName ? `${displayName} (HR ${star.HR})` : `HR ${star.HR}`;
}


export function createStarFormUI(controller, el)
{
	let distUnit = 'pc';


	function updateSubtitle(star)
	{
		const classText = star ? decodeSpectralClass(star.SpType) : null;
		const distText  = star ? formatDistance(star.Parallax, distUnit) : null;

		const hasContent = !!(classText || distText);
		el['panel-subtitle'].classList.toggle('hidden', !hasContent);
		if (!hasContent) return;

		el['subtitle-class'].textContent = classText ?? '';
		el['subtitle-dist'].textContent  = distText  ?? '';
		if (distText) {
			el['subtitle-dist'].dataset.clickable = '';
		} else {
			delete el['subtitle-dist'].dataset.clickable;
		}
	}


	function onFormInput()
	{
		const star = controller.selectedStar();
		if (!star) return;
		star.Name = el['f-name'].value.slice(0, 10);
		star.ra = formHMSToRadians(
			numOr(el['f-ra-h'].value, 0),
			numOr(el['f-ra-m'].value, 0),
			numOr(el['f-ra-s'].value, 0));
		star.dec = formDMSToRadians(
			el['f-de-sign'].value,
			numOr(el['f-de-d'].value, 0),
			numOr(el['f-de-m'].value, 0),
			numOr(el['f-de-s'].value, 0));
		star.Vmag = numOr(el['f-vmag'].value, star.Vmag);
		const bvStr = el['f-bv'].value.trim();
		star.BV = bvStr === '' ? null : numOr(bvStr, star.BV);
		star.SpType = el['f-sp'].value.slice(0, 20);
		const pmr = el['f-pmra'].value.trim();
		star.pmRA = pmr === '' ? null : numOr(pmr, star.pmRA);
		const pmd = el['f-pmde'].value.trim();
		star.pmDE = pmd === '' ? null : numOr(pmd, star.pmDE);
		const plx = el['f-plx'].value.trim();
		star.Parallax = plx === '' ? null : numOr(plx, star.Parallax);
		const rv = el['f-rv'].value.trim();
		star.RadVel = rv === '' ? null : Math.round(numOr(rv, star.RadVel || 0));

		controller.onStarEdited();
		updateSubtitle(star);
	}


	const formInputs = [
		'f-name', 'f-ra-h', 'f-ra-m', 'f-ra-s',
		'f-de-sign', 'f-de-d', 'f-de-m', 'f-de-s',
		'f-vmag', 'f-bv', 'f-sp', 'f-pmra', 'f-pmde', 'f-plx', 'f-rv'
	];
	for (const id of formInputs)
	{
		el[id].addEventListener('input', onFormInput);
		el[id].addEventListener('change', onFormInput);
	}

	el['subtitle-dist'].addEventListener('click', () => {
		distUnit = distUnit === 'pc' ? 'ly' : 'pc';
		updateSubtitle(controller.selectedStar());
	});


	function showNoSelection()
	{
		el['panel-form'].classList.add('hidden');
		el['panel-empty'].classList.remove('hidden');
		el['btn-delete'].disabled = true;
	}


	function refreshSelection(star)
	{
		if (!star) return;
		el['panel-title'].textContent = formatSidebarTitle(star);
		el['f-hr'].value = star.HR ?? '';
		el['f-name'].value = star.Name ?? '';
		const hms = radiansToFormHMS(star.ra);
		el['f-ra-h'].value = hms.h;
		el['f-ra-m'].value = hms.m;
		el['f-ra-s'].value = hms.s.toFixed(1);
		const dms = radiansToFormDMS(star.dec);
		el['f-de-sign'].value = dms.sign;
		el['f-de-d'].value = dms.d;
		el['f-de-m'].value = dms.m;
		el['f-de-s'].value = dms.s;
		el['f-vmag'].value = fmt(star.Vmag, 2);
		el['f-bv'].value = fmt(star.BV, 2);
		el['f-sp'].value = star.SpType ?? '';
		el['f-pmra'].value = fmt(star.pmRA, 3);
		el['f-pmde'].value = fmt(star.pmDE, 3);
		el['f-plx'].value = fmt(star.Parallax, 3);
		el['f-rv'].value = (star.RadVel === null || star.RadVel === undefined) ? '' : star.RadVel;
		updateSubtitle(star);
	}


	function showSelection(star)
	{
		el['panel-empty'].classList.add('hidden');
		el['panel-form'].classList.remove('hidden');
		el['btn-delete'].disabled = false;
		refreshSelection(star);
	}


	return {
		showNoSelection,
		showSelection,
		refreshSelection,
		focusName()
		{
			el['f-name'].focus();
		},
	};
}