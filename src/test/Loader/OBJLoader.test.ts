// tests/OBJLoader.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { OBJLoader } from '../../Loaders/OBJLoader'; // adjust import path

describe('OBJLoader', () => {
    let loader: OBJLoader;

    beforeEach(() => {
        loader = new OBJLoader();
    });

    // Helper to check if a normal is unit length
    function expectUnitNormal(nx: number, ny: number, nz: number) {
        expect(Math.abs(Math.hypot(nx, ny, nz) - 1)).toBeLessThan(1e-6);
    }

    it('parses model from URL locally', async () => {
        const model = await loader.loadFromFile('src/Examples/diamond.obj');
        expect(model).toBeDefined();
        // Additional assertions can be made here based on the expected model structure
        expect(model.meshes.length).toBeGreaterThan(0);
    });

    it('parses model from URL remotely', async () => {
        const model = await loader.loadFromUrl('https://people.sc.fsu.edu/~jburkardt/data/obj/diamond.obj');
        expect(model).toBeDefined();
        expect(model.meshes.length).toBeGreaterThan(0);
    });

    it('parses a simple quad correctly', () => {
        const objText = `
            o Quad
            v 0 0 0
            v 1 0 0
            v 1 1 0
            v 0 1 0
            vt 0 0
            vt 1 0
            vt 1 1
            vt 0 1
            vn 0 0 1
            f 1/1/1 2/2/1 3/3/1 4/4/1
        `;
        const model = loader.parse(objText);

        // Should have one mesh named 'Quad'
        expect(model.meshes.length).toBe(1);
        const mesh = model.meshes[0];
        expect(mesh.name).toBe('Quad');

        // Should have 4 unique vertices (positions, normals, uvs)
        expect(mesh.positions.length).toBe(12);
        expect(mesh.normals.length).toBe(12);
        expect(mesh.indices.length).toBe(6); // triangulated quad (2 triangles)

        // UVs should not be null and have correct length
        expect(mesh.uvs).not.toBeNull();
        if (mesh.uvs) {
            expect(mesh.uvs.length).toBe(8);
        }

        // First vertex position should be [0, 0, 0]
        expect(Array.from(mesh.positions.slice(0, 3))).toEqual([0, 0, 0]);

        // All normals should be unit length
        for (let i = 0; i < mesh.normals.length; i += 3) {
            expectUnitNormal(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
        }
    });

    it('computes normals when none provided', () => {
        const objText = `
            o Triangle
            v 0 0 0
            v 1 0 0
            v 0 1 0
            f 1 2 3
        `;
        const model = loader.parse(objText);
        const mesh = model.meshes[0];

        // Should have auto-generated normals
        expect(mesh.normals.length).toBe(mesh.positions.length);
        expectUnitNormal(mesh.normals[0], mesh.normals[1], mesh.normals[2]);
    });
});
