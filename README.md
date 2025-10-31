# 3DJS Renderer

Welcome to the **3DJS Renderer** project! This is a TypeScript-based 3D rendering engine that I built to explore the fundamentals of computer graphics and rendering pipelines. The project focuses on implementing core rendering techniques, including wireframe rendering, triangle rasterization, and advanced line-drawing algorithms like Bresenham's 3D and EFLA.

## Features
- **Wireframe Rendering**: Visualize 3D models in wireframe mode.
- **Triangle Rasterization**: Render filled triangles with depth testing.
- **Custom Line Algorithms**: Implemented Bresenham's 3D and Extremely Fast Line Algorithm (EFLA).
- **Lighting Models**: Support for flat shading and Blinn-Phong shading.
- **Z-Buffering**: Depth testing to handle occlusion.

## What I Learned
This project has been an incredible learning experience! Here are some of the key takeaways:

1. **3D Math**: Gained a deeper understanding of vector math, matrix transformations, and projections.
2. **Rendering Pipeline**: Learned how to transform 3D models into 2D screen space and handle clipping, culling, and depth testing.
3. **Line-Drawing Algorithms**: Explored and implemented efficient algorithms for drawing lines in 3D space.
4. **Debugging Graphics**: Improved my debugging skills by tackling issues like invisible lines, depth testing errors, and vertex transformations.
5. **TypeScript**: Strengthened my TypeScript skills, especially in handling complex types and interfaces.

## How to Run
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/3DJS.git
   ```
2. Install dependencies:
   ```bash
   bun install
   ```
3. Build the project:
   ```bash
   bun run build
   ```
4. Open `index.html` in your browser to see the renderer in action.

## Future Plans
- Add support for textures and UV mapping.
- Optimize performance for larger models.
- Experiment with real-time shadows and reflections.

Feel free to explore the code and contribute if you'd like! This project is a stepping stone for me to dive deeper into the world of computer graphics. 🚀

![Example Rendering](./images/image.png)
