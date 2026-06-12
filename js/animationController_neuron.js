// animationController_neuron.js
// ---------------------------------------------------------------------------
// Drives the "neural signal propagation" visualization for connectome cell 10010.
//
// Pipeline:
//   1. Load the neuron's surface mesh (cells/10010.ctm) into a BufferGeometry.
//   2. Build a vertex adjacency graph from the triangle index buffer.
//   3. bft(): BFS hop-distance from a soma-adjacent root vertex to every vertex
//      → uploaded as the `a_hops` attribute (a distance field over the surface).
//   4. Animate up to 16 independent "backprop" signals: each is a path traced by
//      bbft() from a tip back down to the soma, lit by a frontier value that
//      sweeps along `a_hops`. Shift-click fires a signal from a picked point;
//      idle slots re-fire from random tips so the arbor keeps pulsing.
//
// Modernized from the original three.js r84 / jQuery globals build to ES modules
// on a current three.js (see /vendor/three). Behaviour-preserving except where
// noted ("FIX"/"MODERNIZE").
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { CTMLoader } from './loaders/CTMLoader.js';
import { bft } from './bft.js';
import { bbft } from './bbft.js';

// ---- Scene / camera / renderer ------------------------------------------------

// The neuron mesh lives in raw EyeWire voxel coordinates (tens of thousands of
// units across), so NEAR/FAR are set very large to bracket it.
const VIEW_ANGLE = 45;
const NEAR = 1000;
const FAR = 1000000000;

let WIDTH = window.innerWidth;
let HEIGHT = window.innerHeight;

const container = document.querySelector( '#container' );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( WIDTH, HEIGHT );
renderer.domElement.style.display = 'block'; // avoid inline-block scrollbars in fullscreen
container.appendChild( renderer.domElement );

const camera = new THREE.PerspectiveCamera( VIEW_ANGLE, WIDTH / HEIGHT, NEAR, FAR );
const scene = new THREE.Scene();
scene.add( camera );

const stats = new Stats();
stats.showPanel( 0 ); // 0: fps
document.body.appendChild( stats.dom );

// MODERNIZE: TrackballControls now requires the canvas as its event target.
const controls = new TrackballControls( camera, renderer.domElement );

// A nice three-quarter framing of cell 10010 (captured from the original).
camera.position.set( -194536.51784707283, 184329.38148911536, 168343.49533261952 );
controls.target.set( 56825.99513772479, 144964.66253099282, 146510.9148580572 );

window.addEventListener( 'resize', () => {
	WIDTH = window.innerWidth;
	HEIGHT = window.innerHeight;
	camera.aspect = WIDTH / HEIGHT;
	camera.updateProjectionMatrix();
	renderer.setSize( WIDTH, HEIGHT );
	controls.handleResize();
} );

// ---- Load the mesh, then build everything ------------------------------------

new CTMLoader()
	.load( '../cells/10010.ctm' )
	.then( createMesh )
	.catch( ( err ) => console.error( 'Failed to load neuron mesh:', err ) );

function createMesh( geo ) {

	const vertices = geo.getAttribute( 'position' ).array; // [x,y,z, x,y,z, …]
	const vertex_count = vertices.length / 3;
	const faces = geo.index.array;                         // triangle vertex indices

	// ---- Vertex adjacency map: vertex index → array of neighbouring indices ----
	const s1 = performance.now();
	const adjacency_map = new Map();
	{
		for ( const vertex of faces ) {
			adjacency_map.set( vertex, [] );
		}

		let v1, v2, v3;
		for ( let i = 0; i < faces.length; i += 3 ) {
			v1 = faces[ i ];
			v2 = faces[ i + 1 ];
			v3 = faces[ i + 2 ];
			adjacency_map.get( v1 ).push( v2, v3 );
			adjacency_map.get( v2 ).push( v1, v3 );
			adjacency_map.get( v3 ).push( v2, v1 );
		}
	}
	console.log( 'adjacency_map time', performance.now() - s1, 'ms' );

	// Find the index of the mesh vertex nearest a world-space point. Used to turn a
	// hand-picked soma location into a concrete root index. (Kept for reference —
	// the root below is hard-coded to the value this produced for cell 10010.)
	function nearest_vert( verts, loc ) {
		let v_i;
		let min_dist2 = Infinity;
		const v = { x: 0, y: 0, z: 0 };

		for ( let i = verts.length - 1; i >= 0; i -= 3 ) {
			v.x = verts[ i - 2 ];
			v.y = verts[ i - 1 ];
			v.z = verts[ i - 0 ];

			const dist2 =
				Math.pow( loc.x - v.x, 2 ) +
				Math.pow( loc.y - v.y, 2 ) +
				Math.pow( loc.z - v.z, 2 );

			if ( dist2 < min_dist2 ) {
				v_i = i;
				min_dist2 = dist2;
			}
		}

		return ( v_i - 2 ) / 3; // convert last-component index back to a vertex index
	}

	// ---- GPU uniforms -------------------------------------------------------------
	// 16 signal frontiers. -100000 parks an inactive frontier far off the distance
	// field so it lights nothing until a backprop path assigns it a real value.
	const MAX_BACKPROP = 16;
	const frontiers = new Float32Array( MAX_BACKPROP );
	frontiers.fill( -100000 );

	// MODERNIZE: modern three infers uniform types from `value`; the old `type`
	// strings ('f', 'fv1', 'v3', …) are gone.
	const uniforms = {
		u_frontier:   { value: frontiers },                 // float[16]
		u_feather:    { value: 200 },                       // width (in hops) of the lit band
		u_camera_pos: { value: new THREE.Vector3() },       // for view-dependent shading
	};

	const material = new THREE.ShaderMaterial( {
		uniforms,
		vertexShader:   document.getElementById( 'vertexshader' ).textContent,
		fragmentShader: document.getElementById( 'fragmentshader' ).textContent,
	} );

	// ---- a_hops: BFS hop-distance field from the soma -----------------------------
	// Root index 21628 ≈ nearest_vert(vertices, new THREE.Vector3(20000,165000,109000))
	// for cell 10010 — a vertex near the soma.
	const root_idx = 21628;

	let t = performance.now();
	const { map } = bft( root_idx, adjacency_map, vertex_count ); // map = hop distances
	console.log( 'bft time', performance.now() - t, 'ms' );

	geo.setAttribute( 'a_hops', new THREE.BufferAttribute( map, 1 ) );

	const mesh = new THREE.Mesh( geo, material );
	scene.add( mesh );

	// ---- a_backprop1..4: per-vertex membership in up to 16 signal paths -----------
	// Four vec4 attributes × 4 components = 16 independent path "channels". A vertex
	// reads 1.0 in a channel when it lies on that channel's traced-to-soma path.
	const backprop_buffer1 = new Float32Array( vertex_count * 4 );
	const backprop_buffer2 = new Float32Array( vertex_count * 4 );
	const backprop_buffer3 = new Float32Array( vertex_count * 4 );
	const backprop_buffer4 = new Float32Array( vertex_count * 4 );

	geo.setAttribute( 'a_backprop1', new THREE.BufferAttribute( backprop_buffer1, 4 ) );
	geo.setAttribute( 'a_backprop2', new THREE.BufferAttribute( backprop_buffer2, 4 ) );
	geo.setAttribute( 'a_backprop3', new THREE.BufferAttribute( backprop_buffer3, 4 ) );
	geo.setAttribute( 'a_backprop4', new THREE.BufferAttribute( backprop_buffer4, 4 ) );

	const bp_arr = [
		geo.attributes.a_backprop1,
		geo.attributes.a_backprop2,
		geo.attributes.a_backprop3,
		geo.attributes.a_backprop4,
	];

	// Per-slot animation state. frontier[k] is channel k's current position along
	// a_hops; waiting[k] marks a slot mid-respawn (its random firing delay).
	const frontier = new Float32Array( MAX_BACKPROP );
	const waiting = new Uint8Array( MAX_BACKPROP );

	// Fire a backprop signal originating at `index`, written into the next channel.
	let bp_offset = 0;
	function backprop( index ) {
		const vec_off = bp_offset % 4;                 // vec4 component (0–3)
		const bp_vec = bp_arr[ Math.floor( bp_offset / 4 ) ]; // which a_backprop attribute

		// bbft traces index → soma, flags the path, and returns its hop length.
		const b_max = bbft( index, adjacency_map, map, vertex_count, bp_vec.array, vec_off );
		frontier[ bp_offset ] = b_max; // start the lit band at the far tip…
		bp_vec.needsUpdate = true;     // …and re-upload the changed path buffer.

		bp_offset = ( bp_offset + 1 ) % MAX_BACKPROP;
	}

	// Pick a random vertex that is reachable and reasonably far out (>200 hops) so
	// signals have a satisfying distance to travel.
	function random_tip() {
		let index;
		do {
			index = Math.round( Math.random() * vertex_count );
		} while ( map[ index ] < 200 );
		return index;
	}

	// Shift-click the mesh to fire a signal from the picked point back to the soma.
	{
		const raycaster = new THREE.Raycaster();
		const mouse = new THREE.Vector2();

		renderer.domElement.addEventListener( 'click', ( { clientX, clientY, shiftKey } ) => {
			if ( ! shiftKey ) return;

			mouse.x = ( clientX / WIDTH ) * 2 - 1;
			mouse.y = -( clientY / HEIGHT ) * 2 + 1;

			raycaster.setFromCamera( mouse, camera );
			const intersects = raycaster.intersectObject( mesh );

			if ( intersects.length ) {
				const vertex1 = faces[ intersects[ 0 ].faceIndex * 3 ]; // a vertex of the hit face
				if ( map[ vertex1 ] >= 0 ) backprop( vertex1 ); // ignore disconnected vertices
			}
		} );
	}

	// ---- Render loop --------------------------------------------------------------
	renderer.setAnimationLoop( () => {
		stats.begin();

		// Advance every channel's frontier inward (toward the soma at hop 0).
		for ( let i = 0; i < MAX_BACKPROP; i ++ ) {
			frontier[ i ] -= 10;

			if ( waiting[ i ] ) continue;

			// Once a band has swept past the soma (and faded), respawn this channel
			// from a fresh random tip after a short random delay.
			if ( frontier[ i ] < -uniforms.u_feather.value ) {
				waiting[ i ] = 1;
				const slot = i;
				setTimeout( () => {
					waiting[ slot ] = 0;
					backprop( random_tip() );
				}, Math.random() * 500 );
			}
		}

		// Push frontier positions + camera position to the GPU.
		for ( let i = 0; i < MAX_BACKPROP; i ++ ) {
			uniforms.u_frontier.value[ i ] = frontier[ i ];
		}
		// FIX: original code assigned to a stray global instead of the uniform, so
		// the view-dependent light term was effectively dead. Wire it up properly.
		uniforms.u_camera_pos.value.copy( camera.position );

		controls.update();
		renderer.render( scene, camera );

		stats.end();
	} );
}
