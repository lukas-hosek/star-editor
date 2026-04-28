import { sphereDir } from './camera.js';


const STAR_VS_TENT = `#version 300 es
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

const STAR_VS_RCOS = `#version 300 es
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
	vec3 rawColor = aColor * intensity;
	float peak = max(rawColor.r, max(rawColor.g, rawColor.b));
	if (peak > 1.0) {
		vColor = rawColor / peak;
		gl_PointSize = uPointSize * pow(peak, 0.33);
	}
	else {
		vColor = rawColor;
		gl_PointSize = uPointSize;
	}
}
`;

const STAR_FS_TENT = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
void main() {
	vec2 delta = abs(gl_PointCoord - vec2(0.5)) * 2.0;
	vec2 tent = max(vec2(0.0), vec2(1.0) - delta);
	float weight = tent.x * tent.y;
	if (weight <= 0.0) discard;
	fragColor = vec4(vColor * weight, weight);
}
`;

const STAR_FS_RCOS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
void main() {
	vec2 delta = gl_PointCoord - vec2(0.5);
	float radius = length(delta) * 2.0;
	if (radius >= 1.0) discard;
	float weight = cos(1.57079632679 * radius);
	weight *= weight;
  fragColor = vec4(vColor * weight, weight);
}
`;

const STAR_ATTRIB_BINDINGS = [
	[0, 'aPos'],
	[1, 'aColor'],
	[2, 'aFlux'],
	[3, 'aAlt'],
];

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
	const shader = gl.createShader(type);
	gl.shaderSource(shader, src);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
	{
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error('Shader compile error: ' + log);
	}
	return shader;
}


function link(gl, vsSrc, fsSrc, attribBindings = [])
{
	const vertexShader = compile(gl, gl.VERTEX_SHADER, vsSrc);
	const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
	const program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	for (const [index, name] of attribBindings)
	{
		gl.bindAttribLocation(program, index, name);
	}
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS))
	{
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error('Program link error: ' + log);
	}
	return program;
}


function uniforms(gl, program, names)
{
	const uniformLocations = {};
	for (const name of names)
	{
		uniformLocations[name] = gl.getUniformLocation(program, name);
	}
	return uniformLocations;
}


function aspectScales(width, height)
{
	// Keep the stereographic projection circular regardless of viewport shape by scaling
	// only the longer screen axis.
	return width < height
		? { aspectX: 1, aspectY: height / width }
		: { aspectX: width / height, aspectY: 1 };
}


export function createRendererPipeline(gl)
{
	const starProgTent = link(gl, STAR_VS_TENT, STAR_FS_TENT, STAR_ATTRIB_BINDINGS);
	const starProgRcos = link(gl, STAR_VS_RCOS, STAR_FS_RCOS, STAR_ATTRIB_BINDINGS);
	const ringProg = link(gl, RING_VS, RING_FS);
	const groundProg = link(gl, GROUND_VS, GROUND_FS);

	const starPrograms = {
		tent: {
			program: starProgTent,
			uniforms: uniforms(gl, starProgTent, [
				'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uBrightness', 'uPointSize',
				'uHorizonMode', 'uDimFactor',
			]),
		},
		rcos: {
			program: starProgRcos,
			uniforms: uniforms(gl, starProgRcos, [
				'uRight', 'uUp', 'uFwd', 'uTanHalfFov', 'uAspectX', 'uAspectY', 'uBrightness', 'uPointSize',
				'uHorizonMode', 'uDimFactor',
			]),
		},
	};
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
	const groundPositionLocation = gl.getAttribLocation(groundProg, 'aPos');
	gl.enableVertexAttribArray(groundPositionLocation);
	gl.vertexAttribPointer(groundPositionLocation, 2, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);

	return {
		starProg: starProgRcos,
		starPrograms,
		ringProg,
		ringU,
		groundProg,
		groundU,
		groundQuadBuf,
		groundVAO,
		ringVAO,
	};
}


export function drawRenderPipeline(renderer, camera, selectedStar)
{
	const { gl } = renderer;
	gl.clear(gl.COLOR_BUFFER_BIT);

	const tanHalfFov = Math.tan(camera.fov / 2);
	const { aspectX, aspectY } = aspectScales(camera.width, camera.height);

	if (renderer.horizonMode > 0 && renderer.zenith)
	{
		// The ground pass shades a full-screen quad, then discards any fragment whose
		// unprojected world direction ends up above the current horizon.
		gl.useProgram(renderer.groundProg);
		gl.bindVertexArray(renderer.groundVAO);
		gl.uniform3f(renderer.groundU.uRight, camera.right[0], camera.right[1], camera.right[2]);
		gl.uniform3f(renderer.groundU.uUp, camera.up[0], camera.up[1], camera.up[2]);
		gl.uniform3f(renderer.groundU.uFwd, camera.fwd[0], camera.fwd[1], camera.fwd[2]);
		gl.uniform1f(renderer.groundU.uTanHalfFov, tanHalfFov);
		gl.uniform1f(renderer.groundU.uAspectX, aspectX);
		gl.uniform1f(renderer.groundU.uAspectY, aspectY);
		gl.uniform3f(renderer.groundU.uZenith, renderer.zenith[0], renderer.zenith[1], renderer.zenith[2]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
	}

	const starProgram = renderer.starPrograms[renderer.starKernel] || renderer.starPrograms.rcos;
	const starU = starProgram.uniforms;
	gl.useProgram(starProgram.program);
	gl.bindVertexArray(renderer.vao);
	gl.uniform3f(starU.uRight, camera.right[0], camera.right[1], camera.right[2]);
	gl.uniform3f(starU.uUp, camera.up[0], camera.up[1], camera.up[2]);
	gl.uniform3f(starU.uFwd, camera.fwd[0], camera.fwd[1], camera.fwd[2]);
	gl.uniform1f(starU.uTanHalfFov, tanHalfFov);
	gl.uniform1f(starU.uAspectX, aspectX);
	gl.uniform1f(starU.uAspectY, aspectY);
	gl.uniform1f(starU.uBrightness, renderer.brightness);
	gl.uniform1f(starU.uPointSize, renderer.pointSize);
	gl.uniform1i(starU.uHorizonMode, renderer.horizonMode);
	gl.uniform1f(starU.uDimFactor, renderer.dimFactor);
	gl.drawArrays(gl.POINTS, 0, renderer.count);
	gl.bindVertexArray(null);

	if (selectedStar)
	{
		gl.useProgram(renderer.ringProg);
		gl.bindVertexArray(renderer.ringVAO);
		const starPosition = sphereDir(selectedStar.ra, selectedStar.dec);
		gl.uniform3f(renderer.ringU.uPos, starPosition[0], starPosition[1], starPosition[2]);
		gl.uniform3f(renderer.ringU.uRight, camera.right[0], camera.right[1], camera.right[2]);
		gl.uniform3f(renderer.ringU.uUp, camera.up[0], camera.up[1], camera.up[2]);
		gl.uniform3f(renderer.ringU.uFwd, camera.fwd[0], camera.fwd[1], camera.fwd[2]);
		gl.uniform1f(renderer.ringU.uTanHalfFov, tanHalfFov);
		gl.uniform1f(renderer.ringU.uAspectX, aspectX);
		gl.uniform1f(renderer.ringU.uAspectY, aspectY);
		gl.uniform1f(renderer.ringU.uPointSize, 28);
		gl.drawArrays(gl.POINTS, 0, 1);
		gl.bindVertexArray(null);
	}
}