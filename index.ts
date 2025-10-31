import { OBJLoader } from "./src/Loaders/OBJLoader";
import { Camera } from "./src/Objects/Camera";
import { DirectionalLight } from "./src/Objects/DirectionalLight";
import { Renderer, type RendererOptions } from "./src/Renderer";

const options: RendererOptions = {
    shading: "flat",
    snapVertices: false,
};

async function startRendering() {
    const renderer = new Renderer("canvas", options);
    const objLoader = new OBJLoader()

    // since we running this in the browser, we can load from URL
    const model = await objLoader.loadFromUrl('src/Examples/teddyBear.obj');
    // set up camera
    const camera = new Camera({ x: -50, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1.0);
    renderer.setCamera(camera);

    // set up a directional light
    // light coming from top-left-front
    const light = new DirectionalLight({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, 0.6);
    renderer.setDirectionalLight(light);

    renderer.addModel(model);
    renderer.start();
}

startRendering();