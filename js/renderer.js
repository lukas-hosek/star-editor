// WebGL2 star renderer. Additive blending, per-star color (from B-V) and flux
// (from Vmag). A single draw call renders all stars; an extra call renders a
// selection ring on top.

import { ndcToPixel, project, sphereDir } from './camera.js';

const DEG = Math.PI / 180;
const GRID_RA_STEP = 30 * DEG;
const GRID_DEC_STEP = 30 * DEG;
const GRID_SAMPLE_STEP = 3 * DEG;
const GRID_LABELS = [
  { text: '0h', ra: 0 },
  { text: '6h', ra: 90 * DEG },
  { text: '12h', ra: 180 * DEG },
  { text: '18h', ra: 270 * DEG },
];
const GRID_LINE_COLOR = 'rgba(126, 150, 182, 0.24)';
const GRID_EQUATOR_COLOR = 'rgba(146, 172, 206, 0.34)';
const GRID_TEXT_COLOR = 'rgba(204, 214, 230, 0.72)';
const STAR_POINT_SIZE = 2.0;

const STAR_VS = `#version 300 es
in vec3 aPos;
in vec3 aColor;
in float aFlux;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanHalfFov;
uniform float uAspectX;
uniform float uAspectY;
uniform float uBrightness;
uniform float uPointSize;
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
  float k = 1.0 / (1.0 + zc);
  float sx = xc * k;
  float sy = yc * k;
  gl_Position = vec4(sx / (uTanHalfFov * uAspectX),
                     sy / (uTanHalfFov * uAspectY),
                     0.0, 1.0);
  float intensity = aFlux * uBrightness;
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

  const starU = uniforms(gl, starProg, [
    'uRight','uUp','uFwd','uTanHalfFov','uAspectX','uAspectY','uBrightness','uPointSize']);
  const ringU = uniforms(gl, ringProg, [
    'uPos','uRight','uUp','uFwd','uTanHalfFov','uAspectX','uAspectY','uPointSize']);

  const aPosLoc   = gl.getAttribLocation(starProg, 'aPos');
  const aColorLoc = gl.getAttribLocation(starProg, 'aColor');
  const aFluxLoc  = gl.getAttribLocation(starProg, 'aFlux');

  const posBuf  = gl.createBuffer();
  const colBuf  = gl.createBuffer();
  const fluxBuf = gl.createBuffer();

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
  gl.bindVertexArray(null);

  const ringVAO = gl.createVertexArray();  // empty VAO for the ring

  const r = {
    gl, canvas,
    overlayCanvas,
    overlayCtx,
    starProg, starU,
    ringProg, ringU,
    posBuf, colBuf, fluxBuf, vao, ringVAO,

    posCPU:  new Float32Array(0),
    colCPU:  new Float32Array(0),
    fluxCPU: new Float32Array(0),
    capacity: 0,
    count: 0,

    brightness: 1.0,
    pointSize:  STAR_POINT_SIZE,
    gridVisible: false,
    overlayScale: 1,
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
  const oldPos = r.posCPU, oldCol = r.colCPU, oldFlx = r.fluxCPU;
  r.posCPU  = new Float32Array(cap * 3);
  r.colCPU  = new Float32Array(cap * 3);
  r.fluxCPU = new Float32Array(cap);
  r.posCPU.set(oldPos);
  r.colCPU.set(oldCol);
  r.fluxCPU.set(oldFlx);
  r.capacity = cap;
  // Resize GL buffers (DYNAMIC_DRAW, we'll fill next).
  const { gl } = r;
  gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, r.posCPU.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, r.colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, r.colCPU.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, r.fluxBuf);
  gl.bufferData(gl.ARRAY_BUFFER, r.fluxCPU.byteLength, gl.DYNAMIC_DRAW);
}

function writeStarAt(r, i, star) {
  const v = sphereDir(star.ra, star.dec);
  r.posCPU[3*i]   = v[0];
  r.posCPU[3*i+1] = v[1];
  r.posCPU[3*i+2] = v[2];
  r.colCPU[3*i]   = star.color[0];
  r.colCPU[3*i+1] = star.color[1];
  r.colCPU[3*i+2] = star.color[2];
  r.fluxCPU[i]    = star.flux;
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
  gl.bufferSubData(gl.ARRAY_BUFFER, index * 4,  r.fluxCPU.subarray(index, index + 1));
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
  gl.bufferSubData(gl.ARRAY_BUFFER, i * 4,  r.fluxCPU.subarray(i, i + 1));
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
    gl.bufferSubData(gl.ARRAY_BUFFER, index * 4,  r.fluxCPU.subarray(index, index + 1));
  }
  r.count -= 1;
}

export function setBrightness(r, b) { r.brightness = b; }
export function setPointSize(r, s)  { r.pointSize = s; }
export function setGridVisible(r, visible) { r.gridVisible = !!visible; }

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
  const p = project(camera, sphereDir(ra, dec));
  if (!Number.isFinite(p.nx) || !Number.isFinite(p.ny) || p.zc < -0.18) return null;
  const [px, py] = ndcToPixel(camera, p.nx, p.ny);
  const pad = 96;
  if (px < -pad || px > camera.width + pad || py < -pad || py > camera.height + pad) return null;
  return [px, py];
}

function strokeGridCurve(ctx, camera, pointAt, start, end, step) {
  ctx.beginPath();
  let segmentOpen = false;
  for (let t = start; t <= end + step * 0.5; t += step) {
    const [ra, dec] = pointAt(Math.min(t, end));
    const pixel = projectGridPoint(camera, ra, dec);
    if (!pixel) {
      segmentOpen = false;
      continue;
    }
    if (!segmentOpen) {
      ctx.moveTo(pixel[0], pixel[1]);
      segmentOpen = true;
    } else {
      ctx.lineTo(pixel[0], pixel[1]);
    }
  }
  ctx.stroke();
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

function drawGridOverlay(r, camera) {
  const ctx = r.overlayCtx;
  ctx.setTransform(r.overlayScale, 0, 0, r.overlayScale, 0, 0);
  ctx.clearRect(0, 0, camera.width, camera.height);
  if (!r.gridVisible) return;

  ctx.lineWidth = 1;
  ctx.strokeStyle = GRID_LINE_COLOR;
  for (let ra = 0; ra < 2 * Math.PI - GRID_RA_STEP * 0.5; ra += GRID_RA_STEP) {
    strokeGridCurve(ctx, camera, (dec) => [ra, dec], -Math.PI / 2, Math.PI / 2, GRID_SAMPLE_STEP);
  }

  for (let dec = -60 * DEG; dec <= 60 * DEG + GRID_DEC_STEP * 0.5; dec += GRID_DEC_STEP) {
    ctx.strokeStyle = Math.abs(dec) < 1e-6 ? GRID_EQUATOR_COLOR : GRID_LINE_COLOR;
    strokeGridCurve(ctx, camera, (ra) => [ra, dec], 0, 2 * Math.PI, GRID_SAMPLE_STEP);
  }

  drawGridLabels(r, camera);
}

export function render(r, camera, selectedStar) {
  const { gl } = r;
  gl.clear(gl.COLOR_BUFFER_BIT);

  const tanHalf = Math.tan(camera.fov / 2);
  const { ax, ay } = aspectScales(camera.width, camera.height);

  // Stars
  gl.useProgram(r.starProg);
  gl.bindVertexArray(r.vao);
  gl.uniform3f(r.starU.uRight, camera.right[0], camera.right[1], camera.right[2]);
  gl.uniform3f(r.starU.uUp,    camera.up[0],    camera.up[1],    camera.up[2]);
  gl.uniform3f(r.starU.uFwd,   camera.fwd[0],   camera.fwd[1],   camera.fwd[2]);
  gl.uniform1f(r.starU.uTanHalfFov, tanHalf);
  gl.uniform1f(r.starU.uAspectX, ax);
  gl.uniform1f(r.starU.uAspectY, ay);
  gl.uniform1f(r.starU.uBrightness, r.brightness);
  gl.uniform1f(r.starU.uPointSize, r.pointSize);
  gl.drawArrays(gl.POINTS, 0, r.count);
  gl.bindVertexArray(null);

  // Selection ring
  if (selectedStar) {
    gl.useProgram(r.ringProg);
    gl.bindVertexArray(r.ringVAO);
    const v = sphereDir(selectedStar.ra, selectedStar.dec);
    gl.uniform3f(r.ringU.uPos, v[0], v[1], v[2]);
    gl.uniform3f(r.ringU.uRight, camera.right[0], camera.right[1], camera.right[2]);
    gl.uniform3f(r.ringU.uUp,    camera.up[0],    camera.up[1],    camera.up[2]);
    gl.uniform3f(r.ringU.uFwd,   camera.fwd[0],   camera.fwd[1],   camera.fwd[2]);
    gl.uniform1f(r.ringU.uTanHalfFov, tanHalf);
    gl.uniform1f(r.ringU.uAspectX, ax);
    gl.uniform1f(r.ringU.uAspectY, ay);
    gl.uniform1f(r.ringU.uPointSize, 28);
    gl.drawArrays(gl.POINTS, 0, 1);
    gl.bindVertexArray(null);
  }

  drawGridOverlay(r, camera);
}
