import { mat4, quat, vec2, vec3, vec4 } from "./Math/index.js";

export class Device {

	constructor(canvas) {
		this.workingCanvas = canvas;
		this.workingWidth = canvas.width;
		this.workingHeight = canvas.height;
		this.workingContext = this.workingCanvas.getContext("2d", { willReadFrequently: true });
		this.depthbuffer = new Array(this.workingWidth * this.workingHeight);
	}

	clear() {
		this.workingContext.clearRect(0, 0, this.workingWidth, this.workingHeight);
		this.backbuffer = this.workingContext.getImageData(0, 0, this.workingWidth, this.workingHeight);
		for (var i = 0; i < this.depthbuffer.length; i++) {
			this.depthbuffer[i] = 10000000;
		}
	}

	swap() {
		this.workingContext.putImageData(this.backbuffer, 0, 0);
	}

	putPixel(x, y, z, color) {
		this.backbufferdata = this.backbuffer.data;
		const index = ((x >> 0) + (y >> 0) * this.workingWidth);
		const index4 = index * 4;
		if (this.depthbuffer[index] < z) {
			return;
		}
		this.depthbuffer[index] = z;
		this.backbufferdata[index4] = color[0] * 255;
		this.backbufferdata[index4 + 1] = color[1] * 255;
		this.backbufferdata[index4 + 2] = color[2] * 255;
		this.backbufferdata[index4 + 3] = color[3] * 255;
	}

	project(coord, transMat) {
		const point = vec3.transformMat4(vec3.create(), coord, transMat)
		const x = point[0] * this.workingWidth + this.workingWidth / 2.0 >> 0;
		const y = -point[1] * this.workingHeight + this.workingHeight / 2.0 >> 0;
		return vec3.fromValues(x, y, point[2]);
	}

	drawPoint(point) {
		if (point[0] >= 0 && point[1] >= 0 && point[0] < this.workingWidth && point[1] < this.workingHeight) {
			this.putPixel(point[0], point[1], point[2], vec4.fromValues(1, 1, 0, 1));
		}
	}

	// Bresenham's line algorithm
	drawLine(point0, point1) {
		let x0 = point0[0] >> 0;
		let y0 = point0[1] >> 0;
		const x1 = point1[0] >> 0;
		const y1 = point1[1] >> 0;
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = (x0 < x1) ? 1 : -1;
		const sy = (y0 < y1) ? 1 : -1;
		let err = dx - dy;

		while (true) {
			this.drawPoint(vec2.fromValues(x0, y0));

			if ((x0 == x1) && (y0 == y1)) break;
			const e2 = 2 * err;
			if (e2 > -dy) { err -= dy; x0 += sx; }
			if (e2 < dx) { err += dx; y0 += sy; }
		}
	}

	clamp(value, min = 0, max = 1) {
		return Math.max(min, Math.min(value, max));
	}

	interpolate(min, max, gradient) {
		return min + (max - min) * this.clamp(gradient);
	}

	processScanLine(y, pa, pb, pc, pd, color) {
		const gradient1 = pa[1] != pb[1] ? (y - pa[1]) / (pb[1] - pa[1]) : 1;
		const gradient2 = pc[1] != pd[1] ? (y - pc[1]) / (pd[1] - pc[1]) : 1;

		const sx = this.interpolate(pa[0], pb[0], gradient1) >> 0;
		const ex = this.interpolate(pc[0], pd[0], gradient2) >> 0;
		const z1 = this.interpolate(pa[2], pb[2], gradient1);
		const z2 = this.interpolate(pc[2], pd[2], gradient2);

		for (let x = sx; x < ex; x++) {
			const gradient = (x - sx) / (ex - sx);
			const z = this.interpolate(z1, z2, gradient);
			this.drawPoint(vec3.fromValues(x, y, z), color);
		}
	}

	drawTriangle(p1, p2, p3, color) {
		if (p1[1] > p2[1]) {
			const temp = p2;
			p2 = p1;
			p1 = temp;
		}

		if (p2[1] > p3[1]) {
			const temp = p2;
			p2 = p3;
			p3 = temp;
		}

		if (p1[1] > p2[1]) {
			const temp = p2;
			p2 = p1;
			p1 = temp;
		}

		// inverse slopes
		let dP1P2; let dP1P3;

		// http://en.wikipedia.org/wiki/Slope
		if (p2[1] - p1[1] > 0) {
			dP1P2 = (p2[0] - p1[0]) / (p2[1] - p1[1]);
		}
		else {
			dP1P2 = 0;
		}
		if (p3[1] - p1[1] > 0) {
			dP1P3 = (p3[0] - p1[0]) / (p3[1] - p1[1]);

		} else {
			dP1P3 = 0;
		}
		if (dP1P2 > dP1P3) {
			for (let y = p1[1] >> 0; y <= p3[1] >> 0; y++) {
				if (y < p2[1]) {
					this.processScanLine(y, p1, p3, p1, p2, color);
				}
				else {
					this.processScanLine(y, p1, p3, p2, p3, color);
				}
			}
		}
		else {
			for (let y = p1[1] >> 0; y <= p3[1] >> 0; y++) {
				if (y < p2[1]) {
					this.processScanLine(y, p1, p2, p1, p3, color);
				}
				else {
					this.processScanLine(y, p2, p3, p1, p3, color);
				}
			}
		}
	}

	degrees_to_radians(degrees) {
		return degrees * (Math.PI / 180);
	}

	render(camera, meshes) {
		const viewMatrix = mat4.lookAt(mat4.create(), camera.position, camera.target, vec3.fromValues(0,1,0))
		const projectionMatrix = mat4.perspectiveNO(mat4.create(), 0.8, this.workingWidth / this.workingHeight, 0.001, 1000.0)

		for (let index = 0; index < meshes.length; index++) {
			const cMesh = meshes[index];
			const worldMatrix = mat4.multiply(mat4.create(), mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), cMesh.rotation[0], cMesh.rotation[1], cMesh.rotation[2], "yxz")), mat4.fromTranslation(mat4.create(), cMesh.position))
			const transformMatrix = mat4.multiply(mat4.create(), mat4.multiply(mat4.create(), projectionMatrix, viewMatrix), worldMatrix)

			for (let indexFaces = 0; indexFaces < cMesh.faces.length; indexFaces++) {
				const currentFace = cMesh.faces[indexFaces];
				const vertexA = cMesh.vertices[currentFace.A];
				const vertexB = cMesh.vertices[currentFace.B];
				const vertexC = cMesh.vertices[currentFace.C];

				const pixelA = this.project(vertexA, transformMatrix);
				const pixelB = this.project(vertexB, transformMatrix);
				const pixelC = this.project(vertexC, transformMatrix);

				const color = 0.25 + ((indexFaces % cMesh.faces.length) / cMesh.faces.length) * 0.75;
				this.drawTriangle(pixelA, pixelB, pixelC, vec4.fromValues(color, color, color, 1));
			}
		}
	}
}