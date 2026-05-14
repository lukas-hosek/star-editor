// Modal dialog for catalog management: filtering and format-specific export.

export function createManageUI(controller)
{
	const el = {};
	const ids = [
		'manage-overlay', 'mgr-close',
		'mgr-rm-kinematics', 'mgr-rm-faint', 'mgr-faint-mag',
		'mgr-process', 'mgr-stats', 'mgr-export-hyg', 'mgr-export-bsc',
	];
	for (const id of ids) el[id] = document.getElementById(id);


	function openManage()  { el['manage-overlay'].classList.remove('hidden'); }
	function closeManage() { el['manage-overlay'].classList.add('hidden'); }


	el['mgr-close'].addEventListener('click', closeManage);

	el['mgr-rm-faint'].addEventListener('change', () => {
		el['mgr-faint-mag'].disabled = !el['mgr-rm-faint'].checked;
	});

	el['mgr-process'].addEventListener('click', () => {
		const { removed, before } = controller.processCatalog({
			removeInvalidKinematics: el['mgr-rm-kinematics'].checked,
			removeFainterThan: el['mgr-rm-faint'].checked
				? parseFloat(el['mgr-faint-mag'].value)
				: null,
		});
		const pct = before > 0 ? Math.round(removed / before * 100) : 0;
		el['mgr-stats'].textContent = removed > 0
			? `Removed ${removed.toLocaleString()} (${pct} %) stars`
			: 'No stars removed';
	});

	el['manage-overlay'].addEventListener('click', e => {
		if (e.target === el['manage-overlay']) closeManage();
	});

	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') closeManage();
	});


	async function performExport(format)
	{
		try {
			const text = controller.serializeAs(format);
			const base = (controller.fileName || 'catalog').replace(/\.[^.]+$/, '');
			const suggestedName = base + (format === 'hyg' ? '.csv' : '.bsc');
			const supportsFileSystemAccess = window.isSecureContext && 'showSaveFilePicker' in window;
			if (supportsFileSystemAccess) {
				const types = format === 'hyg'
					? [{ description: 'HYG Star Catalog', accept: { 'text/csv': ['.csv'] } }]
					: [{ description: 'Bright Star Catalogue', accept: { 'text/plain': ['.txt', '.dat', '.bsc'] } }];
				const handle = await window.showSaveFilePicker({ suggestedName, types });
				const writable = await handle.createWritable();
				await writable.write(text);
				await writable.close();
			}
			else {
				const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const a = Object.assign(document.createElement('a'),
					{ href: url, download: suggestedName, hidden: true });
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 0);
			}
		}
		catch (err) {
			if (err.name !== 'AbortError') console.error(err);
		}
	}

	el['mgr-export-hyg'].addEventListener('click', () => performExport('hyg'));
	el['mgr-export-bsc'].addEventListener('click', () => performExport('bsc'));

	return { openManage };
}
