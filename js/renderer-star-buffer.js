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


function ensureCapacity(r, n)
{
	if (n <= r.capacity) return;
	let cap = Math.max(16, r.capacity);
	while (cap < n) cap *= 2;
	const oldPos = r.posCPU;
	const oldCol = r.colCPU;
	const oldFlx = r.fluxCPU;
	const oldAlt = r.altCPU;
	r.posCPU = new Float32Array(cap * 3);
	r.colCPU = new Float32Array(cap * 3);
	r.fluxCPU = new Float32Array(cap);
	r.altCPU = new Float32Array(cap);
	r.posCPU.set(oldPos);
	r.colCPU.set(oldCol);
	r.fluxCPU.set(oldFlx);
	r.altCPU.set(oldAlt);
	r.capacity = cap;
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


function writeStarAt(r, i, star)
{
	const v = sphereDir(star.ra, star.dec);
	r.posCPU[3 * i] = v[0];
	r.posCPU[3 * i + 1] = v[1];
	r.posCPU[3 * i + 2] = v[2];
	r.colCPU[3 * i] = star.color[0];
	r.colCPU[3 * i + 1] = star.color[1];
	r.colCPU[3 * i + 2] = star.color[2];
	r.fluxCPU[i] = star.flux;
}


export function syncAll(r, stars)
{
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


export function syncOne(r, index, star)
{
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


export function appendStar(r, star)
{
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


export function removeAt(r, index, stars)
{
	if (index < 0 || index >= r.count) return;
	const lastIdx = r.count - 1;
	if (index !== lastIdx)
	{
		writeStarAt(r, index, stars[index]);
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


export function setAltitudes(r, altitudes)
{
	const n = Math.min(altitudes.length, r.count);
	if (n === 0) return;
	r.altCPU.set(altitudes.subarray(0, n));
	const { gl } = r;
	gl.bindBuffer(gl.ARRAY_BUFFER, r.altBuf);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, r.altCPU.subarray(0, n));
}