import { Device } from "./Device.js";
import { Mesh } from "./Mesh.js"
import { Camera } from "./Camera.js"
import { vec3 } from "./Math/index.js";
import { OBJParser } from "./OBJParser.js";

let canvas;
let device;
let meshes = [];
let mera;

async function init() {
    canvas = document.getElementById("frontBuffer");
    mera = new Camera();
    device = new Device(canvas);
    mera.position = vec3.fromValues(0, 0, 10);
    mera.target = vec3.fromValues(0, 0, 0);

    const parser = new OBJParser()
    const result = await  parser.parseFile("./example.obj")
    for(const group in result)
    {
        let mesh = new Mesh(group);
        mesh.faces = result[group].faces
        mesh.vertices = result[group].vertices

        meshes.push(mesh)
    }

    requestAnimationFrame(drawingLoop);
}

function drawingLoop() {
    device.clear();
    for (let i = 0; i < meshes.length; i++) {
        meshes[i].rotation[0] += 0.1;
        meshes[i].rotation[1] += 0.1;
    }

    device.render(mera, meshes);
    device.swap();

    requestAnimationFrame(drawingLoop);
}

await init()
