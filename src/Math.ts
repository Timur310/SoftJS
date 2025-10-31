import type { MeshData } from "./Loaders/OBJLoader";
import type { DirectionalLight } from "./Objects/DirectionalLight";

type Vec3 = { x: number, y: number, z: number }
type Vec4 = { x: number, y: number, z: number, w: number }
type Mat4 = number[]; // length 16, column-major or row-major consistent usage below
type ScreenVertex = {
    x: number, y: number, z: number,   // z in 0..1
    recipW: number                     // 1 / clip.w, for perspective-correct interpolation
    color?: [number, number, number], // RGB
    normal?: Vec3,
    uv?: [number, number]
    // add here attribute fields like uOverW, vOverW, nxOverW, nyOverW, nzOverW, etc.
};

function mat4Identity(): Mat4 {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
    const out = new Array(16);
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[row * 4 + k] * b[k * 4 + col];
            }
            out[row * 4 + col] = sum;
        }
    }
    return out;
}

function mat4MulVec4(m: Mat4, v: Vec4): Vec4 {
    return {
        x: m[0] * v.x + m[1] * v.y + m[2] * v.z + m[3] * v.w,
        y: m[4] * v.x + m[5] * v.y + m[6] * v.z + m[7] * v.w,
        z: m[8] * v.x + m[9] * v.y + m[10] * v.z + m[11] * v.w,
        w: m[12] * v.x + m[13] * v.y + m[14] * v.z + m[15] * v.w
    };
}

/** Create perspective projection matrix (WebGL style, maps z to [-1,1]).
 * fovy in radians, aspect = width/height. near > 0, far > near.
 * Uses row-major layout consistent with mat4Mul/mat4MulVec4 above.
 */
function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    // row-major
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, (2 * far * near) * nf,
        0, 0, -1, 0
    ];
}

/** Create a view matrix from camera (eye), target, up vector.
 * Row-major lookAt: returns matrix that transforms world to camera (view) space.
 */
function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
    let zlen = Math.hypot(zx, zy, zz);
    if (zlen === 0) { zlen = 1; } // avoid div0
    const zxn = zx / zlen, zyn = zy / zlen, zzn = zz / zlen;

    // x = up cross z
    const xx = up.y * zzn - up.z * zyn;
    const xy = up.z * zxn - up.x * zzn;
    const xz = up.x * zyn - up.y * zxn;
    let xlen = Math.hypot(xx, xy, xz);
    if (xlen === 0) { xlen = 1; }
    const xxn = xx / xlen, xyn = xy / xlen, xzn = xz / xlen;

    // y = z cross x
    const yx = zyn * xzn - zzn * xyn;
    const yy = zzn * xxn - zxn * xzn;
    const yz = zxn * xyn - zyn * xxn;

    // Row-major view matrix
    return [
        xxn, xyn, xzn, -(xxn * eye.x + xyn * eye.y + xzn * eye.z),
        yx, yy, yz, -(yx * eye.x + yy * eye.y + yz * eye.z),
        zxn, zyn, zzn, -(zxn * eye.x + zyn * eye.y + zzn * eye.z),
        0, 0, 0, 1
    ];
}

/** Make a rotation matrix around Y (simple helper for demo) */
function mat4RotateY(angle: number): Mat4 {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [
        c, 0, s, 0,
        0, 1, 0, 0,
        -s, 0, c, 0,
        0, 0, 0, 1
    ];
}

/**
 * Projects a 3D position to 2D screen space using a Model-View-Projection (MVP) matrix.
 *
 * @param pos - The 3D position to project ({ x, y, z }).
 * @param mvp - The 4x4 Model-View-Projection matrix (row-major, length 16).
 * @param width - The width of the target screen/canvas in pixels.
 * @param height - The height of the target screen/canvas in pixels.
 * @returns An object containing:
 *   - screenX: X coordinate in screen space (pixels, origin left)
 *   - screenY: Y coordinate in screen space (pixels, origin top)
 *   - screenZ: Z coordinate in normalized [0,1] range for z-buffer
 *   - ndc: Normalized device coordinates ({ x, y, z }) in [-1, 1]
 *   - clipW: The clip-space W value (for perspective divide)
 *   Returns null if the vertex is not projectable (clip.w === 0).
 *
 * Screen Y is flipped so that 0 is at the top (canvas convention).
 */
function projectVertex(pos: Vec3, mvp: Mat4, width: number, height: number) {
    const v4 = { x: pos.x, y: pos.y, z: pos.z, w: 1 };
    const clip = mat4MulVec4(mvp, v4);

    // Cull: if clip.w is zero we cannot divide.
    if (clip.w === 0) return null;

    const ndc = { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w };

    // Convert to screen coordinates
    const screenX = (ndc.x * 0.5 + 0.5) * width;
    const screenY = (1.0 - (ndc.y * 0.5 + 0.5)) * height; // flip Y for canvas coordinates
    const screenZ = (ndc.z * 0.5 + 0.5); // maps -1..1 -> 0..1 (for z-buffer)

    return {
        screenX, screenY, screenZ,
        ndc, clipW: clip.w
    };
}

function transformTriangleToScreen(a: Vec3, b: Vec3, c: Vec3, mvp: Mat4, width: number, height: number): (ScreenVertex[] | null) {
    const pa = projectVertex(a, mvp, width, height);
    const pb = projectVertex(b, mvp, width, height);
    const pc = projectVertex(c, mvp, width, height);
    if (!pa || !pb || !pc) return null;

    return [
        { x: pa.screenX, y: pa.screenY, z: pa.screenZ, recipW: 1 / pa.clipW },
        { x: pb.screenX, y: pb.screenY, z: pb.screenZ, recipW: 1 / pb.clipW },
        { x: pc.screenX, y: pc.screenY, z: pc.screenZ, recipW: 1 / pc.clipW }
    ];
}

function isTriangleClipped(v0: Vec3, v1: Vec3, v2: Vec3, width: number, height: number) {
    // Check if all vertices are outside the screen bounds
    const outOfBounds = (v: Vec3) => v.x < 0 || v.x >= width || v.y < 0 || v.y >= height;
    if (outOfBounds(v0) && outOfBounds(v1) && outOfBounds(v2)) return true;
    return false;
}

function getScreenVertex(svert: ScreenVertex, vi: number, uvIdx: number, normals: Float32Array | null, uvs: Float32Array | null): ScreenVertex {
    const normal = (normals && normals.length > vi + 2)
        ? { x: normals[vi], y: normals[vi + 1], z: normals[vi + 2] } as Vec3
        : undefined;
    const uv = (uvs && uvs.length > uvIdx + 1)
        ? [uvs[uvIdx], uvs[uvIdx + 1]] as [number, number]
        : undefined;
    return {
        x: svert.x,
        y: svert.y,
        z: svert.z,
        recipW: svert.recipW,
        color: undefined,
        normal,
        uv
    };
}

function interpolateAttrs(vStart: ScreenVertex, vEnd: ScreenVertex, y: number) {
    if (vEnd.y === vStart.y) return {
        z: vStart.z,
        recipW: vStart.recipW,
        color: vStart.color || [255, 255, 255],
        normal: vStart.normal,
        uv: vStart.uv
    };
    const t = (y - vStart.y) / (vEnd.y - vStart.y);
    const z = vStart.z + (vEnd.z - vStart.z) * t;
    const recipW = vStart.recipW + (vEnd.recipW - vStart.recipW) * t;
    let color: [number, number, number];
    if (vStart.color && vEnd.color) {
        color = [
            vStart.color[0] + (vEnd.color[0] - vStart.color[0]) * t,
            vStart.color[1] + (vEnd.color[1] - vStart.color[1]) * t,
            vStart.color[2] + (vEnd.color[2] - vStart.color[2]) * t
        ];
    } else {
        color = [255, 255, 255];
    }

    let normal: Vec3 | undefined = undefined;
    if (vStart.normal && vEnd.normal) {
        normal = {
            x: vStart.normal.x + (vEnd.normal.x - vStart.normal.x) * t,
            y: vStart.normal.y + (vEnd.normal.y - vStart.normal.y) * t,
            z: vStart.normal.z + (vEnd.normal.z - vStart.normal.z) * t
        };
    }

    let uv: [number, number] | undefined = undefined;
    if (vStart.uv && vEnd.uv) {
        uv = [
            vStart.uv[0] + (vEnd.uv[0] - vStart.uv[0]) * t,
            vStart.uv[1] + (vEnd.uv[1] - vStart.uv[1]) * t
        ];
    }

    return { z, recipW, color, normal, uv };
}

function boundingBoxCenter(bbox: { min: Vec3, max: Vec3 }): Vec3 {
    return {
        x: (bbox.min.x + bbox.max.x) / 2,
        y: (bbox.min.y + bbox.max.y) / 2,
        z: (bbox.min.z + bbox.max.z) / 2
    };
}

// Small vector helpers for normal computation / lighting
const vsub = (a: Vec3, b: Vec3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vcross = (a: Vec3, b: Vec3) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const vlen = (a: Vec3) => Math.hypot(a.x, a.y, a.z) || 1;
const vnorm = (a: Vec3) => { const L = vlen(a); return { x: a.x / L, y: a.y / L, z: a.z / L }; };
const vdot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const vadd = (a: Vec3, b: Vec3) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vscale = (a: Vec3, s: number) => ({ x: a.x * s, y: a.y * s, z: a.z * s });

function computeBlinnPhongLighting(vertex: Vec3, normal: Vec3, viewDir: Vec3, light: DirectionalLight): Vec3 {
    const ambient = 0.15;
    let diffuseIntensity = 0;
    let specularIntensity = 0;

    if (light) {
        const ldir = vnorm(light.direction); // Ensure light direction is normalized
        const toLight = { x: -ldir.x, y: -ldir.y, z: -ldir.z };
        const normalizedNormal = vnorm(normal);
        diffuseIntensity = Math.max(0, vdot(normalizedNormal, toLight)) * light.intensity;

        // Specular component (Blinn-Phong reflection model)
        const halfwayDir = vnorm({
            x: viewDir.x + toLight.x,
            y: viewDir.y + toLight.y,
            z: viewDir.z + toLight.z
        });
        const specAngle = Math.max(0, vdot(normalizedNormal, halfwayDir));
        specularIntensity = Math.pow(specAngle, 16) * light.intensity;
    }

    const baseColor = { x: 200, y: 120, z: 60 }; // Example base color
    const diff = 1.0 - ambient;

    return {
        x: Math.max(0, Math.min(255, baseColor.x * (ambient + diff * diffuseIntensity + specularIntensity))),
        y: Math.max(0, Math.min(255, baseColor.y * (ambient + diff * diffuseIntensity + specularIntensity))),
        z: Math.max(0, Math.min(255, baseColor.z * (ambient + diff * diffuseIntensity + specularIntensity)))
    };
}

function snapVertexToGrid(svert: ScreenVertex, gridSize = 1): ScreenVertex {
    return {
        x: Math.round(svert.x / gridSize) * gridSize,
        y: Math.round(svert.y / gridSize) * gridSize,
        z: svert.z,
        recipW: svert.recipW,
        color: undefined,
        normal: svert.normal,
        uv: svert.uv
    };
}

export {
    mat4Identity, mat4Mul, mat4MulVec4,
    mat4Perspective, mat4LookAt, mat4RotateY,
    projectVertex, transformTriangleToScreen,
    isTriangleClipped, getScreenVertex,
    interpolateAttrs, vsub, vcross, vlen, vnorm, vdot,
    computeBlinnPhongLighting, snapVertexToGrid,
    boundingBoxCenter, vadd, vscale
};

export type { Vec3, Vec4, Mat4, ScreenVertex };

