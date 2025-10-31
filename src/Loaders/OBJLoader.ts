import type { Vec3 } from "../Math";

export interface MeshData {
    readonly name: string;
    readonly materialName?: string | null;
    readonly positions: Float32Array; // x,y,z per vertex
    readonly normals: Float32Array;   // x,y,z per vertex
    readonly uvs: Float32Array | null; // u,v per vertex (or null if none)
    readonly indices: Uint32Array;     // triangle indices
    readonly boundingBox: { min: Vec3, max: Vec3 };
}

export type ColorRGB = [number, number, number];

export interface Material {
    readonly name: string;
    kd?: ColorRGB; // diffuse rgb
    ks?: ColorRGB; // specular rgb
    ns?: number;   // shininess
    mapKd?: string; // texture filename
}

export interface ObjModel {
    readonly meshes: MeshData[];
    readonly materials: Record<string, Material>;
}

function toFloatArray(arr: number[]): Float32Array {
    return new Float32Array(arr);
}

function triFan(indices: number[]): number[] {
    // Convert n-gon face into triangle indices assuming polygon is convex and vertices ordered
    const out: number[] = [];
    for (let i = 1; i + 1 < indices.length; i++) {
        out.push(indices[0], indices[i], indices[i + 1]);
    }
    return out;
}

function resolveIndex(idxStr: string, arrayLength: number): number {
    const i = parseInt(idxStr, 10);
    if (isNaN(i)) throw new Error(`Malformed OBJ index: '${idxStr}'`);
    if (i > 0) return i - 1;
    return arrayLength + i; // negative indexing per OBJ spec
}

function computeBoundingBox(positions: Float32Array): { min: Vec3, max: Vec3 } {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];

        if (x < min.x) min.x = x;
        if (y < min.y) min.y = y;
        if (z < min.z) min.z = z;

        if (x > max.x) max.x = x;
        if (y > max.y) max.y = y;
        if (z > max.z) max.z = z;
    }

    return { min, max };
}

export class OBJLoader {
    /**
     * Parse OBJ text and optional MTL text into ObjModel
     * @param objText OBJ file contents
     * @param mtlTexts Optional map of MTL filenames to contents
     */
    parse(objText: string, mtlTexts?: Record<string, string>): ObjModel {
        // Store raw attribute lists as read from the file
        const rawPositions: number[] = [];
        const rawUVs: number[] = [];
        const rawNormals: number[] = [];

        // Grouping/mesh state
        interface CurrentGroup {
            name: string;
            materialName?: string | null;
            faceVertexStrs: string[][]; // array of faces, each face is array of vertex strings like "v/vt/vn"
        }

        const groups: CurrentGroup[] = [];
        let current: CurrentGroup = { name: 'default', materialName: null, faceVertexStrs: [] };
        groups.push(current);

        // Materials parsed from MTL texts
        const materials: Record<string, Material> = {};
        if (mtlTexts) {
            for (const [key, text] of Object.entries(mtlTexts)) {
                const parsed = this.parseMTL(text);
                Object.assign(materials, parsed);
            }
        }

        const lines = objText.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const parts = line.split(/\s+/);
            const tag = parts[0];

            switch (tag) {
                case 'v': {
                    // Vertex position
                    const [x, y, z] = parts.slice(1, 4).map(Number);
                    if ([x, y, z].some(n => isNaN(n))) throw new Error(`Malformed vertex position: ${parts.join(' ')}`);
                    rawPositions.push(x, y, z);
                    break;
                }
                case 'vt': {
                    const [u, v] = [parseFloat(parts[1]), parseFloat(parts[2] ?? '0')];
                    if (isNaN(u) || isNaN(v)) throw new Error(`Malformed texture coordinate: ${parts.join(' ')}`);
                    rawUVs.push(u, v);
                    break;
                }
                case 'vn': {
                    const [nx, ny, nz] = parts.slice(1, 4).map(Number);
                    if ([nx, ny, nz].some(n => isNaN(n))) throw new Error(`Malformed normal: ${parts.join(' ')}`);
                    rawNormals.push(nx, ny, nz);
                    break;
                }
                case 'f': {
                    // Face: array of vertex strings like "v", "v/vt", "v//vn", or "v/vt/vn"
                    const face = parts.slice(1);
                    if (face.length < 3) throw new Error(`Face with less than 3 vertices: ${parts.join(' ')}`);
                    current.faceVertexStrs.push(face);
                    break;
                }
                case 'o':
                case 'g': {
                    const name = parts.slice(1).join(' ') || 'unnamed';
                    current = { name, materialName: null, faceVertexStrs: [] };
                    groups.push(current);
                    break;
                }
                case 'usemtl': {
                    const mname = parts[1] ?? null;
                    current.materialName = mname;
                    break;
                }
                case 'mtllib': {
                    // When parsing from string we can't fetch files here; caller can supply mtlTexts
                    // Keep the filename so caller may map it to provided mtlTexts
                    // Ignored here because mtlTexts param already handled externally
                    break;
                }
                case 's': {
                    // Smoothing group - could be used to split meshes for sharp edges. Ignored here.
                    break;
                }
                default:
                    // Ignore other tags silently
                    break;
            }
        }

        // For each group, convert faces and build indexed vertex arrays
        const meshes: MeshData[] = [];

        for (const group of groups) {
            if (group.faceVertexStrs.length === 0) continue; // Skip empty groups

            // Map for unique vertex (position + uv + normal)
            const vertexMap: Map<string, number> = new Map();
            const positions: number[] = [];
            const normals: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];

            // Helper to add a vertex and return its index
            function addVertex(vIdx?: number, vtIdx?: number, vnIdx?: number): number {
                const key = `${vIdx ?? ''}_${vtIdx ?? ''}_${vnIdx ?? ''}`;
                let idx = vertexMap.get(key);
                if (idx !== undefined) return idx;
                idx = positions.length / 3;
                vertexMap.set(key, idx);
                // Push position
                const pi = vIdx! * 3;
                const [px, py, pz] = [rawPositions[pi], rawPositions[pi + 1], rawPositions[pi + 2]];
                positions.push(px, py, pz);
                // Push uv
                if (vtIdx !== undefined && !isNaN(vtIdx)) {
                    const ti = vtIdx * 2;
                    const [u, v] = [rawUVs[ti] ?? 0, rawUVs[ti + 1] ?? 0];
                    uvs.push(u, v);
                } else {
                    uvs.push(0, 0);
                }
                // Push normal
                if (vnIdx !== undefined && !isNaN(vnIdx)) {
                    const ni = vnIdx * 3;
                    const [nx, ny, nz] = [rawNormals[ni] ?? 0, rawNormals[ni + 1] ?? 0, rawNormals[ni + 2] ?? 0];
                    normals.push(nx, ny, nz);
                } else {
                    normals.push(0, 0, 0);
                }
                return idx;
            }

            for (const face of group.faceVertexStrs) {
                // Parse each vertex in the face
                const faceIndices: number[] = [];
                for (const vertStr of face) {
                    const comps = vertStr.split('/');
                    const vIdx = resolveIndex(comps[0], rawPositions.length / 3);
                    const vtIdx = comps[1] ? resolveIndex(comps[1], rawUVs.length / 2) : undefined;
                    const vnIdx = comps[2] ? resolveIndex(comps[2], rawNormals.length / 3) : undefined;
                    const idx = addVertex(vIdx, vtIdx, vnIdx);
                    faceIndices.push(idx);
                }
                // Triangulate if necessary
                const triIdx = triFan(faceIndices);
                indices.push(...triIdx);
            }

            // If normals were all zero (no vn provided), compute per-vertex normals by averaging face normals
            let needComputeNormals = true;
            for (let i = 0; i < normals.length; i++) {
                if (normals[i] !== 0) { needComputeNormals = false; break; }
            }

            if (needComputeNormals) {
                // Init normals to zero
                for (let i = 0; i < normals.length; i++) normals[i] = 0;
                for (let i = 0; i < indices.length; i += 3) {
                    const ia = indices[i] * 3;
                    const ib = indices[i + 1] * 3;
                    const ic = indices[i + 2] * 3;
                    const [ax, ay, az] = [positions[ia], positions[ia + 1], positions[ia + 2]];
                    const [bx, by, bz] = [positions[ib], positions[ib + 1], positions[ib + 2]];
                    const [cx, cy, cz] = [positions[ic], positions[ic + 1], positions[ic + 2]];
                    const [ux, uy, uz] = [bx - ax, by - ay, bz - az];
                    const [vx, vy, vz] = [cx - ax, cy - ay, cz - az];
                    // Face normal = u x v
                    const nx = uy * vz - uz * vy;
                    const ny = uz * vx - ux * vz;
                    const nz = ux * vy - uy * vx;
                    // Accumulate
                    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
                    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
                    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
                }
                // Normalize normals
                for (let i = 0; i < normals.length; i += 3) {
                    const [nx, ny, nz] = [normals[i], normals[i + 1], normals[i + 2]];
                    const len = Math.hypot(nx, ny, nz) || 1;
                    normals[i] = nx / len; normals[i + 1] = ny / len; normals[i + 2] = nz / len;
                }
            }

            const mesh: MeshData = {
                name: group.name,
                materialName: group.materialName ?? null,
                positions: toFloatArray(positions),
                normals: toFloatArray(normals),
                boundingBox: computeBoundingBox(toFloatArray(positions)),
                uvs: uvs.length > 0 ? new Float32Array(uvs) : null,
                indices: new Uint32Array(indices),
            };

            meshes.push(mesh);
        }

        return { meshes, materials };
    }

    /**
     * Minimal MTL parser
     * @param mtlText MTL file contents
     */
    parseMTL(mtlText: string): Record<string, Material> {
        const lines = mtlText.split(/\r?\n/);
        const materials: Record<string, Material> = {};
        let current: Material | null = null;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const parts = line.split(/\s+/);
            const tag = parts[0];
            switch (tag) {
                case 'newmtl': {
                    const name = parts[1] ?? 'unnamed';
                    current = { name };
                    materials[name] = current;
                    break;
                }
                case 'Kd': {
                    if (!current) break;
                    const rgb: ColorRGB = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                    if (rgb.some(n => isNaN(n))) throw new Error(`Malformed Kd: ${parts.join(' ')}`);
                    current.kd = rgb;
                    break;
                }
                case 'Ks': {
                    if (!current) break;
                    const rgb: ColorRGB = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                    if (rgb.some(n => isNaN(n))) throw new Error(`Malformed Ks: ${parts.join(' ')}`);
                    current.ks = rgb;
                    break;
                }
                case 'Ns': {
                    if (!current) break;
                    const ns = parseFloat(parts[1]);
                    if (isNaN(ns)) throw new Error(`Malformed Ns: ${parts.join(' ')}`);
                    current.ns = ns;
                    break;
                }
                case 'map_Kd': {
                    if (!current) break;
                    current.mapKd = parts.slice(1).join(' ');
                    break;
                }
                default:
                    // Ignore other tags
                    break;
            }
        }

        return materials;
    }

    private async loadFromText(objText: string, options?: { mtlResolver?: (mtlFilename: string) => Promise<string | null>, objPath?: string }): Promise<ObjModel> {
        const mtlTexts: Record<string, string> = {};
        const mtllibs: string[] = [];
        const lines = objText.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const parts = line.split(/\s+/);
            if (parts[0] === 'mtllib' && parts[1]) mtllibs.push(parts[1]);
        }

        if (mtllibs.length && options?.mtlResolver) {
            for (const m of mtllibs) {
                try {
                    const text = await options.mtlResolver(m);
                    if (text) mtlTexts[m] = text;
                } catch (e) {
                    // ignore single failures; parse will continue without materials
                }
            }
        } else if (mtllibs.length && options?.objPath) {
            // Default: try to load MTL files from same directory as OBJ
            const fs = await import('fs/promises');
            const path = await import('path');
            const objDir = path.dirname(options.objPath);
            for (const m of mtllibs) {
                try {
                    const mtlPath = path.join(objDir, m);
                    const mtlText = await fs.readFile(mtlPath, 'utf8');
                    mtlTexts[m] = mtlText;
                } catch (e) {
                    // ignore single failures
                }
            }
        }

        return this.parse(objText, Object.keys(mtlTexts).length ? mtlTexts : undefined);
    }

    /**
     * Load OBJ (and optionally MTL) from a remote URL (http/https or local server)
     */
    async loadFromUrl(objUrl: string, options?: { mtlResolver?: (mtlFilename: string) => Promise<string | null> }): Promise<ObjModel> {
        const objResp = await fetch(objUrl);
        if (!objResp.ok) throw new Error(`Failed to fetch OBJ: ${objResp.status}`);
        const objText = await objResp.text();
        return this.loadFromText(objText, options);
    }

    /**
     * Load OBJ (and optionally MTL) from a local file path (Node.js only)
     */
    async loadFromFile(objPath: string, options?: { mtlResolver?: (mtlFilename: string) => Promise<string | null> }): Promise<ObjModel> {
        const fs = await import('fs/promises');
        const objText = await fs.readFile(objPath, 'utf8');
        return this.loadFromText(objText, { ...options, objPath });
    }
}
// Extend this file by adding support for:
// - splitting by smoothing groups,
// - reading per-face materials,
// - storing multiple UV sets,
// - loading textures referenced in MTL and producing GPU-friendly structures.
