// WebGL2 star renderer. Additive blending, per-star color (from B-V) and flux
// (from Vmag). A single draw call renders all stars; an extra call renders a
// selection ring on top.

import { add, cross, ndcToPixel, normalize, project, scale, sphereDir, sub } from './camera.js';

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
const STAR_POINT_SIZE = 2.0;

const STAR_VS = `#version 300 es
in vec3 aPos;
in vec3 aColor;
in float aFlux;
in float aAlt;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanHalfFov;
uniform float uAspectX;
uniform float uAspectY;
uniform float uBrightness;
uniform float uPointSize;
uniform int uHorizonMode;
uniform float uDimFactor;
out vec3 vColor;
void main() {
  float xc = dot(aPos, uRight);
  float yc = dot(aPos, uUp);
  float zc = dot(aPos, uFwd);
  if (zc < -0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    return;
  }
  if (uHorizonMode == 2 && aAlt < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    return;
  }
  float k = 1.0 / (1.0 + zc);
  float sx = xc * k;
  float sy = yc * k;
  gl_Position = vec4(sx / (uTanHalfFov * uAspectX),
                     sy / (uTanHalfFov * uAspectY),
                     0.0, 1.0);
  float dimMult = (uHorizonMode == 1 && aAlt < 0.0) ? uDimFactor : 1.0;
  float intensity = aFlux * uBrightness * dimMult;
  vColor = aColor * intensity;
  gl_PointSize = uPointSize;
}
`;

const STAR_FS = `#version 300 es
precision highp float;
in vec3 vColor;
uniform float uPointSize;
out vec4 fragColor;
void main() {
  vec2 pixelDelta = abs(gl_PointCoord - vec2(0.5)) * uPointSize;
  vec2 tent = max(vec2(0.0), vec2(1.0) - pixelDelta);
  float weight = tent.x * tent.y;
  if (weight <= 0.0) discard;
  fragColor = vec4(vColor * weight, weight);
}
`;

const RING_VS = `#version 300 es
uniform vec3 uPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanHalfFov;
uniform float uAspectX;
uniform float uAspectY;
uniform float uPointSize;
void main() {
  float xc = dot(uPos, uRight);
  float yc = dot(uPos, uUp);
  float zc = dot(uPos, uFwd);
  if (zc < -0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float k = 1.0 / (1.0 + zc);
  gl_Position = vec4(xc * k / (uTanHalfFov * uAspectX),
                     yc * k / (uTanHalfFov * uAspectY),
                     0.0, 1.0);
  gl_PointSize = uPointSize;
}
`;

const RING_FS = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.05 || r < 0.72) discard;
  float a = smoothstep(0.72, 0.80, r) * (1.0 - smoothstep(0.95, 1.05, r));
  fragColor = vec4(vec3(0.36, 0.89, 1.0) * a, a);
}
`;

const GROUND_VS = `#version 300 es
in vec2 aPos;
out vec2 vNDC;
void main() {
  vNDC = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const GROUND_FS = `#version 300 es
precision highp float;
in vec2 vNDC;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanHalfFov;
uniform float uAspectX;
uniform float uAspectY;
uniform vec3 uZenith;
out vec4 fragColor;
void main() {
  float sx = vNDC.x * uTanHalfFov * uAspectX;
  float sy = vNDC.y * uTanHalfFov * uAspectY;
  float r2 = sx * sx + sy * sy;
  float inv = 1.0 / (1.0 + r2);
  vec3 camDir = vec3(2.0 * sx, 2.0 * sy, 1.0 - r2) * inv;
  vec3 worldDir = camDir.x * uRight + camDir.y * uUp + camDir.z * uFwd;
  float altitude = dot(worldDir, uZenith);
  float fade = smoothstep(0.0, -0.02, altitude);
  if (fade <= 0.0) discard;
  float g = 0.05 * fade;
  fragColor = vec4(g, g, g, 1.0);
}
`;

function compile(gl, type, src) {
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(sh);
		gl.deleteShader(sh);
		throw new Error('Shader compile error: ' + log);
	}
	return sh;
}


function link(gl, vsSrc, fsSrc) {
	const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
	const prog = gl.createProgram();
	gl.attachShader(prog, vs);
	gl.attachShader(prog, fs);
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(prog);
		gl.deleteProgram(prog);
		throw new Error('Program link error: ' + log);
	}
	return prog;
}


function uniforms(gl, prog, names) {
	const u = {};
	for (const n of names) u[n] = gl.getUniformLocation(prog, n);
	return u;
}


function aspectScales(width, height) {
	return width < height
		? { ax: 1, ay: height / width }
		: { ax: width / height, ay: 1 };
}


export function createRenderer(canvas, overlayCanvas) {
	const gl = canvas.getContext('webgl2', {
		antialias: true,
		alpha: false,
		premultipliedAlpha: false,
	});
	if (!gl) throw new Error('WebGL2 not supported in this browser');
	const overlayCtx = overlayCanvas.getContext('2d');

	const starProg = link(gl, STAR_VS, STAR_FS);
	const ringProg = link(gl, RING_VS, RING_FS);
	const groundProg = link(gl, GROUND_VS, GROUND_FS);

	const starU = uniforms(gl, starProg, [
		'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uBrightness', 'uPointSize',
		'uHorizonMode', 'uDimFactor']);
	const ringU = uniforms(gl, ringProg, [
		'uPos', 'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uPointSize']);
	const groundU = uniforms(gl, groundProg, [
		'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uZenith']);

	const aPosLoc = gl.getAttribLocation(starProg, 'aPos');
	const aColorLoc = gl.getAttribLocation(starProg, 'aColor');
	const aFluxLoc = gl.getAttribLocation(starProg, 'aFlux');
	const aAltLoc = gl.getAttribLocation(starProg, 'aAlt');

	const posBuf = gl.createBuffer();
	const colBuf = gl.createBuffer();
	const fluxBuf = gl.createBuffer();
	const altBuf = gl.createBuffer();

	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
	gl.enableVertexAttribArray(aPosLoc);
	gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
	gl.enableVertexAttribArray(aColorLoc);
	gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, fluxBuf);
	gl.enableVertexAttribArray(aFluxLoc);
	gl.vertexAttribPointer(aFluxLoc, 1, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, altBuf);
	gl.enableVertexAttribArray(aAltLoc);
	gl.vertexAttribPointer(aAltLoc, 1, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);

	const ringVAO = gl.createVertexArray();  // empty VAO for the ring

	const groundQuadBuf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, groundQuadBuf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
	const groundVAO = gl.createVertexArray();
	gl.bindVertexArray(groundVAO);
	gl.bindBuffer(gl.ARRAY_BUFFER, groundQuadBuf);
	const aPosLocGround = gl.getAttribLocation(groundProg, 'aPos');
	gl.enableVertexAttribArray(aPosLocGround);
	gl.vertexAttribPointer(aPosLocGround, 2, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);

	const r = {
		gl, canvas,
		overlayCanvas,
		overlayCtx,
		starProg, starU,
		ringProg, ringU,
		groundProg, groundU, groundVAO,
		posBuf, colBuf, fluxBuf, altBuf, vao, ringVAO,

		posCPU: new Float32Array(0),
		colCPU: new Float32Array(0),
		fluxCPU: new Float32Array(0),
		altCPU: new Float32Array(0),
		capacity: 0,
		count: 0,

		brightness: 1.0,
		pointSize: STAR_POINT_SIZE,
		gridVisible: false,
		altAzGridVisible: false,
		overlayScale: 1,
		horizonMode: 0,
		dimFactor: 0.18,
		zenith: null,
	};

	gl.clearColor(0, 0, 0, 1);
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE);  // additive

	return r;
}


function ensureCapacity(r, n) {
	if (n <= r.capacity) return;
	let cap = Math.max(16, r.capacity);
	while (cap < n) cap *= 2;
	const oldPos = r.posCPU, oldCol = r.colCPU, oldFlx = r.fluxCPU, oldAlt = r.altCPU;
	r.posCPU = new Float32Array(cap * 3);
	r.colCPU = new Float32Array(cap * 3);
	r.fluxCPU = new Float32Array(cap);
	r.altCPU = new Float32Array(cap);
	r.posCPU.set(oldPos);
	r.colCPU.set(oldCol);
	r.fluxCPU.set(oldFlx);
	r.altCPU.set(oldAlt);
	r.capacity = cap;
	// Resize GL buffers (DYNAMIC_DRAW, we'll fill next).
	const { gl } = r;
	gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
	gl.bufferData(gl.ARRAY_BUFFER, r.posCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, r.colBuf);
	gl.bufferData(gl.ARRAY_BUFFER, r.colCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, r.fluxBuf);
	gl.bufferData(gl.ARRAY_BUFFER, r.fluxCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, r.altBuf);
	gl.bufferData(gl.ARRAY_BUFFER, r.altCPU.byteLength, gl.DYNAMIC_DRAW);
}


function writeStarAt(r, i, star) {
	const v = sphereDir(star.ra, star.dec);
	r.posCPU[3 * i] = v[0];
	r.posCPU[3 * i + 1] = v[1];
	r.posCPU[3 * i + 2] = v[2];
	r.colCPU[3 * i] = star.color[0];
	r.colCPU[3 * i + 1] = star.color[1];
	r.colCPU[3 * i + 2] = star.color[2];
	r.fluxCPU[i] = star.flux;
}


// Rebuild all buffers from a stars array.
export function syncAll(r, stars) {
	const n = stars.length;
	ensureCapacity(r, n);
	for (let i = 0; i < n; i++) writeStarAt(r, i, stars[i]);
	r.count = n;
	const { gl } = r;
	gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, r.posCPU.subarray(0, n * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, r.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, r.colCPU.subarray(0, n * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, r.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, r.fluxCPU.subarray(0, n));
}


// Update a single star slot after an edit.
export function syncOne(r, index, star) {
	if (index < 0 || index >= r.count) return;
	writeStarAt(r, index, star);
	const { gl } = r;
	gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, r.posCPU.subarray(index * 3, index * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, r.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, r.colCPU.subarray(index * 3, index * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, r.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, r.fluxCPU.subarray(index, index + 1));
}


// Append a new star (for the "Add Star" button).
export function appendStar(r, star) {
	ensureCapacity(r, r.count + 1);
	writeStarAt(r, r.count, star);
	const { gl } = r;
	const i = r.count;
	gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, i * 12, r.posCPU.subarray(i * 3, i * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, r.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, i * 12, r.colCPU.subarray(i * 3, i * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, r.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, i * 4, r.fluxCPU.subarray(i, i + 1));
	r.count += 1;
}


// Swap-and-pop: move last star into slot `index`, shrink count.
// Caller must do the same on the CPU stars[] array.
export function removeAt(r, index, stars) {
	if (index < 0 || index >= r.count) return;
	const lastIdx = r.count - 1;
	if (index !== lastIdx) {
		writeStarAt(r, index, stars[index]);
		// After the CPU-side swap, stars[index] already contains what was stars[lastIdx].
		const { gl } = r;
		gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, r.posCPU.subarray(index * 3, index * 3 + 3));
		gl.bindBuffer(gl.ARRAY_BUFFER, r.colBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, r.colCPU.subarray(index * 3, index * 3 + 3));
		gl.bindBuffer(gl.ARRAY_BUFFER, r.fluxBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, r.fluxCPU.subarray(index, index + 1));
	}
	r.count -= 1;
}


export function setBrightness(r, b) {
	r.brightness = b;
}


export function setPointSize(r, s) {
	r.pointSize = s;
}


export function setGridVisible(r, visible) {
	r.gridVisible = !!visible;
}


export function setAltAzGridVisible(r, visible) {
	r.altAzGridVisible = !!visible;
}


export function setHorizonMode(r, mode, dimFactor) {
	r.horizonMode = mode;
	if (dimFactor !== undefined) r.dimFactor = dimFactor;
}


export function setZenith(r, zenith) {
	r.zenith = zenith;
}


// Upload per-star altitudes (Float32Array, radians) to the GPU.
// Called each frame when horizonMode > 0.
export function setAltitudes(r, altitudes) {
	const n = Math.min(altitudes.length, r.count);
	if (n === 0) return;
	r.altCPU.set(altitudes.subarray(0, n));
	const { gl } = r;
	gl.bindBuffer(gl.ARRAY_BUFFER, r.altBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, r.altCPU.subarray(0, n));
}


// Resize the backing framebuffer to match device-pixel viewport.
export function resize(r, cssWidth, cssHeight, dpr) {
	const w = Math.max(1, Math.floor(cssWidth * dpr));
	const h = Math.max(1, Math.floor(cssHeight * dpr));
	if (r.canvas.width !== w || r.canvas.height !== h) {
		r.canvas.width = w;
		r.canvas.height = h;
	}
	if (r.overlayCanvas.width !== w || r.overlayCanvas.height !== h) {
		r.overlayCanvas.width = w;
		r.overlayCanvas.height = h;
	}
	r.overlayScale = dpr;
	r.gl.viewport(0, 0, w, h);
}


function projectGridPoint(camera, ra, dec) {
	return projectWorldPoint(camera, sphereDir(ra, dec));
}


function projectWorldPoint(camera, point) {
	const p = project(camera, point);
	if (!Number.isFinite(p.nx) || !Number.isFinite(p.ny) || p.zc < -0.18) return null;
	const [px, py] = ndcToPixel(camera, p.nx, p.ny);
	const pad = 96;
	if (px < -pad || px > camera.width + pad || py < -pad || py > camera.height + pad) return null;
	return [px, py];
}


function strokeProjectedCurve(ctx, camera, pointAt, start, end, step) {
	ctx.beginPath();
	let segmentOpen = false;
	for (let t = start; t <= end + step * 0.5; t += step) {
		const pixel = projectWorldPoint(camera, pointAt(Math.min(t, end)));
		if (!pixel) {
			segmentOpen = false;
			continue;
		}
		if (!segmentOpen) {
			ctx.moveTo(pixel[0], pixel[1]);
			segmentOpen = true;
		}
		else {
			ctx.lineTo(pixel[0], pixel[1]);
		}
	}
	ctx.stroke();
}


function localHorizonBasis(zenith) {
	const Z = [0, 0, 1];
	let northLocal = sub(Z, scale(zenith, zenith[2]));
	const northLen = Math.hypot(northLocal[0], northLocal[1], northLocal[2]);
	if (northLen < 1e-6) {
		northLocal = [1, 0, 0];
	}
	else {
		northLocal = scale(northLocal, 1 / northLen);
	}
	const eastLocal = normalize(cross(zenith, northLocal));
	return { northLocal, eastLocal };
}


function altAzDir(alt, az, zenith, basis) {
	const { northLocal, eastLocal } = basis;
	const ca = Math.cos(alt);
	const sa = Math.sin(alt);
	const cz = Math.cos(az);
	const sz = Math.sin(az);
	return normalize(add(
		add(scale(northLocal, ca * cz), scale(eastLocal, ca * sz)),
		scale(zenith, sa)));
}


function drawGridLabels(r, camera) {
	const ctx = r.overlayCtx;
	ctx.font = '11px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = GRID_TEXT_COLOR;
	ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
	ctx.shadowBlur = 6;

	for (const label of GRID_LABELS) {
		const pixel = projectGridPoint(camera, label.ra, 0);
		if (!pixel) continue;
		const x = Math.max(24, Math.min(camera.width - 24, pixel[0]));
		const y = Math.max(14, Math.min(camera.height - 14, pixel[1] - 10));
		ctx.fillText(label.text, x, y);
	}

	ctx.shadowBlur = 0;
}


function drawAltAzLabels(r, camera, basis) {
	const ctx = r.overlayCtx;
	ctx.font = '12px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = GRID_TEXT_COLOR;
	ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
	ctx.shadowBlur = 6;

	for (const label of ALTAZ_LABELS) {
		const pixel = projectWorldPoint(camera, altAzDir(0, label.az, r.zenith, basis));
		if (!pixel) continue;
		let dx = pixel[0] - camera.width * 0.5;
		let dy = pixel[1] - camera.height * 0.5;
		const len = Math.hypot(dx, dy);
		if (len < 1e-3) {
			dx = 0;
			dy = -1;
		}
		else {
			dx /= len;
			dy /= len;
		}
		const x = Math.max(16, Math.min(camera.width - 16, pixel[0] + dx * 12));
		const y = Math.max(16, Math.min(camera.height - 16, pixel[1] + dy * 12));
		ctx.fillText(label.text, x, y);
	}

	ctx.shadowBlur = 0;
}


function drawRADecGridOverlay(r, camera) {
	if (!r.gridVisible) return;

	const ctx = r.overlayCtx;
	ctx.lineWidth = 1;
	ctx.strokeStyle = GRID_LINE_COLOR;
	for (let ra = 0; ra < 2 * Math.PI - GRID_RA_STEP * 0.5; ra += GRID_RA_STEP) {
		strokeProjectedCurve(ctx, camera, (dec) => sphereDir(ra, dec), -Math.PI / 2, Math.PI / 2, GRID_SAMPLE_STEP);
	}

	for (let dec = -60 * DEG; dec <= 60 * DEG + GRID_DEC_STEP * 0.5; dec += GRID_DEC_STEP) {
		ctx.strokeStyle = Math.abs(dec) < 1e-6 ? GRID_EQUATOR_COLOR : GRID_LINE_COLOR;
		strokeProjectedCurve(ctx, camera, (ra) => sphereDir(ra, dec), 0, 2 * Math.PI, GRID_SAMPLE_STEP);
	}

	drawGridLabels(r, camera);
}


function drawAltAzGridOverlay(r, camera) {
	if (!r.altAzGridVisible || !r.zenith) return;

	const ctx = r.overlayCtx;
	const basis = localHorizonBasis(r.zenith);

	ctx.lineWidth = 1;
	ctx.strokeStyle = GRID_LINE_COLOR;
	for (let az = 0; az < 2 * Math.PI - ALTAZ_AZ_STEP * 0.5; az += ALTAZ_AZ_STEP) {
		strokeProjectedCurve(ctx, camera, (alt) => altAzDir(alt, az, r.zenith, basis), -Math.PI / 2, Math.PI / 2, GRID_SAMPLE_STEP);
	}

	for (let alt = -60 * DEG; alt <= 60 * DEG + ALTAZ_ALT_STEP * 0.5; alt += ALTAZ_ALT_STEP) {
		ctx.strokeStyle = Math.abs(alt) < 1e-6 ? GRID_EQUATOR_COLOR : GRID_LINE_COLOR;
		strokeProjectedCurve(ctx, camera, (az) => altAzDir(alt, az, r.zenith, basis), 0, 2 * Math.PI, GRID_SAMPLE_STEP);
	}

	ctx.strokeStyle = GRID_LINE_COLOR;
	drawAltAzLabels(r, camera, basis);
}


function drawGridOverlay(r, camera) {
	const ctx = r.overlayCtx;
	ctx.setTransform(r.overlayScale, 0, 0, r.overlayScale, 0, 0);
	ctx.clearRect(0, 0, camera.width, camera.height);
	if (!r.gridVisible && !r.altAzGridVisible) return;

	drawRADecGridOverlay(r, camera);
	drawAltAzGridOverlay(r, camera);
}


export function render(r, camera, selectedStar) {
	const { gl } = r;
	gl.clear(gl.COLOR_BUFFER_BIT);

	const tanHalf = Math.tan(camera.fov / 2);
	const { ax, ay } = aspectScales(camera.width, camera.height);

	// Ground fill (below-horizon region)
	if (r.horizonMode > 0 && r.zenith) {
		gl.useProgram(r.groundProg);
		gl.bindVertexArray(r.groundVAO);
		gl.uniform3f(r.groundU.uRight, camera.right[0], camera.right[1], camera.right[2]);
		gl.uniform3f(r.groundU.uUp, camera.up[0], camera.up[1], camera.up[2]);
		gl.uniform3f(r.groundU.uFwd, camera.fwd[0], camera.fwd[1], camera.fwd[2]);
		gl.uniform1f(r.groundU.uTanHalfFov, tanHalf);
		gl.uniform1f(r.groundU.uAspectX, ax);
		gl.uniform1f(r.groundU.uAspectY, ay);
		gl.uniform3f(r.groundU.uZenith, r.zenith[0], r.zenith[1], r.zenith[2]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
	}

	// Stars
	gl.useProgram(r.starProg);
	gl.bindVertexArray(r.vao);
	gl.uniform3f(r.starU.uRight, camera.right[0], camera.right[1], camera.right[2]);
	gl.uniform3f(r.starU.uUp, camera.up[0], camera.up[1], camera.up[2]);
	gl.uniform3f(r.starU.uFwd, camera.fwd[0], camera.fwd[1], camera.fwd[2]);
	gl.uniform1f(r.starU.uTanHalfFov, tanHalf);
	gl.uniform1f(r.starU.uAspectX, ax);
	gl.uniform1f(r.starU.uAspectY, ay);
	gl.uniform1f(r.starU.uBrightness, r.brightness);
	gl.uniform1f(r.starU.uPointSize, r.pointSize);
	gl.uniform1i(r.starU.uHorizonMode, r.horizonMode);
	gl.uniform1f(r.starU.uDimFactor, r.dimFactor);
	gl.drawArrays(gl.POINTS, 0, r.count);
	gl.bindVertexArray(null);

	// Selection ring
	if (selectedStar) {
		gl.useProgram(r.ringProg);
		gl.bindVertexArray(r.ringVAO);
		const v = sphereDir(selectedStar.ra, selectedStar.dec);
		gl.uniform3f(r.ringU.uPos, v[0], v[1], v[2]);
		gl.uniform3f(r.ringU.uRight, camera.right[0], camera.right[1], camera.right[2]);
		gl.uniform3f(r.ringU.uUp, camera.up[0], camera.up[1], camera.up[2]);
		gl.uniform3f(r.ringU.uFwd, camera.fwd[0], camera.fwd[1], camera.fwd[2]);
		gl.uniform1f(r.ringU.uTanHalfFov, tanHalf);
		gl.uniform1f(r.ringU.uAspectX, ax);
		gl.uniform1f(r.ringU.uAspectY, ay);
		gl.uniform1f(r.ringU.uPointSize, 28);
		gl.drawArrays(gl.POINTS, 0, 1);
		gl.bindVertexArray(null);
	}

	drawGridOverlay(r, camera);
}
