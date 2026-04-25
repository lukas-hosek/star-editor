import { sphereDir } from './camera.js';


export function createStarBuffers(gl, starProg)
{
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

	return {
		posBuf,
		colBuf,
		fluxBuf,
		altBuf,
		vao,
		posCPU: new Float32Array(0),
		colCPU: new Float32Array(0),
		fluxCPU: new Float32Array(0),
		altCPU: new Float32Array(0),
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
	renderer.posCPU = new Float32Array(nextCapacity * 3);
	renderer.colCPU = new Float32Array(nextCapacity * 3);
	renderer.fluxCPU = new Float32Array(nextCapacity);
	renderer.altCPU = new Float32Array(nextCapacity);
	renderer.posCPU.set(oldPositions);
	renderer.colCPU.set(oldColors);
	renderer.fluxCPU.set(oldFluxes);
	renderer.altCPU.set(oldAltitudes);
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
}


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
}


export function syncAll(renderer, stars)
{
	const starCount = stars.length;
	ensureCapacity(renderer, starCount);
	for (let index = 0; index < starCount; index++) writeStarAt(renderer, index, stars[index]);
	renderer.count = starCount;
	const { gl } = renderer;
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.posCPU.subarray(0, starCount * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.colCPU.subarray(0, starCount * 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.fluxCPU.subarray(0, starCount));
}


export function syncOne(renderer, index, star)
{
	if (index < 0 || index >= renderer.count) return;
	writeStarAt(renderer, index, star);
	const { gl } = renderer;
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.posCPU.subarray(index * 3, index * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.colCPU.subarray(index * 3, index * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, renderer.fluxCPU.subarray(index, index + 1));
}


export function appendStar(renderer, star)
{
	ensureCapacity(renderer, renderer.count + 1);
	writeStarAt(renderer, renderer.count, star);
	const { gl } = renderer;
	const index = renderer.count;
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.posCPU.subarray(index * 3, index * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.colCPU.subarray(index * 3, index * 3 + 3));
	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fluxBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, renderer.fluxCPU.subarray(index, index + 1));
	renderer.count += 1;
}


export function removeAt(renderer, index, stars)
{
	if (index < 0 || index >= renderer.count) return;
	const lastIndex = renderer.count - 1;
	if (index !== lastIndex)
	{
		writeStarAt(renderer, index, stars[index]);
		const { gl } = renderer;
		gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.posCPU.subarray(index * 3, index * 3 + 3));
		gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, index * 12, renderer.colCPU.subarray(index * 3, index * 3 + 3));
		gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fluxBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, index * 4, renderer.fluxCPU.subarray(index, index + 1));
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