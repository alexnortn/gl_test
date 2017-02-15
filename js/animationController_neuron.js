let frameRate = 60;

// @see http://paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame       || 
          window.webkitRequestAnimationFrame || 
          window.mozRequestAnimationFrame    || 
          window.oRequestAnimationFrame      || 
          window.msRequestAnimationFrame     || 
          function(/* function */ callback, /* DOMElement */ element){
            window.setTimeout(callback, 1000 / frameRate);
          };
})();

// Set the scene size.
const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;

// Set some camera attributes.
const VIEW_ANGLE = 45;
const ASPECT = WIDTH / HEIGHT;
const NEAR = 1000;
const FAR = 1000000000;

// Get the DOM element to attach to
const container = document.querySelector('#container');

// Create a WebGL renderer, camera and scene
const renderer = new THREE.WebGLRenderer();
const camera =
	new THREE.PerspectiveCamera(
		VIEW_ANGLE,
		ASPECT,
		NEAR,
		FAR
);

const scene = new THREE.Scene();

// Add stats
let stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );

// Add the camera to the scene.
scene.add(camera);
camera.position.z = 1000000;

// Start the renderer.
renderer.setSize(WIDTH, HEIGHT);

// Attach the renderer-supplied
// DOM element.
container.appendChild(renderer.domElement);


// Setup trackballControls
let controls = new THREE.TrackballControls( camera ); // Only interact when over canvas


// Light for test Material
// const pointLight = new THREE.PointLight(0xFFFFFF);
// 	  pointLight.position.x = 10;
// 	  pointLight.position.y = 50;
// 	  pointLight.position.z = 130;

// scene.add(pointLight);


// Load CTM neuron
let loader = new THREE.CTMLoader();
	loader.load( "../cells/10010.ctm",   function( geometry ) {
		createMesh(geometry);
	}, { useWorker: true } );


function createMesh(geo) {

	// Test Geometry
	// let geo = new THREE.TorusKnotBufferGeometry( 15, 5, 1000, 64);

	const vertices = geo.getAttribute('position').array; // itemSize: 3 | (lookup -> 3 * index: i, i+1, i+2)
	const vertex_count = vertices.length / 3;
	const faces = geo.index.array; // vertex -> index | triangles

	const s1 = performance.now();
	
	// Setup Adjacency Map
	const adjacency_map = new Map();
	{
		for (let i = 0; i < faces.length; i++) {
			adjacency_map.set(faces[i], adjacency_map.get(faces[i]) || new Set()); // Allocate a new Set, one for each vertex -> ignore duplicates
		}

		let v1, v2, v3;
		
		// Generate Adjacency Map
		for (let i = 0; i < faces.length; i+=3) {
			v1 = faces[i];
			v2 = faces[i+1];
			v3 = faces[i+2];

			adjacency_map.get(v1).add(v2).add(v3);
			adjacency_map.get(v2).add(v1).add(v3);
			adjacency_map.get(v3).add(v2).add(v1);
		}
	}

	for (let [key, val] of adjacency_map) {
		adjacency_map.set(key, [...adjacency_map.get(key)]);
	}

	console.log('adjacency_map time', performance.now() - s1, 'ms');
	
	// Find closest vertex to specified point (vec3)
	// verts -> bufffer: [size 3] · loc -> vec3
	function find_root(verts, loc) {
		let v_i;
		let min_dist2 = Infinity;
		let v = { "x":0, "y":0, "z":0 };

		for (let i = verts.length-1; i >= 0; i-=3) {
			v.x = verts[i-2];
			v.y = verts[i-1];
			v.z = verts[i-0];

			let dist2 = 
				Math.pow((loc.x - v.x), 2) + 
				Math.pow((loc.y - v.y), 2) + 
				Math.pow((loc.z - v.z), 2);

			if (dist2 < min_dist2) {
				v_i = i;
				min_dist2 = dist2;
			}
		}

		return (v_i - 2) / 3; // Account for 0 offset
	}

	// Materials + GPU Stuff		
	let uniforms = {
		u_amplitude: {
			type: 'f', // a float
			value: 0.0
		},
		u_frontier: {
			type: 'f', // a float
			value: 0.0
		},
		u_feather: {
			type: 'f', // a float
			value: 10 // 10% feather
		},
		u_camera_pos: {
			type: 'v3', // a float
			value:new THREE.Vector3()
		}
	}

	function initMesh(hop_map, geo, verts) {
		let frontier_buffer = new Float32Array(verts.length / 3);

		frontier_buffer.fill(-1000); // for discontinuity
		
		for (let [node, hops] of hop_map) {
			frontier_buffer[node] = hops;
		}

		geo.addAttribute( 'a_hops', new THREE.BufferAttribute( frontier_buffer, 1 ) );

		// Test Material
		// let material = new THREE.MeshLambertMaterial( { color: 0xffffff } );

		let material =
			new THREE.ShaderMaterial({
				uniforms:     	uniforms,
				vertexShader:   $('#vertexshader').text(),
				fragmentShader: $('#fragmentshader').text()
			});

		let mesh = new THREE.Mesh( geo, material );
			//mesh.position.set(-0.5, -0.5, -0.5);
			//mesh.scale.set(0.0001, 0.0001, 0.0001);

		scene.add(mesh);

		return mesh;
	}

	let root_vec = new THREE.Vector3(20000, 165000, 109000);

	let start_time = performance.now();
	let root_idx = find_root(vertices, root_vec);
	console.log('find_root time ', performance.now() - start_time, "ms");

	start_time = performance.now();
	let {map, max} = bft(root_idx, adjacency_map, vertex_count); // -> Traverse (from vertex[0])
	console.log('bft time ', performance.now() - start_time, "ms");

	let mesh = initMesh(map, geo, vertices); // Setup materials

	// Animation Speed
	// Provide in Frames
	function setStep (frames) {
		return {
			tick: 1 / frames,
			front: Math.floor(max / frames)
		};
	}

	let tickr = setStep(600);
	
	let frontier = 0;
	let rotate = 0;
	let theta = 0;

	// Reset frontier
	$(window).keypress((e) => {
		if (e.keyCode === 0 || e.keyCode === 32) {
			e.preventDefault()
			console.log('reset');
			frontier = 0;
		}
	});

	// draw!
	function update() {
		stats.begin();
	
		renderer.render(scene, camera);

		// rotate += 0.005;
		// mesh.rotation.set(rotate,rotate,rotate);

		controls.update(); // Trackball Update

		// theta += 0.01;
		// frontier += tickr.front;
		frontier += 1;

		// To GPU
		mesh.material.uniforms.u_frontier.value = frontier % max;
		u_camera_pos = new THREE.Vector3(-1, -1, -1);

		stats.end();
		
		// Set up the next call
		requestAnimFrame(update);
	}

	console.log('Starting render loop..');
	requestAnimFrame(update); // Kick off render loop
}
