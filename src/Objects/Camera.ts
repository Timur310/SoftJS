import { vsub, vcross, vnorm, vscale, vadd, type Vec3 } from "../Math";

export class Camera {
    position: Vec3;
    up: Vec3;
    speed: number;
    yaw: number;
    pitch: number;

    constructor(position: Vec3, up: Vec3, speed: number = 1.0, yaw: number = 0, pitch: number = 0) {
        this.position = position;
        this.up = up;
        this.speed = speed;
        this.yaw = yaw;
        this.pitch = pitch;

        this.initKeyboardControls();
    }

    private initKeyboardControls() {
        window.addEventListener("keydown", (event) => {
            switch (event.key) {
                case "w":
                    this.moveForward();
                    break;
                case "s":
                    this.moveBackward();
                    break;
                case "a":
                    this.moveLeft();
                    break;
                case "d":
                    this.moveRight();
                    break;
                case "ArrowRight":
                    this.rotateY(0.1);
                    break;
                case "ArrowLeft":
                    this.rotateY(-0.1);
                    break;
            }
        });
    }

    public getForwardVector(): Vec3 {
        const cosPitch = Math.cos(this.pitch);
        return {
            x: Math.cos(this.yaw) * cosPitch,
            y: Math.sin(this.pitch),
            z: Math.sin(this.yaw) * cosPitch
        };
    }

    private getRightVector(): Vec3 {
        const forward = this.getForwardVector();
        return vnorm(vcross(forward, this.up));
    }

    private moveForward() {
        const forward = this.getForwardVector();
        this.position = vadd(this.position, vscale(forward, this.speed));
    }

    private moveBackward() {
        const forward = this.getForwardVector();
        this.position = vsub(this.position, vscale(forward, this.speed));
    }

    private moveLeft() {
        const right = this.getRightVector();
        this.position = vsub(this.position, vscale(right, this.speed));
    }

    private moveRight() {
        const right = this.getRightVector();
        this.position = vadd(this.position, vscale(right, this.speed));
    }

    private rotateY(angle: number) {
        this.yaw += angle;
    }
}