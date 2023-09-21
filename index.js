import { Device } from "./Device.js";
import { Mesh } from "./Mesh.js"
import { Camera } from "./Camera.js"
import { vec3 } from "./Math/index.js";

let canvas;
let device;
let mesh;
let meshes = [];
let mera;

function init() {
    canvas = document.getElementById("frontBuffer");
    mera = new Camera();
    device = new Device(canvas);
    mera.position = vec3.fromValues(0, 0, 10);
    mera.target = vec3.fromValues(0, 0, 0);

    var mesh = new Mesh("Cube", new Array(8), new Array(12));
    meshes.push(mesh);
    mesh.vertices[0] = vec3.fromValues(-1, 1, 1);
    mesh.vertices[1] = vec3.fromValues(1, 1, 1);
    mesh.vertices[2] = vec3.fromValues(-1, -1, 1);
    mesh.vertices[3] = vec3.fromValues(1, -1, 1);
    mesh.vertices[4] = vec3.fromValues(-1, 1, -1);
    mesh.vertices[5] = vec3.fromValues(1, 1, -1);
    mesh.vertices[6] = vec3.fromValues(1, -1, -1);
    mesh.vertices[7] = vec3.fromValues(-1, -1, -1);

    mesh.faces[0] = { A: 0, B: 1, C: 2 };
    mesh.faces[1] = { A: 1, B: 2, C: 3 };
    mesh.faces[2] = { A: 1, B: 3, C: 6 };
    mesh.faces[3] = { A: 1, B: 5, C: 6 };
    mesh.faces[4] = { A: 0, B: 1, C: 4 };
    mesh.faces[5] = { A: 1, B: 4, C: 5 };

    mesh.faces[6] = { A: 2, B: 3, C: 7 };
    mesh.faces[7] = { A: 3, B: 6, C: 7 };
    mesh.faces[8] = { A: 0, B: 2, C: 7 };
    mesh.faces[9] = { A: 0, B: 4, C: 7 };
    mesh.faces[10] = { A: 4, B: 5, C: 6 };
    mesh.faces[11] = { A: 4, B: 6, C: 7 };

    requestAnimationFrame(drawingLoop);
}

function drawingLoop() {
    device.clear();
    for (let i = 0; i < meshes.length; i++) {
        meshes[i].rotation[0] += 0.5;
        meshes[i].rotation[1] += 0.5;
    }

    device.render(mera, meshes);
    device.swap();

    requestAnimationFrame(drawingLoop);
}

init()