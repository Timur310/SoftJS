// External Imports
import type { ObjModel } from "./Loaders/OBJLoader";
import type { Camera } from "./Objects/Camera";
import type { DirectionalLight } from "./Objects/DirectionalLight";

// Internal Imports
import {
    computeBlinnPhongLighting,
    getScreenVertex,
    isTriangleClipped,
    mat4LookAt,
    mat4Mul,
    mat4MulVec4,
    mat4Perspective,
    mat4RotateY,
    snapVertexToGrid,
    transformTriangleToScreen,
    vcross,
    vdot,
    vnorm,
    vsub,
    type ScreenVertex,
    type Vec3,
    type Mat4,
    projectVertex,
} from "./Math";

export interface RendererOptions {
    shading?: "flat" | "blinn-phong" | "wireframe";
    snapVertices?: boolean;
}

export class Renderer {

    // Canvas and Context
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;

    // Rendering State
    private running: boolean = false;
    private timescale: number = 0.001;
    private littleEndian: boolean;

    // Buffers
    private imageData: ImageData | undefined;
    private buffer: ArrayBuffer;
    private buf8: Uint8ClampedArray;
    private data32: Uint32Array;
    private zBuffer: Float32Array;

    // Scene Data
    private objModels: ObjModel[] = [];
    private mainCamera: Camera | null = null;
    private mainDirectionalLight: DirectionalLight | null = null;

    // Performance Metrics
    private lastFpsUpdate: number = 0;
    private frameCount: number = 0;
    private fps: number = 0;

    // Renderer Options
    private options: RendererOptions;

    // Add a precomputed projection matrix
    private projMatrix: Mat4;

    // Initialize the rasterization worker
    private rasterWorker: Worker;

    constructor(canvasId: string, options: RendererOptions = {}) {
        this.options = options;
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.imageData = this.ctx?.getImageData(0, 0, this.width, this.height);
        const byteLen = this.imageData.data.length; // bytes = width * height * 4

        this.buffer = new ArrayBuffer(byteLen);
        this.buf8 = new Uint8ClampedArray(this.buffer);
        this.data32 = new Uint32Array(this.buffer);

        const tmp = new Uint32Array([0x0a0b0c0d]);
        const tmp8 = new Uint8Array(tmp.buffer);
        // if tmp8[0] === 0x0d it's little-endian (lowest byte at lowest address)
        this.littleEndian = tmp8[0] === 0x0d;

        this.zBuffer = new Float32Array(this.width * this.height);
        this.clearZ();

        // Precompute the projection matrix
        const aspect = this.width / this.height;
        this.projMatrix = mat4Perspective(Math.PI / 3, aspect, 0.1, 100);

        // Initialize the rasterization worker
        this.rasterWorker = new Worker("./src/RasterWorker.js");
        this.rasterWorker.onmessage = (event) => {
            const { buf8 } = event.data;
            this.buf8.set(buf8);
            this.present();
        };
    }

    private drawLine3DEFLA(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, g: number, b: number, a = 255): void {
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let dz = Math.abs(z1 - z0);

        let xs = x0 < x1 ? 1 : -1;
        let ys = y0 < y1 ? 1 : -1;
        let zs = z0 < z1 ? 1 : -1;

        let longLen = Math.max(dx, dy, dz);
        let shortLen1 = 0, shortLen2 = 0;

        if (longLen === dx) {
            shortLen1 = dy;
            shortLen2 = dz;
        } else if (longLen === dy) {
            shortLen1 = dx;
            shortLen2 = dz;
        } else {
            shortLen1 = dx;
            shortLen2 = dy;
        }

        let decInc1 = shortLen1 === 0 ? 0 : (shortLen1 << 16) / longLen;
        let decInc2 = shortLen2 === 0 ? 0 : (shortLen2 << 16) / longLen;

        let j1 = 0, j2 = 0;
        for (let i = 0; i <= longLen; i++) {
            if (this.depthTest(x0, y0, z0)) {
                this.setPixel(x0, y0, r, g, b, a);
            }

            if (longLen === dx) {
                x0 += xs;
                j1 += decInc1;
                j2 += decInc2;
                y0 += (j1 >> 16) * ys;
                z0 += (j2 >> 16) * zs;
                j1 &= 0xFFFF;
                j2 &= 0xFFFF;
            } else if (longLen === dy) {
                y0 += ys;
                j1 += decInc1;
                j2 += decInc2;
                x0 += (j1 >> 16) * xs;
                z0 += (j2 >> 16) * zs;
                j1 &= 0xFFFF;
                j2 &= 0xFFFF;
            } else {
                z0 += zs;
                j1 += decInc1;
                j2 += decInc2;
                x0 += (j1 >> 16) * xs;
                y0 += (j2 >> 16) * ys;
                j1 &= 0xFFFF;
                j2 &= 0xFFFF;
            }
        }
    }

    private drawTriangleScanline(v0: ScreenVertex, v1: ScreenVertex, v2: ScreenVertex, color: Vec3 = { x: 200, y: 120, z: 60 }) {
        // Sort vertices by y
        let [a, b, c] = [v0, v1, v2].sort((v1, v2) => v1.y - v2.y);

        // Precompute bounding box
        const minY = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y)));
        const maxY = Math.min(this.height - 1, Math.floor(Math.max(a.y, b.y, c.y)));

        // Precompute edge interpolations
        const edgeAC = precomputeEdge(a, c);
        const edgeAB = precomputeEdge(a, b);
        const edgeBC = precomputeEdge(b, c);

        for (let y = minY; y <= maxY; y++) {
            // Find x-intersections with edges
            let x1 = interpolateEdge(edgeAC, y);
            let x2 = y < b.y ? interpolateEdge(edgeAB, y) : interpolateEdge(edgeBC, y);

            if (x1 > x2) [x1, x2] = [x2, x1];

            const startX = Math.max(0, Math.ceil(x1));
            const endX = Math.min(this.width - 1, Math.floor(x2));

            for (let x = startX; x <= endX; x++) {
                const t = (x2 === x1) ? 0 : (x - x1) / (x2 - x1);
                const z = interpolateZ(edgeAC, edgeAB, edgeBC, x, y, t);

                if (this.depthTest(x, y, z)) {
                    this.setPixel(x, y, color.x, color.y, color.z);
                }
            }
        }

        function precomputeEdge(vStart: ScreenVertex, vEnd: ScreenVertex) {
            const dy = vEnd.y - vStart.y;
            const dx = vEnd.x - vStart.x;
            const dz = vEnd.z - vStart.z;
            return { vStart, vEnd, dx, dy, dz };
        }

        function interpolateEdge(edge: any, y: number): number {
            const { vStart, vEnd, dx, dy } = edge;
            if (dy === 0) return vStart.x;
            return vStart.x + dx * ((y - vStart.y) / dy);
        }

        function interpolateZ(edgeAC: any, edgeAB: any, edgeBC: any, x: number, y: number, t: number): number {
            // Simplified Z interpolation logic for demonstration
            return edgeAC.vStart.z + (edgeAC.vEnd.z - edgeAC.vStart.z) * t;
        }
    }

    // Lifecycle Methods
    public start() {
        if (this.running) return;
        this.running = true;
        this.lastFpsUpdate = performance.now();
        this.frameCount = 0;
        const loop = (t: number) => {
            this.clear(20, 20, 30);
            this.clearZ();
            this.renderPixel(t * this.timescale);
            this.present();

            // FPS calculation
            this.frameCount++;
            const now = performance.now();
            if (now - this.lastFpsUpdate >= 1000) {
                this.fps = this.frameCount;
                this.frameCount = 0;
                this.lastFpsUpdate = now;
            }

            // Draw FPS
            this.ctx.fillStyle = "white";
            this.ctx.font = "16px monospace";
            this.ctx.fillText(`FPS: ${this.fps}`, 10, 20);

            if (this.running) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    public stop() {
        this.running = false;
    }

    public benchmark(frames: number = 300) {
        this.running = false;
        let start = performance.now();
        for (let i = 0; i < frames; i++) {
            this.clear(20, 20, 30);
            this.clearZ();
            this.renderPixel(i * this.timescale);
            this.present();
        }
        let end = performance.now();
        let fps = frames / ((end - start) / 1000);
        // Draw FPS
        this.ctx.fillStyle = "white";
        this.ctx.font = "16px monospace";
        this.ctx.fillText(`FPS: ${fps.toFixed(2)}`, 10, 20);
    }

    // Rendering Methods
    private renderPixel(time: number) {
        // Precompute transformation matrices
        const modelMat = mat4RotateY(time);
        const forward = this.mainCamera!.getForwardVector();
        const target = {
            x: this.mainCamera!.position.x + forward.x,
            y: this.mainCamera!.position.y + forward.y,
            z: this.mainCamera!.position.z + forward.z
        };
        const view = mat4LookAt(this.mainCamera!.position, target, this.mainCamera!.up);
        const mv = mat4Mul(view, modelMat);
        const mvp = mat4Mul(this.projMatrix, mv);

        // Loop through all loaded OBJ models
        for (const objModel of this.objModels) {
            for (const mesh of objModel.meshes) {
                this.renderMesh(mesh, mvp, modelMat);
            }
        }

        // Update the canvas with the rendered image
        if (this.imageData) {
            this.imageData.data.set(this.buf8);
            this.ctx.putImageData(this.imageData, 0, 0);
        }
    }

    private renderMesh(mesh: ObjModel["meshes"][number], mvp: Mat4, modelMat: Mat4) {

        const pos = mesh.positions;
        const normals = mesh.normals;
        const uvs = mesh.uvs;
        const idx = mesh.indices;

        // Collect triangles into a batch
        const triangles = [];
        for (let i = 0; i < idx.length; i += 3) {
            const vi0 = idx[i] * 3, vi1 = idx[i + 1] * 3, vi2 = idx[i + 2] * 3;
            const v0 = { x: pos[vi0], y: pos[vi0 + 1], z: pos[vi0 + 2] };
            const v1 = { x: pos[vi1], y: pos[vi1 + 1], z: pos[vi1 + 2] };
            const v2 = { x: pos[vi2], y: pos[vi2 + 1], z: pos[vi2 + 2] };
            triangles.push({ v0, v1, v2, i });
        }

        // Process the batch
        for (const triangle of triangles) {
            this.renderTriangle(idx, triangle.i, pos, normals, uvs, mvp, modelMat);
        }
    }

    private renderTriangle(
        idx: Uint32Array,
        i: number,
        pos: Float32Array,
        normals: Float32Array,
        uvs: Float32Array | null,
        mvp: Mat4,
        modelMat: Mat4
    ) {
        // Get vertex positions
        const vi0 = idx[i] * 3, vi1 = idx[i + 1] * 3, vi2 = idx[i + 2] * 3;
        const v0 = { x: pos[vi0], y: pos[vi0 + 1], z: pos[vi0 + 2] };
        const v1 = { x: pos[vi1], y: pos[vi1 + 1], z: pos[vi1 + 2] };
        const v2 = { x: pos[vi2], y: pos[vi2 + 1], z: pos[vi2 + 2] };

        // Transform to screen space
        const sverts = transformTriangleToScreen(v0, v1, v2, mvp, this.width, this.height);
        if (!sverts) return;

        // Apply snapping to screen vertices if snapVertices is enabled
        if (this.options.snapVertices) {
            sverts[0] = snapVertexToGrid(sverts[0], 5);
            sverts[1] = snapVertexToGrid(sverts[1], 5);
            sverts[2] = snapVertexToGrid(sverts[2], 5);
        }

        // Optionally: clipping and backface culling
        if (isTriangleClipped(sverts[0], sverts[1], sverts[2], this.width, this.height)) {
            return;
        }
        const ax = sverts[0].x, ay = sverts[0].y;
        const bx = sverts[1].x, by = sverts[1].y;
        const cx = sverts[2].x, cy = sverts[2].y;
        const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (area2 > 0) {
            return; // Cull backfaces
        }

        // Compute face normal in world/model space
        const p0w = mat4MulVec4(modelMat, { x: v0.x, y: v0.y, z: v0.z, w: 1 });
        const p1w = mat4MulVec4(modelMat, { x: v1.x, y: v1.y, z: v1.z, w: 1 });
        const p2w = mat4MulVec4(modelMat, { x: v2.x, y: v2.y, z: v2.z, w: 1 });
        const e1 = vsub({ x: p1w.x, y: p1w.y, z: p1w.z }, { x: p0w.x, y: p0w.y, z: p0w.z });
        const e2 = vsub({ x: p2w.x, y: p2w.y, z: p2w.z }, { x: p0w.x, y: p0w.y, z: p0w.z });

        const sv0: ScreenVertex = getScreenVertex(sverts[0], vi0, idx[i] * 2, normals, uvs);
        const sv1: ScreenVertex = getScreenVertex(sverts[1], vi1, idx[i + 1] * 2, normals, uvs);
        const sv2: ScreenVertex = getScreenVertex(sverts[2], vi2, idx[i + 2] * 2, normals, uvs);

        if (this.options.shading === "flat") {
            this.renderFlatShading(sv0, sv1, sv2, e1, e2);
        } else if (this.options.shading === "blinn-phong") {
            this.renderBlinnPhongShading(sv0, sv1, sv2, v0, v1, v2, normals);
        } else if (this.options.shading === "wireframe") {
            // TODO: Implement wireframe rendering
            return;
        }
    }

    private renderFlatShading(sv0: ScreenVertex, sv1: ScreenVertex, sv2: ScreenVertex, e1: Vec3, e2: Vec3) {
        const ambient = 0.15;
        const ld = this.mainDirectionalLight!.direction;
        const ldir = vnorm(ld); // Normalize light direction
        const base = { x: 200, y: 120, z: 60 };
        const diff = 1.0 - ambient;
        const faceNormal = vnorm(vcross(e1, e2));
        const lightIntensity = Math.max(0, vdot(faceNormal, { x: -ldir.x, y: -ldir.y, z: -ldir.z })) * this.mainDirectionalLight!.intensity;
        const finalColor: Vec3 = {
            x: Math.max(0, Math.min(255, base.x * (ambient + diff * lightIntensity))),
            y: Math.max(0, Math.min(255, base.y * (ambient + diff * lightIntensity))),
            z: Math.max(0, Math.min(255, base.z * (ambient + diff * lightIntensity)))
        };
        this.drawTriangleScanline(sv0, sv1, sv2, finalColor);
    }

    private renderBlinnPhongShading(
        sv0: ScreenVertex,
        sv1: ScreenVertex,
        sv2: ScreenVertex,
        v0: Vec3,
        v1: Vec3,
        v2: Vec3,
        normals: Float32Array
    ) {
        const viewDir = vnorm({
            x: -this.mainCamera!.position.x,
            y: -this.mainCamera!.position.y,
            z: -this.mainCamera!.position.z
        });

        const vertexColors = [
            computeBlinnPhongLighting(v0, { x: normals[0], y: normals[1], z: normals[2] }, viewDir, this.mainDirectionalLight!),
            computeBlinnPhongLighting(v1, { x: normals[3], y: normals[4], z: normals[5] }, viewDir, this.mainDirectionalLight!),
            computeBlinnPhongLighting(v2, { x: normals[6], y: normals[7], z: normals[8] }, viewDir, this.mainDirectionalLight!)
        ];
        sv0.color = [vertexColors[0].x, vertexColors[0].y, vertexColors[0].z];
        sv1.color = [vertexColors[1].x, vertexColors[1].y, vertexColors[1].z];
        sv2.color = [vertexColors[2].x, vertexColors[2].y, vertexColors[2].z];
        this.drawTriangleScanline(sv0, sv1, sv2);
    }

    // Utility Methods
    private clearZ() {
        this.zBuffer.fill(Number.POSITIVE_INFINITY);
    }

    private clear(r = 0, g = 0, b = 0, a = 255) {
        const packed = this.packRGBA(r, g, b, a);
        this.data32.fill(packed);
    }

    private present() {
        if (!this.imageData) return;
        this.imageData.data.set(this.buf8);
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    private packRGBA(r: number, g: number, b: number, a = 255): number {
        if (this.littleEndian) {
            return (a << 24) | (b << 16) | (g << 8) | r;
        } else {
            return (r << 24) | (g << 16) | (b << 8) | a;
        }
    }

    private setPixel(x: number, y: number, r: number, g: number, b: number, a = 255) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        const idx = y * this.width + x;
        this.data32[idx] = this.packRGBA(r | 0, g | 0, b | 0, a | 0);
    }

    private depthTest(x: number, y: number, z: number): boolean {
        const idx = y * this.width + x;

        // Early z-culling: Skip if the current z is greater than the z-buffer value
        if (z >= this.zBuffer[idx]) {
            return false;
        }

        // Update z-buffer with the new depth value
        this.zBuffer[idx] = z;
        return true;
    }

    public setCamera(camera: Camera) {
        this.mainCamera = camera;
    }

    public setDirectionalLight(light: DirectionalLight) {
        this.mainDirectionalLight = light;
    }

    public addModel(model: ObjModel) {
        this.objModels.push(model);
    }
}