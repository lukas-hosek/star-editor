import { sphereDir } from './camera.js';


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


function compile(gl, type, src)
{
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
	{
		const log = gl.getShaderInfoLog(sh);
		gl.deleteShader(sh);
		throw new Error('Shader compile error: ' + log);
	}
	return sh;
}


function link(gl, vsSrc, fsSrc)
{
	const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
	const prog = gl.createProgram();
	gl.attachShader(prog, vs);
	gl.attachShader(prog, fs);
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
	{
		const log = gl.getProgramInfoLog(prog);
		gl.deleteProgram(prog);
		throw new Error('Program link error: ' + log);
	}
	return prog;
}


function uniforms(gl, prog, names)
{
	const u = {};
	for (const n of names)
	{
		u[n] = gl.getUniformLocation(prog, n);
	}
	return u;
}


function aspectScales(width, height)
{
	return width < height
		? { ax: 1, ay: height / width }
		: { ax: width / height, ay: 1 };
}


export function createRendererPipeline(gl)
{
	const starProg = link(gl, STAR_VS, STAR_FS);
	const ringProg = link(gl, RING_VS, RING_FS);
	const groundProg = link(gl, GROUND_VS, GROUND_FS);

	const starU = uniforms(gl, starProg, [
		'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uBrightness', 'uPointSize',
		'uHorizonMode', 'uDimFactor',
	]);
	const ringU = uniforms(gl, ringProg, [
		'uPos', 'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uPointSize',
	]);
	const groundU = uniforms(gl, groundProg, [
		'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uZenith',
	]);

	const ringVAO = gl.createVertexArray();
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

	return {
		starProg,
		starU,
		ringProg,
		ringU,
		groundProg,
		groundU,
		groundQuadBuf,
		groundVAO,
		ringVAO,
	};
}


export function drawRenderPipeline(r, camera, selectedStar)
{
	const { gl } = r;
	gl.clear(gl.COLOR_BUFFER_BIT);

	const tanHalf = Math.tan(camera.fov / 2);
	const { ax, ay } = aspectScales(camera.width, camera.height);

	if (r.horizonMode > 0 && r.zenith)
	{
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

	if (selectedStar)
	{
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
}