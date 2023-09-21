import { vec3 } from "./Math/index.js"

export class Mesh {
    constructor(name, vertices, faces) {
        this.name = name;
        this.vertices = vertices
        this.faces = faces
        this.rotation = vec3.create()
        this.position = vec3.create()
    }
}