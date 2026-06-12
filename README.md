# gl_test

A collection of WebGL + GLSL computational-geometry and shader experiments. The
through-line is **visualizing neural signal propagation through
connectome-reconstructed neuron meshes**: real neurons, digitally reconstructed
as 3D surfaces, with animated "signals" that travel along their branching
structure the way an action potential would.

The meshes come from connectomics datasets (e.g. EyeWire); cell `10010` is the
primary example used throughout.

<br>

## Run

There is no build step — it's a static site. Serve the repo root over HTTP and
open an experiment:

```bash
python3 -m http.server 8000   # run from the repo root
```

Then visit:

- <http://localhost:8000/> — landing page linking to every experiment
- <http://localhost:8000/neuron/> — the main connectome signal-propagation piece
- <http://localhost:8000/bfs/> — the clearest standalone demo of the technique

A web server is required (the experiments fetch mesh data and load ES modules,
both of which browsers refuse to do over the `file://` protocol). `three.js` is
vendored locally under `/vendor/three`, so the experiments run fully offline with
no external CDN dependencies.

<br>

## How the signal animation works

This technique drives the `neuron`, `bfs`, `segment`, `ebud`, and `heart`
experiments.

A reconstructed neuron is a triangle **mesh** — tens of thousands of vertices
describing the cell's surface. The goal is to animate a glowing band of activity
travelling along the arbor.

1. **Build a graph from the mesh.** Each vertex becomes a graph node; vertices
   that share a triangle edge become neighbours (`adjacency_map`).

2. **Compute a distance field.** A **breadth-first traversal** (`js/bft.js`) from
   a root vertex near the soma (cell body) labels every vertex with its *hop
   distance* from the root — soma = 0, its neighbours = 1, and so on out to the
   dendrite tips. This per-vertex integer is uploaded to the GPU as the `a_hops`
   vertex attribute, giving the shader a notion of "how far along the cell" each
   vertex sits.

3. **Sweep a frontier in the vertex shader.** A `u_frontier` uniform holds a
   moving position along that distance field. Each vertex compares its `a_hops`
   to the frontier and lights up (red, fading to blue) when it falls inside a
   feathered band around the current frontier value. Animating `u_frontier` makes
   a band of colour travel across the surface in graph-distance order — the
   "signal".

4. **Shade for depth.** The fragment shader adds camera- and light-direction
   dot-product shading so the 3D form reads clearly beneath the moving colour.

### The `neuron` experiment (cell 10010)

The neuron experiment animates many signals at once, each flowing *inward* toward
the soma — a "backpropagation" event rather than a single outward sweep:

- **`js/bbft.js`** traces a path from a tip vertex back down to the soma by always
  stepping to a neighbour with a *lower* hop distance (following the gradient of
  the distance field from step 2). Every vertex on that path is flagged.
- **Up to 16 independent signals** animate simultaneously. Their per-vertex
  path-membership flags are packed into four `vec4` attributes (`a_backprop1..4`,
  4 channels each = 16 channels total), and the 16 frontier positions live in a
  `u_frontier[16]` uniform array. A vertex is lit only when an active frontier
  reaches its hop distance **and** the vertex belongs to that frontier's traced
  path — so each signal stays confined to its own route to the soma.
- **Interaction:** the idle animation continuously re-fires signals from random
  dendrite tips. **Shift-click** the mesh to fire a signal from the picked point;
  **drag** to orbit (trackball), **scroll** to zoom.

### The `segment` experiment

Rather than loading a finished mesh, `segment` reconstructs one in the browser:
it streams a 3D **segmentation volume** (`volume/segmentation`) into a Web Worker
that runs a marching-cubes algorithm (the Emscripten-compiled `js/dmc.js`) to
extract an isosurface, then runs the same frontier-sweep animation on the result.

<br>

## Experiments

| Path | Description |
| --- | --- |
| **`neuron/`** | Cell 10010 — up to 16 simultaneous "backprop" signals propagating to the soma across a real connectome mesh. The headline visualization. |
| **`bfs/`** | The frontier-sweep technique on a torus knot. The simplest, clearest read of the algorithm. |
| `segment/` | Browser-side marching-cubes surface extraction from a segmentation volume, followed by the frontier sweep. |
| `ebud/` | Frontier-sweep variant on a torus knot. |
| `heart/` | Frontier-sweep variant on a torus knot. |
| `pd/` | "Pipedream" — a separately-compiled (`concat.js`) GPGPU connectome viewer (cell 70014) with grow / propagate / static GLSL passes. |
| `smooth_shader/` | Klein-bottle parametric-geometry distance-shader test. Currently broken: it depends on a `ParametricGeometries.js` script fetched from `threejs.org` that modern browsers block; it needs a version-matched copy vendored locally to run. |
| `eyewire/` | A library (`cell.js`) that streams EyeWire meshes from Google Cloud Storage. No standalone page, and the remote endpoints are likely defunct — kept for reference. |
| `data/` | Data-prep tooling: Node scripts (`data/scripts/`) that parse the connectomics CSV (`conns.csv`) into per-cell JSON, plus a GPGPU nearest-vertex utility. Not a visualization; most large inputs are gitignored. |

`neuron` and `bfs` run on a current three.js (ES modules + import map). The other
experiments run on the bundled three.js r84 they were originally written against.

<br>

## Project layout

```
gl_test/
├── index.html                 landing page (links to experiments)
├── vendor/three/              locally-vendored three.js (module build + addons)
│   ├── three.module.js
│   └── addons/{controls/TrackballControls.js, libs/stats.module.js}
├── js/
│   ├── animationController_neuron.js   neuron app
│   ├── bft.js                 breadth-first traversal → hop-distance field
│   ├── bbft.js                back-traversal: tip → soma path
│   ├── loaders/CTMLoader.js   OpenCTM → THREE.BufferGeometry loader
│   ├── ctm/                   vanilla OpenCTM decoder (ctm.js + lzma.js)
│   ├── animationController.js segment app (marching cubes)
│   ├── dmc.js / *worker.js    Emscripten marching cubes + Web Workers
│   ├── three.min.js           three.js r84 (used by the older experiments)
│   └── trackballControls.js   r84-era global THREE.TrackballControls
├── cells/10010.ctm            neuron 10010 mesh (OpenCTM, ~2.2 MB)
├── volume/segmentation        3D label volume for the segment experiment (~33 MB)
└── neuron/  bfs/  segment/  ebud/  heart/  smooth_shader/  pd/  eyewire/  data/
```

<br>

## Implementation notes

- **Mesh format.** Neuron meshes are stored as **OpenCTM** (`.ctm`) — a compact,
  LZMA-compressed triangle-mesh format. `js/loaders/CTMLoader.js` wraps the
  framework-agnostic OpenCTM decoder (`js/ctm/ctm.js` + `lzma.js`) and produces a
  `THREE.BufferGeometry`.
- **No bundler.** The modern experiments use native ES modules with an
  `<script type="importmap">` that resolves `three` and `three/addons/` to the
  vendored files in `/vendor/three`.
- **Per-vertex data on the GPU.** The animation pushes its graph-distance field
  (`a_hops`) and signal-path membership (`a_backprop1..4`) as custom
  `BufferAttribute`s, so the heavy lifting each frame is just advancing a handful
  of uniforms — the shader does the rest.
- **Coordinates.** Connectome meshes live in raw dataset voxel coordinates (tens
  of thousands of units across), so the cameras use correspondingly large
  near/far planes.
