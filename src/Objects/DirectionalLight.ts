import type { Vec3 } from "../Math";

export class DirectionalLight {
    direction: Vec3;
    color: Vec3; // RGB
    intensity: number;

    constructor(direction: Vec3, color: Vec3, intensity: number) {
        this.direction = direction;
        this.color = color;
        this.intensity = intensity;
    }
}