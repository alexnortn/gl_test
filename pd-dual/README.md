# pd-dual

A two-cell retinal circuit: ganglion cell **10010** (blue) and starburst amacrine
cell **70014** (teal), shown together in their shared connectome world frame, with
the **22 synaptic contacts** between them (gold) and direction-correct signal
propagation.

> The hero visualization of this repo — see the [top-level README](../README.md)
> for the neuroscience and the paper it relates to.

## Files

- **`index.html`** — page shell: the `sac-vertex` / `gan-vertex` / `frag` (Fresnel
  rim) shaders, the import map, and the control panel.
- **`pd-dual.js`** — the app: loads both meshes ([`../cells/10010.ctm`](../cells),
  [`../pd/data/70014`](../pd/data)), builds each cell's vertex graph + BFS
  hop-distance field, maps the shared contacts to mesh vertices, and runs the
  propagation/transfer logic, interaction, and UI.

## How it behaves

- **SAC (70014)** propagates **outward** from the soma — an expanding shell over
  the hop-distance field that bifurcates down every branch to the tips.
- **Ganglion (10010)** propagates **inward** — a pulse traced from a point back
  along its arbor to the soma (`bbft`).
- **Synapse transfer:** when a SAC wave crosses a shared contact's hop distance,
  the gold sphere glows and fires an inward ganglion pulse from that contact.

## Controls

- **Click** a cell or synapse to fire a pulse · **drag** orbit · **right-drag** pan
  · **scroll** zoom.
- **Modes:** Manual (click) · Circuit (SAC → ganglion) · Auto (+ phantom ganglion
  pulses from its other contacts).
- **Sliders:** Speed (impulse propagation), Firing rate (activations/sec, with a
  **Perlin** toggle for natural timing variance), Pulse width, Orbit speed.
- **Toggles:** each cell, the 22 shared contacts, and the full ~13k contact clouds
  (which respect cell visibility).
- **Snap views:** Top / Bottom / Left / Right (re-centre + fit both cells).
- **Keys:** `Space` SAC pulse · `1`/`2` cells · `S`/`A` synapses · `M` mode.
- **`?embed`** — ambient hero mode (UI hidden, auto-orbit, circuit running); used
  by the landing page.
