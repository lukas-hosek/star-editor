// BSC5 star name decoding for the sidebar title.
// Exports: formatSidebarTitle(star)

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


export function formatSidebarTitle(star)
{
	const displayName = formatSidebarTitleName(star.Name);
	return displayName ? `${displayName} (HR ${star.HR})` : `HR ${star.HR}`;
}
