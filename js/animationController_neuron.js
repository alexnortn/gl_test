let frameRate = 60;

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
const renderer = new THREE.WebGLRenderer({
	antialias: true
});
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
// camera.position.z = 1000000;

// Start the renderer.
renderer.setSize(WIDTH, HEIGHT);

// Attach the renderer-supplied
// DOM element.
container.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block'; // by default, most browsers use inline-block, creates scrollbars for fullscreen


// Setup trackballControls
let controls = new THREE.TrackballControls( camera ); // Only interact when over canvas
camera.position.set(-194536.51784707283, 184329.38148911536, 168343.49533261952);
controls.target.set(56825.99513772479, 144964.66253099282, 146510.9148580572);


// Get cell_list from Eyewire API
	// (then) Specify <cell> from cell list
	// (then) Get <cell> metadata
		// Task list, position, etc
	// (then) Get <cell> from museum API
	// (then) Load cell locally..


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
	function nearest_vert(verts, loc) {
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

	const MAX_BACKPROP = 4;

	let frontiers = new Float32Array(MAX_BACKPROP);
	frontiers.fill(-100000);

	// Materials + GPU Stuff		
	let uniforms = {
		u_amplitude: {
			type: 'f', // a float
			value: 0.0
		},
		u_frontier: {
			type: 'fv1', // a float
			value: frontiers
		},
		u_feather: {
			type: 'f', // a float
			value: 250 // 10% feather
		},
		u_camera_pos: {
			type: 'v3', // a float
			value:new THREE.Vector3()
		}
	}

	function initMesh(hop_map, geo) {
		// Frontier
		geo.addAttribute('a_hops', new THREE.BufferAttribute(hop_map, 1));

		// Material
		let material =
			new THREE.ShaderMaterial({
				uniforms:     	uniforms,
				vertexShader:   $('#vertexshader').text(),
				fragmentShader: $('#fragmentshader').text()
			});

		let mesh = new THREE.Mesh( geo, material );

		scene.add(mesh);

		return mesh;
	}

	let root_vec = new THREE.Vector3(20000, 165000, 109000);

	let start_time = performance.now();
	let root_idx = 21628;//nearest_vert(vertices, root_vec);
	console.log('nearest_vert time ', performance.now() - start_time, "ms");

	start_time = performance.now();
	let {map, max} = bft(root_idx, adjacency_map, vertex_count); // -> Traverse (from vertex[0])
	console.log('bft time ', performance.now() - start_time, "ms");

	let mesh = initMesh(map, geo); // Setup materials

	let backprop_buffer = new Float32Array(vertex_count * 4);

	geo.addAttribute( 'a_backprop', new THREE.BufferAttribute( backprop_buffer, 4 ) );
	
	let b_max = new Uint32Array(MAX_BACKPROP);
	let frontier = new Float32Array(MAX_BACKPROP);
	
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

		// mesh.rotation.set(rotate,rotate,rotate);

		controls.update(); // Trackball Update

		// frontier -= 5;
		
		// move frontiers
		for (let i = 0; i < MAX_BACKPROP; i++){
			frontier[i] -= 5;
			if (frontier[i] < (-1 * mesh.material.uniforms.u_feather.value)) {
				function get_index() {
					let index = Math.round(Math.random() * vertex_count);
					if (map[index] < 0) {
						console.log('lil val');
						return get_index();
					}

					console.log('returning', map[index]);
					return index;
				}

				backprop(get_index());
			}
		}


		// To GPU
		for (let i = 0; i < MAX_BACKPROP; i++){
			mesh.material.uniforms.u_frontier.value[i] = frontier[i];
		}
		

		u_camera_pos = new THREE.Vector3(-1, -1, -1);

		stats.end();
		
		requestAnimationFrame(update);
	}

	requestAnimationFrame(update); // Kick off render loop


	// click trigger backprop from selected vertex
	{
		const raycaster = new THREE.Raycaster();
		const mouse = new THREE.Vector2();

		addEventListener('click', ({clientX, clientY, shiftKey}) => {
			if (!shiftKey) {
				return;
			}

			mouse.x = clientX / WIDTH * 2 - 1;
			mouse.y = -clientY / HEIGHT * 2 + 1;

			raycaster.setFromCamera(mouse, camera);
			const intersects = raycaster.intersectObject(mesh);

			if (intersects.length) {
				const {faceIndex} = intersects[0];
				const vertex1 = faces[faceIndex * 3]; // choose one of the vertices from the selected face

				if (map[vertex1] >= 0) {
					backprop(vertex1);
				}
			}
		});
	}

	let bp_offset = 0;
	function backprop(index) {
		let start_time = performance.now();
		b_max = bbft(index, adjacency_map, map, vertex_count, geo.attributes.a_backprop.array, bp_offset); // writes into backprop array
		console.log('bbft time ', performance.now() - start_time, "ms");
		frontier[bp_offset] = b_max;
		geo.attributes.a_backprop.needsUpdate = true;

		bp_offset = (bp_offset + 1) % 4;
	}
}
