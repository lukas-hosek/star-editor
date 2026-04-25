import { altAzDir, localHorizonBasis, ndcToPixel, project, sphereDir } from './camera.js';

const DEG = Math.PI / 180;
const GRID_RA_STEP = 30 * DEG;
const GRID_DEC_STEP = 30 * DEG;
const ALTAZ_AZ_STEP = 30 * DEG;
const ALTAZ_ALT_STEP = 30 * DEG;
const GRID_SAMPLE_STEP = 3 * DEG;
const GRID_LABELS = [
	{ text: '0h', ra: 0 },
	{ text: '6h', ra: 90 * DEG },
	{ text: '12h', ra: 180 * DEG },
	{ text: '18h', ra: 270 * DEG },
];
const ALTAZ_LABELS = [
	{ text: 'N', az: 0 },
	{ text: 'E', az: Math.PI / 2 },
	{ text: 'S', az: Math.PI },
	{ text: 'W', az: 3 * Math.PI / 2 },
];
const GRID_LINE_COLOR = 'rgba(126, 150, 182, 0.24)';
const GRID_EQUATOR_COLOR = 'rgba(146, 172, 206, 0.34)';
const GRID_TEXT_COLOR = 'rgba(204, 214, 230, 0.72)';


function projectGridPoint(camera, ra, dec)
{
	return projectWorldPoint(camera, sphereDir(ra, dec));
}


function projectWorldPoint(camera, point)
{
	const p = project(camera, point);
	if (!Number.isFinite(p.nx) || !Number.isFinite(p.ny) || p.zc < -0.18) return null;
	const [px, py] = ndcToPixel(camera, p.nx, p.ny);
	const pad = 96;
	if (px < -pad || px > camera.width + pad || py < -pad || py > camera.height + pad) return null;
	return [px, py];
}


function strokeProjectedCurve(ctx, camera, pointAt, start, end, step)
{
	ctx.beginPath();
	let segmentOpen = false;
	for (let t = start; t <= end + step * 0.5; t += step)
	{
		const pixel = projectWorldPoint(camera, pointAt(Math.min(t, end)));
		if (!pixel)
		{
			segmentOpen = false;
			continue;
		}
		if (!segmentOpen)
		{
			ctx.moveTo(pixel[0], pixel[1]);
			segmentOpen = true;
		}
		else
		{
			ctx.lineTo(pixel[0], pixel[1]);
		}
	}
	ctx.stroke();
}


function drawGridLabels(r, camera)
{
	const ctx = r.overlayCtx;
	ctx.font = '11px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = GRID_TEXT_COLOR;
	ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
	ctx.shadowBlur = 6;

	for (const label of GRID_LABELS)
	{
		const pixel = projectGridPoint(camera, label.ra, 0);
		if (!pixel) continue;
		const x = Math.max(24, Math.min(camera.width - 24, pixel[0]));
		const y = Math.max(14, Math.min(camera.height - 14, pixel[1] - 10));
		ctx.fillText(label.text, x, y);
	}

	ctx.shadowBlur = 0;
}


function drawAltAzLabels(r, camera, basis)
{
	const ctx = r.overlayCtx;
	ctx.font = '12px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = GRID_TEXT_COLOR;
	ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
	ctx.shadowBlur = 6;

	for (const label of ALTAZ_LABELS)
	{
		const pixel = projectWorldPoint(camera, altAzDir(0, label.az, r.zenith, basis));
		if (!pixel) continue;
		let dx = pixel[0] - camera.width * 0.5;
		let dy = pixel[1] - camera.height * 0.5;
		const len = Math.hypot(dx, dy);
		if (len < 1e-3)
		{
			dx = 0;
			dy = -1;
		}
		else
		{
			dx /= len;
			dy /= len;
		}
		const x = Math.max(16, Math.min(camera.width - 16, pixel[0] + dx * 12));
		const y = Math.max(16, Math.min(camera.height - 16, pixel[1] + dy * 12));
		ctx.fillText(label.text, x, y);
	}

	ctx.shadowBlur = 0;
}


function drawRADecGridOverlay(r, camera)
{
	if (!r.gridVisible) return;

	const ctx = r.overlayCtx;
	ctx.lineWidth = 1;
	ctx.strokeStyle = GRID_LINE_COLOR;
	for (let ra = 0; ra < 2 * Math.PI - GRID_RA_STEP * 0.5; ra += GRID_RA_STEP)
	{
		strokeProjectedCurve(ctx, camera, (dec) => sphereDir(ra, dec), -Math.PI / 2, Math.PI / 2, GRID_SAMPLE_STEP);
	}

	for (let dec = -60 * DEG; dec <= 60 * DEG + GRID_DEC_STEP * 0.5; dec += GRID_DEC_STEP)
	{
		ctx.strokeStyle = Math.abs(dec) < 1e-6 ? GRID_EQUATOR_COLOR : GRID_LINE_COLOR;
		strokeProjectedCurve(ctx, camera, (ra) => sphereDir(ra, dec), 0, 2 * Math.PI, GRID_SAMPLE_STEP);
	}

	drawGridLabels(r, camera);
}


function drawAltAzGridOverlay(r, camera)
{
	if (!r.altAzGridVisible || !r.zenith) return;

	const ctx = r.overlayCtx;
	const basis = localHorizonBasis(r.zenith);

	ctx.lineWidth = 1;
	ctx.strokeStyle = GRID_LINE_COLOR;
	for (let az = 0; az < 2 * Math.PI - ALTAZ_AZ_STEP * 0.5; az += ALTAZ_AZ_STEP)
	{
		strokeProjectedCurve(ctx, camera, (alt) => altAzDir(alt, az, r.zenith, basis), -Math.PI / 2, Math.PI / 2, GRID_SAMPLE_STEP);
	}

	for (let alt = -60 * DEG; alt <= 60 * DEG + ALTAZ_ALT_STEP * 0.5; alt += ALTAZ_ALT_STEP)
	{
		ctx.strokeStyle = Math.abs(alt) < 1e-6 ? GRID_EQUATOR_COLOR : GRID_LINE_COLOR;
		strokeProjectedCurve(ctx, camera, (az) => altAzDir(alt, az, r.zenith, basis), 0, 2 * Math.PI, GRID_SAMPLE_STEP);
	}

	ctx.strokeStyle = GRID_LINE_COLOR;
	drawAltAzLabels(r, camera, basis);
}


export function drawGridOverlay(r, camera)
{
	const ctx = r.overlayCtx;
	ctx.setTransform(r.overlayScale, 0, 0, r.overlayScale, 0, 0);
	ctx.clearRect(0, 0, camera.width, camera.height);
	if (!r.gridVisible && !r.altAzGridVisible) return;

	drawRADecGridOverlay(r, camera);
	drawAltAzGridOverlay(r, camera);
}