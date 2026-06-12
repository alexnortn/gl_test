// pd-dual.js
// ---------------------------------------------------------------------------
// A two-cell connectome circuit: ganglion cell 10010 (RGC) and starburst
// amacrine cell 70014 (SAC), shown together in their shared world frame, with
// direction-correct signal propagation and the 22 synaptic contacts between them.
//
//   SAC (70014):       potentials propagate OUTWARD from the soma, bifurcating
//                      down every branch to the dendrite tips (an expanding shell
//                      over the BFS hop-distance field), then terminate.
//   Ganglion (10010):  potentials propagate INWARD, from a point on the arbor
//                      back along a traced path to the soma.
//   Synapse transfer:  when a SAC wave reaches a shared contact, that synapse
//                      sphere glows and hands the signal to the ganglion cell,
//                      which fires an inward pulse toward its own soma.
//
// Modes: Manual (click-driven) · Circuit (auto SAC → synapse → ganglion) ·
//        Auto (Circuit + "phantom" ganglion pulses from its other ~6k contacts).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { CTMLoader } from '../js/loaders/CTMLoader.js';
import { bft } from '../js/bft.js';
import { bbft } from '../js/bbft.js';

// Soma-adjacent root vertices (from the original pd / neuron work).
const SOMA = { ganglion: 21628, sac: 90174 };
const FEATHER = 27;             // default lit-band half-width (≈ 1/3 of the old 80; slider-controlled)
const SAC_WAVES = 8;            // concurrent SAC outward waves
const GAN_CHANNELS = 16;        // concurrent ganglion inward pulses (4 vec4s)

// ?embed → ambient hero mode for the landing page: hide the UI, auto-orbit, run
// the circuit on its own.
const EMBED = new URLSearchParams( location.search ).has( 'embed' );

// ---- Renderer / scene / camera -----------------------------------------------
let WIDTH = window.innerWidth, HEIGHT = window.innerHeight;
const container = document.querySelector( '#container' );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( WIDTH, HEIGHT );
renderer.domElement.style.display = 'block';
container.appendChild( renderer.domElement );

const camera = new THREE.PerspectiveCamera( 45, WIDTH / HEIGHT, 1000, 1000000000 );
const scene = new THREE.Scene();
scene.add( camera );

const stats = new Stats();
stats.showPanel( 0 );
document.body.appendChild( stats.dom );

// OrbitControls: left-drag rotate · wheel/two-finger zoom · right-drag (or
// two-finger drag) pan — "typical three.js" navigation, with an up vector kept
// fixed so the axis snap-views below stay clean.
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true; // pan parallel to the screen
controls.panSpeed = 0.9;
controls.zoomSpeed = 0.9;
controls.rotateSpeed = 0.9;

window.addEventListener( 'resize', () => {
	WIDTH = window.innerWidth; HEIGHT = window.innerHeight;
	camera.aspect = WIDTH / HEIGHT;
	camera.updateProjectionMatrix();
	renderer.setSize( WIDTH, HEIGHT );
} );

// ---- Small helpers ------------------------------------------------------------
const shaderSrc = ( id ) => document.getElementById( id ).textContent;

// Nearest mesh vertex to a world point (linear scan; fine for one-off lookups).
function nearestVertex( pos, x, y, z ) {
	let best = -1, bestD = Infinity;
	for ( let i = 0; i < pos.length; i += 3 ) {
		const dx = pos[ i ] - x, dy = pos[ i + 1 ] - y, dz = pos[ i + 2 ] - z;
		const d = dx * dx + dy * dy + dz * dz;
		if ( d < bestD ) { bestD = d; best = i / 3; }
	}
	return { index: best, dist: Math.sqrt( bestD ) };
}

// 1-D Perlin noise — smooth, *correlated* variation over its input, so successive
// samples drift naturally (unlike Math.random's white noise). Used to jitter the
// auto-firing interval so the circuit pulses feel organic rather than metronomic.
const _perlinPerm = new Uint8Array( 512 );
( () => {
	const p = Array.from( { length: 256 }, ( _, i ) => i );
	for ( let i = 255; i > 0; i-- ) { const j = Math.floor( Math.random() * ( i + 1 ) ); [ p[ i ], p[ j ] ] = [ p[ j ], p[ i ] ]; }
	for ( let i = 0; i < 512; i++ ) _perlinPerm[ i ] = p[ i & 255 ];
} )();
const _fade = ( t ) => t * t * t * ( t * ( t * 6 - 15 ) + 10 );
const _grad1 = ( h, x ) => ( h & 1 ) ? -x : x;
function perlin1( x ) {
	const xi = Math.floor( x ) & 255;
	const xf = x - Math.floor( x );
	const u = _fade( xf );
	const a = _grad1( _perlinPerm[ xi ], xf );
	const b = _grad1( _perlinPerm[ xi + 1 ], xf - 1 );
	return ( 1 - u ) * a + u * b; // ≈ [-0.5, 0.5]
}

// Build the per-cell graph + BFS hop-distance field and attach a_hops.
function buildCell( geo, somaRoot ) {
	const pos = geo.getAttribute( 'position' ).array;
	const n = pos.length / 3;
	const faces = geo.index.array;

	const adj = new Map();
	for ( const v of faces ) adj.set( v, [] );
	for ( let i = 0; i < faces.length; i += 3 ) {
		const a = faces[ i ], b = faces[ i + 1 ], c = faces[ i + 2 ];
		adj.get( a ).push( b, c );
		adj.get( b ).push( a, c );
		adj.get( c ).push( b, a );
	}

	const hopMap = bft( somaRoot, adj, n );           // { map: Float32Array, max }
	geo.setAttribute( 'a_hops', new THREE.BufferAttribute( hopMap.map, 1 ) );

	const mesh = new THREE.Mesh( geo, null );          // material assigned by caller
	return { geo, pos, n, faces, adj, hopMap, mesh, somaRoot };
}

function makeMaterial( vertexId, frontierCount, baseColor, signalColor ) {
	return new THREE.ShaderMaterial( {
		uniforms: {
			u_frontier:    { value: new Float32Array( frontierCount ).fill( -100000 ) },
			u_feather:     { value: FEATHER },
			u_camera_pos:  { value: new THREE.Vector3() },
			u_baseColor:   { value: new THREE.Color( baseColor ) },
			u_signalColor: { value: new THREE.Color( signalColor ) },
		},
		vertexShader:   shaderSrc( vertexId ),
		fragmentShader: shaderSrc( 'frag' ),
	} );
}

// ---- Cell controllers ---------------------------------------------------------

// Ganglion: inward pulses along traced-to-soma paths (16 channels / 4 vec4s).
class Ganglion {
	constructor( cell, material ) {
		this.cell = cell;
		this.front = material.uniforms.u_frontier.value;  // Float32Array(16)
		this.feather = material.uniforms.u_feather.value;
		this.active = new Uint8Array( GAN_CHANNELS );
		this.channel = 0;

		// 4 vec4 path-membership attributes shared with the shader.
		this.bp = [];
		for ( let i = 0; i < 4; i++ ) {
			const attr = new THREE.BufferAttribute( new Float32Array( cell.n * 4 ), 4 );
			cell.geo.setAttribute( `a_backprop${ i + 1 }`, attr );
			this.bp.push( attr );
		}
	}

	// Fire an inward pulse starting at vertex `vtx` (e.g. a synapse location).
	fire( vtx ) {
		if ( vtx == null || this.cell.hopMap.map[ vtx ] < 0 ) return; // disconnected
		const k = this.channel;
		const attr = this.bp[ Math.floor( k / 4 ) ];
		bbft( vtx, this.cell.adj, this.cell.hopMap.map, this.cell.n, attr.array, k % 4 );
		attr.needsUpdate = true;
		this.front[ k ] = this.cell.hopMap.map[ vtx ]; // band starts at the tip…
		this.active[ k ] = 1;
		this.channel = ( this.channel + 1 ) % GAN_CHANNELS;
	}

	update( speed ) {
		for ( let k = 0; k < GAN_CHANNELS; k++ ) {
			if ( ! this.active[ k ] ) continue;
			this.front[ k ] -= speed;                  // …and sweeps toward the soma (0).
			if ( this.front[ k ] < -this.feather ) { this.active[ k ] = 0; this.front[ k ] = -100000; }
		}
	}
}

// SAC: outward shell waves expanding from the soma over the whole hop field.
class Sac {
	constructor( cell, material ) {
		this.cell = cell;
		this.front = material.uniforms.u_frontier.value;  // Float32Array(8)
		this.feather = material.uniforms.u_feather.value;
		this.maxHop = cell.hopMap.max;
		this.active = new Uint8Array( SAC_WAVES );
		this.synapses = [];        // [{ sacHop, ganVertex, i }] shared contacts
		this.onCross = null;       // callback(synapse) when a wave reaches a contact
	}

	// Fire one outward wave from the soma (hop 0).
	fire() {
		let s = this.active.indexOf( 0 );
		if ( s < 0 ) s = 0;        // all busy → recycle the first slot
		this.front[ s ] = 0;
		this.active[ s ] = 1;
	}

	update( speed ) {
		for ( let s = 0; s < SAC_WAVES; s++ ) {
			if ( ! this.active[ s ] ) continue;
			const prev = this.front[ s ];
			const next = prev + speed;                 // expand outward
			this.front[ s ] = next;

			// Hand off to the ganglion cell at any shared contact this wave just crossed.
			if ( this.onCross ) {
				for ( const syn of this.synapses ) {
					if ( syn.sacHop > prev && syn.sacHop <= next ) this.onCross( syn );
				}
			}

			if ( next > this.maxHop + this.feather ) { this.active[ s ] = 0; this.front[ s ] = -100000; }
		}
	}
}

// ---- Boot ---------------------------------------------------------------------
// Each cell's impulse is an electric, lighter/richer version of its own base
// colour; the SAC sits analogous (teal/cyan) to the ganglion blue rather than
// contrasting; the shared contacts get the now-free gold to mark them as special.
const COLORS = {
	ganBase:   0x1530ff, ganSignal:   0x4fc3ff,  // ganglion: deep blue → electric light-blue impulse
	sacBase:   0x1fb8c8, sacSignal:   0x57ffe6,  // SAC: soft teal-cyan → electric aqua impulse
	shared:    0xffd21a, sharedGlow:  0xffffff,  // shared contacts: bright yellow-gold (special)
	ganCloud:  0x6f88ff, sacCloud:    0x86e8f0,  // contact clouds: a lighter tint of each parent cell
};

main().catch( ( err ) => {
	console.error( err );
	document.getElementById( 'loading' ).textContent = 'Failed to load: ' + err.message;
} );

async function main() {
	const [ ganGeo, sacGeo, ganConns, sacConns ] = await Promise.all( [
		new CTMLoader().load( '../cells/10010.ctm' ),
		new CTMLoader().load( '../pd/data/70014' ),
		fetch( '../data/scripts/conns-10010.json' ).then( ( r ) => r.json() ),  // partner-keyed
		fetch( '../pd/data/conns-70014.json' ).then( ( r ) => r.json() ),       // all contacts
	] );

	const ganCell = buildCell( ganGeo, SOMA.ganglion );
	const sacCell = buildCell( sacGeo, SOMA.sac );

	const ganMat = makeMaterial( 'gan-vertex', GAN_CHANNELS, COLORS.ganBase, COLORS.ganSignal );
	const sacMat = makeMaterial( 'sac-vertex', SAC_WAVES,    COLORS.sacBase, COLORS.sacSignal );
	ganCell.mesh.material = ganMat;
	sacCell.mesh.material = sacMat;
	scene.add( ganCell.mesh, sacCell.mesh );

	const ganglion = new Ganglion( ganCell, ganMat );
	const sac = new Sac( sacCell, sacMat );

	// ---- Frame both cells ----
	// These retinal arbors are roughly planar in Y–Z (stratified in the IPL), so the
	// default view looks face-on down the X (depth) axis — edge-on it's a thin sliver.
	const box = new THREE.Box3().setFromObject( ganCell.mesh ).union( new THREE.Box3().setFromObject( sacCell.mesh ) );
	const center = box.getCenter( new THREE.Vector3() );
	const size = box.getSize( new THREE.Vector3() );

	// Distance that fits the cells' bounding sphere from any direction (constant
	// "zoom-extents" used by every snap view, regardless of viewing axis).
	const radius = size.length() * 0.5;
	const fitDist = ( radius / Math.sin( THREE.MathUtils.degToRad( camera.fov ) / 2 ) ) * 1.12;

	// Snap the camera to look at the cells' centre from `dir`, re-centring after any pan.
	function snapTo( dir, up ) {
		controls.target.copy( center );
		camera.up.copy( up );
		camera.position.copy( center ).addScaledVector( dir.clone().normalize(), fitDist );
		controls.update();
	}

	const VIEWS = {
		// left/right (±X) are face-on to the arbor plane; top/bottom (±Y) are edge-on.
		right:  { dir: new THREE.Vector3(  1, 0, 0 ), up: new THREE.Vector3( 0, 1,  0 ) },
		left:   { dir: new THREE.Vector3( -1, 0, 0 ), up: new THREE.Vector3( 0, 1,  0 ) },
		top:    { dir: new THREE.Vector3( 0,  1, 0 ), up: new THREE.Vector3( 0, 0, -1 ) },
		bottom: { dir: new THREE.Vector3( 0, -1, 0 ), up: new THREE.Vector3( 0, 0,  1 ) },
	};

	// Initial framing: face-on from the left, slightly raised.
	snapTo( new THREE.Vector3( -1, 0.2, 0.12 ), new THREE.Vector3( 0, 1, 0 ) );

	// Sphere sizes. Shared spheres: 0.25 × original, then 25% larger again (×0.3125).
	// Cloud stays 0.45× of the *original* shrunk radius (unchanged from before).
	const sharedRadius = Math.max( 350, size.length() * 0.0045 ) * 0.3125;
	const cloudRadius = Math.max( 350, size.length() * 0.0045 ) * 0.25 * 0.45;

	// ---- Shared synapses (the 22 contacts between 10010 and 70014) ----
	const sharedContacts = ( ganConns[ '70014' ] || [] ).map( ( c ) => c.centroid );
	const sharedData = sharedContacts.map( ( ct, i ) => {
		const g = nearestVertex( ganCell.pos, ct.x, ct.y, ct.z );
		const s = nearestVertex( sacCell.pos, ct.x, ct.y, ct.z );
		return { centroid: ct, ganVertex: g.index, sacVertex: s.index, sacHop: sacCell.hopMap.map[ s.index ], i };
	} );
	sac.synapses = sharedData;
	console.log( `shared contacts: ${ sharedData.length }` );

	// Glowing instanced spheres for the shared contacts.
	const dummy = new THREE.Object3D();
	const sphereGeo = new THREE.SphereGeometry( sharedRadius, 18, 14 );
	const sharedMesh = new THREE.InstancedMesh( sphereGeo, new THREE.MeshBasicMaterial(), sharedData.length );
	const baseShared = new THREE.Color( COLORS.shared );
	const glowShared = new THREE.Color( COLORS.sharedGlow );
	const glow = new Float32Array( sharedData.length );
	sharedData.forEach( ( d, i ) => {
		dummy.position.set( d.centroid.x, d.centroid.y, d.centroid.z );
		dummy.updateMatrix();
		sharedMesh.setMatrixAt( i, dummy.matrix );
		sharedMesh.setColorAt( i, baseShared );
	} );
	sharedMesh.instanceColor.needsUpdate = true;
	scene.add( sharedMesh );

	// ---- All-contacts "clouds" (every synaptic contact on each cell) ----
	const flatten = ( obj ) => { const out = []; for ( const k in obj ) for ( const c of obj[ k ] ) out.push( c.centroid ); return out; };
	const ganCloudPts = flatten( ganConns );
	const sacCloudPts = flatten( sacConns );
	console.log( `contact clouds — ganglion: ${ ganCloudPts.length }, sac: ${ sacCloudPts.length }` );

	function makeCloud( pts, radius, color ) {
		const mesh = new THREE.InstancedMesh( new THREE.SphereGeometry( radius, 8, 6 ), new THREE.MeshBasicMaterial( { color } ), pts.length );
		pts.forEach( ( p, i ) => { dummy.position.set( p.x, p.y, p.z ); dummy.updateMatrix(); mesh.setMatrixAt( i, dummy.matrix ); } );
		mesh.visible = false;
		scene.add( mesh );
		return mesh;
	}
	const ganCloud = makeCloud( ganCloudPts, cloudRadius, COLORS.ganCloud );
	const sacCloud = makeCloud( sacCloudPts, cloudRadius, COLORS.sacCloud );

	// ---- Synapse transfer: SAC wave reaches a contact → glow + ganglion pulse ----
	sac.onCross = ( syn ) => { glow[ syn.i ] = 1.0; ganglion.fire( syn.ganVertex ); };

	// ---- Interaction --------------------------------------------------------------
	const raycaster = new THREE.Raycaster();
	const ndc = new THREE.Vector2();

	renderer.domElement.addEventListener( 'pointerdown', ( e ) => {
		if ( e.button !== 0 ) return;
		ndc.x = ( e.clientX / WIDTH ) * 2 - 1;
		ndc.y = -( e.clientY / HEIGHT ) * 2 + 1;
		raycaster.setFromCamera( ndc, camera );

		// Priority: shared synapses → contact clouds → cell surfaces (visible only).
		const targets = [ sharedMesh, ganCloud, sacCloud, ganCell.mesh, sacCell.mesh ].filter( ( o ) => o.visible );
		const hit = raycaster.intersectObjects( targets, false )[ 0 ];
		if ( ! hit ) return;

		if ( hit.object === sharedMesh ) {
			sac.fire();                                  // play the circuit through this contact
		} else if ( hit.object === ganCloud ) {
			const p = ganCloudPts[ hit.instanceId ];
			ganglion.fire( nearestVertex( ganCell.pos, p.x, p.y, p.z ).index );
		} else if ( hit.object === sacCloud ) {
			sac.fire();
		} else if ( hit.object === ganCell.mesh ) {
			ganglion.fire( ganCell.faces[ hit.faceIndex * 3 ] );
		} else if ( hit.object === sacCell.mesh ) {
			sac.fire();                                  // SAC always discharges from its soma
		}
	} );

	// ---- UI wiring ---------------------------------------------------------------
	const state = { speed: 2, mode: 'manual', firingRate: 0.2, perlin: true };
	let circuitTimer = null, phantomTimer = null;
	let noisePhase = 0;

	// Firing rate is "activations per second" (independent of propagation speed).
	// With Perlin on, the base interval is modulated by smooth 1-D noise so the
	// timing drifts naturally; off, it's a fixed metronome.
	const nextInterval = () => {
		const base = Math.max( 40, 1000 / state.firingRate );
		if ( ! state.perlin ) return base;
		noisePhase += 0.35; // step through the noise field → correlated successive jitters
		const factor = Math.min( 2.2, Math.max( 0.35, 1 + perlin1( noisePhase ) * 1.4 ) );
		return Math.max( 40, base * factor );
	};

	const firePhantom = () => {
		const p = ganCloudPts[ ( Math.random() * ganCloudPts.length ) | 0 ];
		ganglion.fire( nearestVertex( ganCell.pos, p.x, p.y, p.z ).index );
	};

	// Self-rescheduling timers (vs setInterval) so each gap can use a fresh interval.
	function scheduleCircuit() { circuitTimer = setTimeout( () => { sac.fire(); scheduleCircuit(); }, nextInterval() ); }
	function schedulePhantom() { phantomTimer = setTimeout( () => { firePhantom(); schedulePhantom(); }, nextInterval() ); }

	function setMode( m ) {
		state.mode = m;
		clearTimeout( circuitTimer ); clearTimeout( phantomTimer );
		circuitTimer = phantomTimer = null;
		if ( m === 'circuit' || m === 'auto' ) scheduleCircuit();
		if ( m === 'auto' ) schedulePhantom();
		document.querySelector( `input[name=mode][value=${ m }]` ).checked = true;
	}

	const $ = ( id ) => document.getElementById( id );
	const panel = $( 'controls' );
	for ( const ev of [ 'pointerdown', 'wheel' ] ) panel.addEventListener( ev, ( e ) => e.stopPropagation() );

	// Each contact cloud is shown only when "All contacts" is on AND its parent cell
	// is visible — so hiding a cell also hides that cell's contacts.
	const updateClouds = () => {
		const allOn = $( 't-all' ).checked;
		ganCloud.visible = allOn && ganCell.mesh.visible;
		sacCloud.visible = allOn && sacCell.mesh.visible;
	};

	const bindCellToggle = ( id, mesh ) => {
		const el = $( id );
		const apply = () => { mesh.visible = el.checked; updateClouds(); };
		el.addEventListener( 'change', apply );
		return { el, set: ( v ) => { el.checked = v; apply(); } };
	};
	const bindToggle = ( id, obj ) => {
		const el = $( id );
		const apply = () => { obj.visible = el.checked; };
		el.addEventListener( 'change', apply );
		return { el, set: ( v ) => { el.checked = v; apply(); } };
	};
	const tGan = bindCellToggle( 't-gan', ganCell.mesh );
	const tSac = bindCellToggle( 't-sac', sacCell.mesh );
	const tShared = bindToggle( 't-shared', sharedMesh );
	const tAll = { el: $( 't-all' ), set: ( v ) => { $( 't-all' ).checked = v; updateClouds(); } };
	$( 't-all' ).addEventListener( 'change', updateClouds );

	// Speed slider — logarithmic so the slow end has lots of resolution and the
	// lowest setting (0.2) is 10× slower than the previous floor (2). Default ≈ 12.
	const SMIN = 0.2, SMAX = 40;
	const posToSpeed = ( pos ) => SMIN * Math.pow( SMAX / SMIN, pos / 100 );
	const speed = $( 'c-speed' ), speedVal = $( 'c-speed-val' );
	const applySpeed = () => {
		state.speed = posToSpeed( +speed.value );
		speedVal.textContent = state.speed < 10 ? state.speed.toFixed( 1 ) : Math.round( state.speed );
	};
	speed.addEventListener( 'input', applySpeed );
	applySpeed();

	for ( const r of document.querySelectorAll( 'input[name=mode]' ) ) r.addEventListener( 'change', () => setMode( r.value ) );

	// Collapse / expand the control panel.
	$( 'controls-toggle' ).addEventListener( 'click', () => {
		const collapsed = panel.classList.toggle( 'collapsed' );
		$( 'controls-toggle' ).textContent = collapsed ? '▸' : '▾';
		// Collapsing also hides the FPS meter and the snap-view buttons.
		stats.dom.style.display = collapsed ? 'none' : '';
		document.getElementById( 'views' ).style.display = collapsed ? 'none' : '';
	} );

	// Snap-to-view buttons (bottom-right). stopPropagation so they don't also orbit.
	const viewBar = document.getElementById( 'views' );
	viewBar.addEventListener( 'pointerdown', ( e ) => e.stopPropagation() );
	for ( const btn of viewBar.querySelectorAll( 'button' ) ) {
		btn.addEventListener( 'click', () => { const v = VIEWS[ btn.dataset.view ]; snapTo( v.dir, v.up ); } );
	}

	// Pulse-width slider → feather (half-width of the lit band). The old fixed width
	// (≈80) sits at ~75% on the slider; default 25% ≈ 1/3 of that.
	const FEATHER_AT_FULL = 107; // value at 100% so that 75% ≈ 80
	const cFeather = $( 'c-feather' ), cFeatherVal = $( 'c-feather-val' );
	const applyFeather = () => {
		const f = Math.max( 5, ( +cFeather.value / 100 ) * FEATHER_AT_FULL );
		ganMat.uniforms.u_feather.value = f;
		sacMat.uniforms.u_feather.value = f;
		ganglion.feather = f;
		sac.feather = f;
		cFeatherVal.textContent = cFeather.value + '%';
	};
	cFeather.addEventListener( 'input', applyFeather );
	applyFeather();

	// Firing-rate slider (activations/sec) — only acts in Circuit / Auto modes.
	const cRate = $( 'c-rate' ), cRateVal = $( 'c-rate-val' );
	const applyRate = () => {
		state.firingRate = +cRate.value;
		cRateVal.textContent = state.firingRate.toFixed( 1 ) + '/s';
		if ( state.mode !== 'manual' ) setMode( state.mode ); // restart timers at the new rate
	};
	cRate.addEventListener( 'input', applyRate );
	applyRate();

	// Perlin toggle — natural variance in the firing periodicity (read live).
	const tPerlin = $( 't-perlin' );
	tPerlin.addEventListener( 'change', () => { state.perlin = tPerlin.checked; } );

	// Two auto-orbit modes (mutually exclusive), both driven by OrbitControls'
	// autoRotate + the shared speed slider:
	//   Auto-orbit  — a flat spin about the vertical axis.
	//   Polar-orbit — a banked aerial circle about the cells' face-normal: the camera
	//                 sits off the normal and looks down at the foreshortened arbor,
	//                 like flying a plane around them.
	const tOrbit = $( 't-orbit' ), tPolar = $( 't-polar' ), cOrbit = $( 'c-orbit' ), cOrbitVal = $( 'c-orbit-val' );
	controls.autoRotateSpeed = +cOrbit.value;

	function setPolarView() {
		const axis = new THREE.Vector3( 1, 0, 0 ); // cells' face-normal = the orbit axis
		camera.up.copy( axis );
		controls.target.copy( center );
		const theta = THREE.MathUtils.degToRad( 50 ); // tilt off the normal → banked look-down
		camera.position.copy( center )
			.addScaledVector( axis, fitDist * Math.cos( theta ) )
			.addScaledVector( new THREE.Vector3( 0, 0, 1 ), fitDist * Math.sin( theta ) );
		controls.update();
	}

	const applyOrbit = () => { controls.autoRotate = tOrbit.checked || tPolar.checked; };
	tOrbit.addEventListener( 'change', () => {
		if ( tOrbit.checked ) { tPolar.checked = false; camera.up.set( 0, 1, 0 ); controls.update(); }
		applyOrbit();
	} );
	tPolar.addEventListener( 'change', () => {
		if ( tPolar.checked ) { tOrbit.checked = false; setPolarView(); }
		applyOrbit();
	} );
	cOrbit.addEventListener( 'input', () => { controls.autoRotateSpeed = +cOrbit.value; cOrbitVal.textContent = cOrbit.value; } );

	window.addEventListener( 'keydown', ( e ) => {
		switch ( e.code ) {
			case 'Digit1': tGan.set( ! ganCell.mesh.visible ); break;
			case 'Digit2': tSac.set( ! sacCell.mesh.visible ); break;
			case 'KeyS':   tShared.set( ! sharedMesh.visible ); break;
			case 'KeyA':   tAll.set( ! $( 't-all' ).checked ); break;
			case 'KeyM': {
				const order = [ 'manual', 'circuit', 'auto' ];
				setMode( order[ ( order.indexOf( state.mode ) + 1 ) % order.length ] );
				break;
			}
			case 'Space':  e.preventDefault(); sac.fire(); break;
			default: return;
		}
	} );

	// ---- Render loop --------------------------------------------------------------
	$( 'loading' ).hidden = true;

	if ( EMBED ) {
		// Ambient hero: no UI, gentle auto-orbit, circuit running with livelier firing.
		stats.dom.style.display = 'none';
		document.getElementById( 'views' ).style.display = 'none';
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.6;
		state.firingRate = 0.8;
		setMode( 'circuit' );
	} else {
		panel.hidden = false;
		setMode( 'circuit' ); // start running so it's alive on first open
	}

	// Debug handle (harmless; useful for testing/automation from the console).
	window.pdDual = { sac, ganglion, sharedData, ganCell, sacCell, ganCloud, sacCloud, controls, setGlow: ( i ) => { glow[ i ] = 1; }, state };

	renderer.setAnimationLoop( () => {
		stats.begin();

		ganglion.update( state.speed );
		sac.update( state.speed );

		// Decay synapse glow and push changed instance colours.
		let glowDirty = false;
		for ( let i = 0; i < glow.length; i++ ) {
			if ( glow[ i ] > 0 ) {
				glow[ i ] = Math.max( 0, glow[ i ] - 0.045 );
				sharedMesh.setColorAt( i, baseShared.clone().lerp( glowShared, glow[ i ] ) );
				glowDirty = true;
			}
		}
		if ( glowDirty ) sharedMesh.instanceColor.needsUpdate = true;

		ganMat.uniforms.u_camera_pos.value.copy( camera.position );
		sacMat.uniforms.u_camera_pos.value.copy( camera.position );

		controls.update();
		renderer.render( scene, camera );

		stats.end();
	} );
}
