import { vec3 } from "./Math/index.js"

export class Mesh {
    constructor(name) {
        this.name = name;
        this.vertices = []
        this.faces = []
        this.rotation = vec3.create()
        this.position = vec3.create()
    }
}