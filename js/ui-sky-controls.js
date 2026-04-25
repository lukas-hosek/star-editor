// Sky-section controls: view mode, observer location, presets, and time.

import { LOCATION_PRESETS } from './sky.js';

const DEG_PER_RAD = 180 / Math.PI;
const PRESET_MATCH_EPSILON = 1e-5;


function angularDistance(a, b)
{
	let d = Math.abs(a - b) % (2 * Math.PI);
	if (d > Math.PI) d = 2 * Math.PI - d;
	return d;
}


function coordsMatch(aLat, aLon, bLat, bLon)
{
	return Math.abs(aLat - bLat) <= PRESET_MATCH_EPSILON &&
		angularDistance(aLon, bLon) <= PRESET_MATCH_EPSILON;
}


class SkyLocationManager
{
	constructor(controller, el)
	{
		this.controller = controller;
		this.el = el;
		this.localPreset = null;
		this.userChangedLocation = false;
		this.requestedGeolocation = false;
	}


	getPresetEntries()
	{
		const entries = [];
		const userPresets = this.controller.getUserPresets();
		if (this.localPreset)
		{
			entries.push({
				value: 'local',
				name: 'Local Position',
				lat: this.localPreset.lat,
				lon: this.localPreset.lon,
			});
		}
		for (let i = 0; i < LOCATION_PRESETS.length; i++)
		{
			const preset = LOCATION_PRESETS[i];
			entries.push({
				value: `default:${i}`,
				name: preset.name,
				lat: preset.lat,
				lon: preset.lon,
			});
		}
		for (let i = 0; i < userPresets.length; i++)
		{
			const preset = userPresets[i];
			entries.push({
				value: `user:${i}`,
				name: preset.name,
				lat: preset.lat,
				lon: preset.lon,
			});
		}
		return entries;
	}


	getEntryByValue(value)
	{
		for (const entry of this.getPresetEntries())
		{
			if (entry.value === value)
			{
				return entry;
			}
		}
		return null;
	}


	setInputValues(lat, lon)
	{
		this.el['sky-lat'].value = (lat * DEG_PER_RAD).toFixed(4);
		this.el['sky-lon'].value = (lon * DEG_PER_RAD).toFixed(4);
	}


	populatePresets(selectedValue)
	{
		const sel = this.el['sky-preset'];
		const desiredValue = selectedValue === undefined ? sel.value : selectedValue;
		sel.innerHTML = '';
		for (const entry of this.getPresetEntries())
		{
			const opt = document.createElement('option');
			opt.value = entry.value;
			opt.textContent = entry.name;
			sel.appendChild(opt);
		}
		const custom = document.createElement('option');
		custom.value = 'custom';
		custom.textContent = '\u2014 Custom \u2014';
		sel.appendChild(custom);
		if (desiredValue === 'custom' || this.getEntryByValue(desiredValue))
		{
			sel.value = desiredValue;
		}
		else
		{
			sel.value = 'custom';
		}
	}


	syncSelectionToObserver()
	{
		const obs = this.controller.getObserver();
		for (const entry of this.getPresetEntries())
		{
			if (coordsMatch(obs.lat, obs.lon, entry.lat, entry.lon))
			{
				this.el['sky-preset'].value = entry.value;
				return;
			}
		}
		this.el['sky-preset'].value = 'custom';
	}


	syncFromObserver()
	{
		const obs = this.controller.getObserver();
		this.setInputValues(obs.lat, obs.lon);
		this.syncSelectionToObserver();
	}


	applyPreset(value)
	{
		const entry = this.getEntryByValue(value);
		if (!entry)
		{
			return;
		}
		this.userChangedLocation = true;
		this.setInputValues(entry.lat, entry.lon);
		this.controller.setObserverLocation(entry.lat, entry.lon);
		this.el['sky-preset'].value = value;
	}


	applyManualInput()
	{
		const lat = parseFloat(this.el['sky-lat'].value) / DEG_PER_RAD;
		const lon = parseFloat(this.el['sky-lon'].value) / DEG_PER_RAD;
		if (!isFinite(lat) || !isFinite(lon))
		{
			return;
		}
		this.userChangedLocation = true;
		this.controller.setObserverLocation(lat, lon);
		this.el['sky-preset'].value = 'custom';
	}


	saveCurrentPreset(name)
	{
		this.userChangedLocation = true;
		this.controller.saveLocationPreset(name);
		this.populatePresets(`user:${this.controller.getUserPresets().length - 1}`);
	}


	applyGeolocation(position)
	{
		this.localPreset = {
			lat: position.coords.latitude / DEG_PER_RAD,
			lon: position.coords.longitude / DEG_PER_RAD,
		};
		this.populatePresets(this.el['sky-preset'].value || 'custom');
		if (this.userChangedLocation)
		{
			return;
		}
		this.controller.setObserverLocation(this.localPreset.lat, this.localPreset.lon);
		this.syncFromObserver();
	}


	requestGeolocation()
	{
		if (this.requestedGeolocation)
		{
			return;
		}
		this.requestedGeolocation = true;
		if (!('geolocation' in navigator))
		{
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) =>
			{
				this.applyGeolocation(position);
			},
			() =>
			{
			},
			{
				timeout: 5000,
				maximumAge: 300000,
			}
		);
	}


	initialize()
	{
		this.populatePresets('custom');
		this.syncFromObserver();
		this.requestGeolocation();
	}
}


export function createSkyControls(controller, el)
{
	const skyLocationManager = new SkyLocationManager(controller, el);

	function syncSkyTime()
	{
		const obs = controller.getObserver();
		const d = new Date(obs.utcMs);
		el['sky-date'].value = d.toISOString().slice(0, 10);
		const secs = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
		el['sky-time-slider'].value = secs;
		const hh = String(d.getUTCHours()).padStart(2, '0');
		const mm = String(d.getUTCMinutes()).padStart(2, '0');
		const ss = String(d.getUTCSeconds()).padStart(2, '0');
		el['sky-time-readout'].textContent = `${hh}:${mm}:${ss}`;
	}


	for (const btn of el['sky-mode-toggle'].querySelectorAll('.sky-mode-btn'))
	{
		btn.addEventListener('click', () =>
		{
			controller.setSkyMode(btn.dataset.mode);
			for (const modeBtn of el['sky-mode-toggle'].querySelectorAll('.sky-mode-btn'))
			{
				modeBtn.classList.toggle('active', modeBtn.dataset.mode === btn.dataset.mode);
			}
		});
	}


	el['sky-preset'].addEventListener('change', () =>
	{
		const value = el['sky-preset'].value;
		if (value === 'custom') return;
		skyLocationManager.applyPreset(value);
	});


	function onLatLonInput()
	{
		skyLocationManager.applyManualInput();
	}


	el['sky-lat'].addEventListener('input', onLatLonInput);
	el['sky-lon'].addEventListener('input', onLatLonInput);


	el['btn-save-preset'].addEventListener('click', () =>
	{
		const name = prompt('Preset name:');
		if (!name || !name.trim()) return;
		skyLocationManager.saveCurrentPreset(name.trim());
	});


	el['sky-date'].addEventListener('change', () =>
	{
		el['sky-time-live'].checked = false;
		controller.setTimeLocked(true);
		const parts = el['sky-date'].value.split('-').map(Number);
		if (parts.length !== 3 || parts.some(isNaN)) return;
		const d = new Date(controller.getObserver().utcMs);
		d.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
		controller.setObserverTime(d.getTime());
	});


	el['sky-time-slider'].addEventListener('input', () =>
	{
		el['sky-time-live'].checked = false;
		controller.setTimeLocked(true);
		const secs = parseInt(el['sky-time-slider'].value, 10);
		const d = new Date(controller.getObserver().utcMs);
		d.setUTCHours(Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60, 0);
		const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
		const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
		const ss = String(secs % 60).padStart(2, '0');
		el['sky-time-readout'].textContent = `${hh}:${mm}:${ss}`;
		controller.setObserverTime(d.getTime());
	});


	el['sky-time-live'].addEventListener('change', () =>
	{
		controller.setTimeLocked(!el['sky-time-live'].checked);
		if (!controller.isTimeLocked())
		{
			controller.setObserverTime(Date.now());
			syncSkyTime();
		}
	});


	skyLocationManager.initialize();
	syncSkyTime();

	return { syncSkyTime };
}