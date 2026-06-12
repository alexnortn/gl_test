# gl_test

WebGL + GLSL experiments in computational geometry and shaders, built around one
idea: **turn a connectome-reconstructed neuron's mesh into a graph and animate
neural signals propagating across it.**

**▶ Live site: https://alexnortn.github.io/gl_test/**

The hero piece is **`pd-dual`** — a two-cell retinal circuit. Everything else is
archived under the *Experiments* section of the site.

<br>

## pd-dual — a retinal direction-selectivity circuit

[`pd-dual/`](pd-dual/) places two real neurons from the
[EyeWire](https://eyewire.org) connectome in the same 3D space, exactly where
they sit in the retina, and animates signals moving through them:

- **Cell 10010** — a ganglion cell (blue)
- **Cell 70014** — a starburst amacrine cell / SAC (teal)
- **22 shared synaptic contacts** between them (gold), taken from the connectome's
  contact data

Signals propagate in the biologically correct direction. The **SAC fires outward**
from its soma — an expanding wave that bifurcates down every dendrite to the tips.
The **ganglion cell fires inward** — a pulse travelling back along its arbor to the
cell body. When a SAC wave reaches a shared synapse, that contact flares and hands
the signal across to the ganglion cell: the circuit, firing.

Starburst amacrine cells are central to how the retina detects the *direction* of
motion; the fine structure of SAC→ganglion wiring is what lets the circuit tell
one direction from the other. That is the subject of **“Space-time wiring
specificity supports direction selectivity in the retina”** (Kim et al., *Nature*,
2014, [nature13240](https://www.nature.com/articles/nature13240)) — work from
[Sebastian Seung's](https://seunglab.org) lab that this project grew out of, with
reconstructions traced by the EyeWire citizen-science community.

**Controls:** click a cell or synapse to fire a pulse; **Manual / Circuit / Auto**
modes; per-cell + per-synapse-set toggles; speed, firing-rate (with optional
Perlin variance), and pulse-width sliders; auto-orbit; and Top/Bottom/Left/Right
snap-views. Drag to orbit, right-drag to pan, scroll to zoom.

<br>

## How the signal animation works

The same core technique drives `pd-dual`, `neuron`, `bfs`, `segment`, `ebud`, and
`heart`.

A reconstructed neuron is a triangle **mesh** — tens of thousands of vertices
describing the cell's surface. To animate a glowing band of activity travelling
along the arbor:

1. **Build a graph from the mesh.** Each vertex is a node; vertices sharing a
   triangle edge are neighbours (`adjacency_map`).

2. **Compute a distance field.** A **breadth-first traversal** ([`js/bft.js`](js/bft.js))
   from a root vertex near the soma labels every vertex with its *hop distance*
   from the root — soma = 0, neighbours = 1, … out to the tips. This per-vertex
   value is uploaded to the GPU as the `a_hops` attribute.

3. **Sweep a frontier in the vertex shader.** A `u_frontier` uniform holds a moving
   position along that distance field; vertices within a feathered band around it
   light up. Animating `u_frontier` sends a band of colour across the surface in
   graph-distance order — the "signal". Increasing the frontier sweeps *outward*
   from the soma (SAC); decreasing it sweeps *inward* (ganglion).

4. **Trace specific paths (inward signals).** [`js/bbft.js`](js/bbft.js) walks
   from a tip back toward the soma along the descending-distance gradient, flagging
   each vertex on the route; the shader then lights only vertices that belong to an
   active signal's path. `pd-dual` and `neuron` run up to 16 such paths at once
   (packed into four `vec4` attributes).

<br>

## Experiments

| Path | Description | Stack |
| --- | --- | --- |
| **[`pd-dual/`](pd-dual/)** | **The hero.** Ganglion 10010 ⇄ SAC 70014 two-cell circuit with the 22 shared synapses, direction-correct propagation, synapse transfer, Fresnel rim lighting, and full UI. | three.js r160, ES modules |
| [`neuron/`](neuron/) | Cell 10010 — 16 simultaneous inward "backprop" signals to the soma. The single-cell predecessor of pd-dual. | three.js r160, ES modules |
| [`bfs/`](bfs/) | The frontier-sweep technique on a torus knot — the clearest read of the algorithm. | three.js r160, ES modules |
| [`segment/`](segment/) | Browser-side marching-cubes surface extraction from a segmentation volume, then a frontier sweep. | three.js r84 |
| [`ebud/`](ebud/) · [`heart/`](heart/) | Frontier-sweep variants on a torus knot. | three.js r84 |
| [`pd/`](pd/) | "Pipedream" — the original separately-compiled (`concat.js`) GPGPU connectome viewer (cell 70014) this project grew from. | three.js r84 |
| [`smooth_shader/`](smooth_shader/) | Klein-bottle parametric distance shader. Broken: a `threejs.org` CDN script it loads is now blocked by browsers; needs a version-matched copy vendored. | three.js r84 |
| `eyewire/` · `data/` | Reference library (streams EyeWire meshes) and data-prep tooling (parses `conns.csv` → per-cell JSON). Not visualizations. | — |

<br>

## Run locally

No build step — it's a static site. Serve the repo root over HTTP:

```bash
python3 -m http.server 8000   # from the repo root, then open http://localhost:8000/
```

A web server is required: the experiments fetch mesh data and load ES modules,
both of which browsers block over `file://`. `three.js` is vendored under
[`vendor/three`](vendor/three) (import maps use relative paths, so the site works
both at a domain root and under the `/gl_test/` GitHub Pages subpath) — no live
CDN dependency.

<br>

## Project layout

```
gl_test/
├── index.html                 landing page (pd-dual hero + experiments)
├── pd-dual/                   ▶ the hero: ganglion ⇄ SAC two-cell circuit
│   ├── index.html             shaders, UI, import map
│   └── pd-dual.js             cells, BFS fields, synapses, modes, interaction
├── vendor/three/              locally-vendored three.js (module + addons)
│   └── addons/controls/{OrbitControls, TrackballControls}.js, libs/stats.module.js
├── js/
│   ├── bft.js                 breadth-first traversal → hop-distance field
│   ├── bbft.js                back-traversal: tip → soma path
│   ├── loaders/CTMLoader.js   OpenCTM → THREE.BufferGeometry (modern)
│   ├── ctm/                   vanilla OpenCTM decoder (ctm.js + lzma.js)
│   ├── animationController_neuron.js   neuron app
│   ├── animationController.js / dmc.js / *worker.js   segment (marching cubes)
│   └── three.min.js, trackballControls.js   r84 build for the older experiments
├── cells/10010.ctm            ganglion mesh (OpenCTM, ~2.2 MB)
├── pd/data/70014              SAC mesh (OpenCTM)
├── data/scripts/conns-*.json  per-cell synaptic contact data
└── neuron/ bfs/ segment/ ebud/ heart/ smooth_shader/ pd/ eyewire/ data/
```

<br>

## Implementation notes

- **Mesh format.** Neurons are stored as **OpenCTM** (`.ctm`), a compact
  LZMA-compressed triangle-mesh format. [`js/loaders/CTMLoader.js`](js/loaders/CTMLoader.js)
  wraps the framework-agnostic OpenCTM decoder and emits a `THREE.BufferGeometry`
  (three.js dropped its own CTM loader long ago).
- **Synapses.** `conns.csv` is a connectome contact table; each contact carries a
  partner cell and a `centroid` in mesh world space. The partner-attributed
  `data/scripts/conns-10010.json` yields the 22 contacts between 10010 and 70014.
- **Per-vertex data on the GPU.** The graph-distance field (`a_hops`) and
  signal-path membership (`a_backprop1..4`) ride as custom `BufferAttribute`s, so
  each frame only advances a few uniforms — the shader does the rest.
- **Deployment.** A `.nojekyll` file disables Jekyll on GitHub Pages; import maps
  use relative paths so the site runs unchanged at root or under `/gl_test/`.
