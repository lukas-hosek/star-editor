// Star selection panel: selection state, form rendering, and edit propagation.

import {
	radiansToHMS as radiansToFormHMS,
	radiansToDMS as radiansToFormDMS,
	hmsToRadians as formHMSToRadians,
	dmsToRadians as formDMSToRadians,
} from './coords.js';

import { decodeSpectralClass, formatDistance } from './spectral.js';
import { formatSidebarTitle } from './star-name.js';


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
		el['f-hyg-id'].value = star.hygId  ?? '';
		el['f-hd'].value    = star.HD      ?? '';
		el['f-gliese'].value = star.glieseId ?? '';
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
