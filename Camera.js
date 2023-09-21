import { mat4, quat, vec3 } from "./Math/index.js"
export class Camera {

    constructor() {
        this.position = vec3.create()
        this.rotation = vec3.create()
        this.target = vec3.create()
    }
}