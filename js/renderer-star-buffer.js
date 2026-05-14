import { sphereDir } from './camera.js';


// Sentinel for "absolute magnitude unknown" in aAbsMag. Real absmags fit in
// roughly [-10, +20]; 999 is comfortably outside that range. The vertex shader
// uses aAbsMag < 50.0 as the "absmag is present" check for flux recalculation.
const ABSMAG_SENTINEL = 999;


export function createStarBuffers(gl, starProg)
{
	const aPosLoc = gl.getAttribLocation(starProg, 'aPos');
	const aColorLoc = gl.getAttribLocation(starProg, 'aColor');
	const aFluxLoc = gl.getAttribLocation(starProg, 'aFlux');
	const aAltLoc = gl.getAttribLocation(starProg, 'aAlt');
	const aPosPcLoc = gl.getAttribLocation(starProg, 'aPosPc');
	const aVelPcYrLoc = gl.getAttribLocation(starProg, 'aVelPcYr');
	const aAbsMagLoc = gl.getAttribLocation(starProg, 'aAbsMag');

	const posBuf = gl.createBuffer();
	const colBuf = gl.createBuffer();
	const fluxBuf = gl.createBuffer();
	const altBuf = gl.createBuffer();
	const posPcBuf = gl.createBuffer();
	const velBuf = gl.createBuffer();
	const absmagBuf = gl.createBuffer();

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
	gl.bindBuffer(gl.ARRAY_BUFFER, posPcBuf);
	gl.enableVertexAttribArray(aPosPcLoc);
	gl.vertexAttribPointer(aPosPcLoc, 3, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, velBuf);
	gl.enableVertexAttribArray(aVelPcYrLoc);
	gl.vertexAttribPointer(aVelPcYrLoc, 3, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, absmagBuf);
	gl.enableVertexAttribArray(aAbsMagLoc);
	gl.vertexAttribPointer(aAbsMagLoc, 1, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);

	return {
		posBuf,
		colBuf,
		fluxBuf,
		altBuf,
		posPcBuf,
		velBuf,
		absmagBuf,
		vao,
		posCPU: new Float32Array(0),
		colCPU: new Float32Array(0),
		fluxCPU: new Float32Array(0),
		altCPU: new Float32Array(0),
		posPcCPU: new Float32Array(0),
		velCPU: new Float32Array(0),
		absmagCPU: new Float32Array(0),
		capacity: 0,
		count: 0,
	};
}


function ensureCapacity(renderer, requiredCount)
{
	if (requiredCount <= renderer.capacity) return;
	let nextCapacity = Math.max(16, renderer.capacity);
	while (nextCapacity < requiredCount) nextCapacity *= 2;
	const oldPositions = renderer.posCPU;
	const oldColors = renderer.colCPU;
	const oldFluxes = renderer.fluxCPU;
	const oldAltitudes = renderer.altCPU;
	const oldPosPc = renderer.posPcCPU;
	const oldVel = renderer.velCPU;
	const oldAbsmag = renderer.absmagCPU;
	renderer.posCPU = new Float32Array(nextCapacity * 3);
	renderer.colCPU = new Float32Array(nextCapacity * 3);
	renderer.fluxCPU = new Float32Array(nextCapacity);
	renderer.altCPU = new Float32Array(nextCapacity);
	renderer.posPcCPU = new Float32Array(nextCapacity * 3);
	renderer.velCPU = new Float32Array(nextCapacity * 3);
	renderer.absmagCPU = new Float32Array(nextCapacity);
	renderer.posCPU.set(oldPositions);
	renderer.colCPU.set(oldColors);
	renderer.fluxCPU.set(oldFluxes);
	renderer.altCPU.set(oldAltitudes);
	renderer.posPcCPU.set(oldPosPc);
	renderer.velCPU.set(oldVel);
	renderer.absmagCPU.set(oldAbsmag);
	renderer.capacity = nextCapacity;
	const { gl } = renderer;
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.posCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.colCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fluxBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.fluxCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.altBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.altCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posPcBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.posPcCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.velBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.velCPU.byteLength, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.absmagBuf);
	gl.bufferData(gl.ARRAY_BUFFER, renderer.absmagCPU.byteLength, gl.DYNAMIC_DRAW);
}


// Stars without HYG kinematics get the raw catalog values (null → 0 via Float32Array
// coercion), which produces a degenerate propagated direction. The time-travel
// feature is HYG-only; BSC stars are expected to misbehave during animation.
function writeStarAt(renderer, index, star)
{
	const position = sphereDir(star.ra, star.dec);
	renderer.posCPU[3 * index] = position[0];
	renderer.posCPU[3 * index + 1] = position[1];
	renderer.posCPU[3 * index + 2] = position[2];
	renderer.colCPU[3 * index] = star.color[0];
	renderer.colCPU[3 * index + 1] = star.color[1];
	renderer.colCPU[3 * index + 2] = star.color[2];
	renderer.fluxCPU[index] = star.flux;
	renderer.posPcCPU[3 * index]     = star.x;
	renderer.posPcCPU[3 * index + 1] = star.y;
	renderer.posPcCPU[3 * index + 2] = star.z;
	renderer.velCPU[3 * index]     = star.vx;
	renderer.velCPU[3 * index + 1] = star.vy;
	renderer.velCPU[3 * index + 2] = star.vz;
	renderer.absmagCPU[index] = (star.absmag !== null && Number.isFinite(star.absmag)) ? star.absmag : ABSMAG_SENTINEL;
}


function uploadStarSlice(renderer, index, count)
{
	const { gl } = renderer;
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.posCPU.subarray(index * 3, (index + count) * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.colCPU.subarray(index * 3, (index + count) * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, renderer.fluxCPU.subarray(index, index + count));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posPcBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.posPcCPU.subarray(index * 3, (index + count) * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.velBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.velCPU.subarray(index * 3, (index + count) * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.absmagBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, renderer.absmagCPU.subarray(index, index + count));
}


export function syncAll(renderer, stars)
{
	const starCount = stars.length;
	ensureCapacity(renderer, starCount);
	for (let index = 0; index < starCount; index++) writeStarAt(renderer, index, stars[index]);
	renderer.count = starCount;
	if (starCount > 0) uploadStarSlice(renderer, 0, starCount);
}


export function syncOne(renderer, index, star)
{
	if (index < 0 || index >= renderer.count) return;
	writeStarAt(renderer, index, star);
	uploadStarSlice(renderer, index, 1);
}


export function appendStar(renderer, star)
{
	ensureCapacity(renderer, renderer.count + 1);
	writeStarAt(renderer, renderer.count, star);
	uploadStarSlice(renderer, renderer.count, 1);
	renderer.count += 1;
}


export function removeAt(renderer, index, stars)
{
	if (index < 0 || index >= renderer.count) return;
	const lastIndex = renderer.count - 1;
	if (index !== lastIndex)
	{
		writeStarAt(renderer, index, stars[index]);
		uploadStarSlice(renderer, index, 1);
	}
	renderer.count -= 1;
}


export function setAltitudes(renderer, altitudes)
{
	const altitudeCount = Math.min(altitudes.length, renderer.count);
	if (altitudeCount === 0) return;
	renderer.altCPU.set(altitudes.subarray(0, altitudeCount));
	const { gl } = renderer;
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.altBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.altCPU.subarray(0, altitudeCount));
}
