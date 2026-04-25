// WebGL2 star renderer. Additive blending, per-star color (from B-V) and flux
// (from Vmag). A single draw call renders all stars; an extra call renders a
// selection ring on top.

import { drawGridOverlay } from './renderer-overlay.js';
import { createRendererPipeline, drawRenderPipeline } from './renderer-pipeline.js';
import { createStarBuffers } from './renderer-star-buffer.js';

const STAR_POINT_SIZE = 2.0;


export {
	appendStar,
	removeAt,
	setAltitudes,
	syncAll,
	syncOne,
} from './renderer-star-buffer.js';


export function createRenderer(canvas, overlayCanvas)
{
	const gl = canvas.getContext('webgl2', {
		antialias: true,
		alpha: false,
		premultipliedAlpha: false,
	});
	if (!gl) throw new Error('WebGL2 not supported in this browser');
	const overlayCtx = overlayCanvas.getContext('2d');

	const pipeline = createRendererPipeline(gl);
	const starBuffers = createStarBuffers(gl, pipeline.starProg);

	const renderer = {
		gl,
		canvas,
		overlayCanvas,
		overlayCtx,
		...pipeline,
		...starBuffers,

		brightness: 1.0,
		pointSize: STAR_POINT_SIZE,
		raDecGridVisible: false,
		altAzGridVisible: false,
		overlayScale: 1,
		horizonMode: 0,
		dimFactor: 0.18,
		zenith: null,
	};

	gl.clearColor(0, 0, 0, 1);
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE);

	return renderer;
}


export function setBrightness(renderer, brightness)
{
	renderer.brightness = brightness;
}


export function setPointSize(renderer, pointSize)
{
	renderer.pointSize = pointSize;
}


export function setRADecGridVisible(renderer, visible)
{
	renderer.raDecGridVisible = !!visible;
}


export function setAltAzGridVisible(renderer, visible)
{
	renderer.altAzGridVisible = !!visible;
}


export function setHorizonMode(renderer, mode, dimFactor)
{
	renderer.horizonMode = mode;
	if (dimFactor !== undefined) renderer.dimFactor = dimFactor;
}


export function setZenith(renderer, zenith)
{
	renderer.zenith = zenith;
}


export function resize(renderer, cssWidth, cssHeight, dpr)
{
	const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
	const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
	if (renderer.canvas.width !== pixelWidth || renderer.canvas.height !== pixelHeight)
	{
		renderer.canvas.width = pixelWidth;
		renderer.canvas.height = pixelHeight;
	}
	if (renderer.overlayCanvas.width !== pixelWidth || renderer.overlayCanvas.height !== pixelHeight)
	{
		renderer.overlayCanvas.width = pixelWidth;
		renderer.overlayCanvas.height = pixelHeight;
	}
	renderer.overlayScale = dpr;
	renderer.gl.viewport(0, 0, pixelWidth, pixelHeight);
}


export function render(renderer, camera, selectedStar)
{
	drawRenderPipeline(renderer, camera, selectedStar);
	drawGridOverlay(renderer, camera);
}
