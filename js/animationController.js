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
const NEAR = 0.1;
const FAR = 1000;

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
camera.position.z = 5;

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


// Run neuron segmentation 
// Probably calculate these locally, -> What about those meshes from Chris?
// serve 'good' meshes
let myWorker = new MCWorker();

// load segmentation
fetch('../volume/segmentation').then((data) => {
    return data.arrayBuffer();
}).then((ab) => {
    segmentation = new Uint16Array(ab);
}).then(() => {
    return myWorker.loadVolume(segmentation); // Load segmentation
}).then((returned_segmentation) => {
    segmentation = returned_segmentation; 	  // Receive segmentation
    return myWorker.generateMesh(910); 		  // Generate mesh
}).then(({triangles, positions, normals}) => {
    const geo = new THREE.BufferGeometry();   // Generate geometry
	      geo.setIndex( new THREE.BufferAttribute(triangles, 1 ) );
	      geo.addAttribute('position', new THREE.BufferAttribute(positions, 3));
	      geo.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
	      geo.normalizeNormals();
	      
    return geo;
}).then(createMesh);

function createMesh(geo) {

	// Test Geometry
	// var geo = new THREE.TorusKnotBufferGeometry( 15, 5, 1000, 64);

	let vertices = geo.getAttribute('position').array; // itemSize: 3 | (lookup -> 3 * index: i, i+1, i+2)
	let vertex_count = vertices.length / 3;
	let faces = geo.index.array; // vertex -> index | triangles

	
	// Setup Adjacency Map
	let adjacency_map = new Map();

	for (let i = 0; i < faces.length; i++) {
		adjacency_map.set(faces[i], adjacency_map.get(faces[i]) || new Set()); // Allocate a new Set, one for each vertex -> ignore duplicates
	}
	
	// Generate Adjacency Map
	for (i = 0; i < faces.length; i+=3) {
		v1 = faces[i];
		v2 = faces[i+1];
		v3 = faces[i+2];

		adjacency_map.get(v1).add(v2).add(v3);
		adjacency_map.get(v2).add(v1).add(v3);
		adjacency_map.get(v3).add(v2).add(v1);
	}

	
	// Find closest vertex to specified point (vec3)
	// verts -> bufffer: [size 3] · loc -> vec3
	function find_root(verts, loc) {
		let v_i;
		let min_dist2 = Infinity;
		let v = { "x":0, "y":0, "z":0 };

		for (let i = verts.length-1; i >= 0; i-=3) {
			v.x = verts[i-0];
			v.y = verts[i-1];
			v.z = verts[i-2];

			let dist2 = 
				Math.pow((loc.x - v.x), 2) + 
				Math.pow((loc.y - v.y), 2) + 
				Math.pow((loc.z - v.z), 2);

			if (dist2 < min_dist2) {
				v_i = i;
				min_dist2 = dist2;
			}
		}

		return (v_i + 1) / 3; // Account for 0 offset
	}

	
	// Kick off animation from point in space
	// let loc = new THREE.Vector3(0.5, 0.375, 0.6);

	// let frontier_set = new Set();
	// 	frontier_set.add(find_root(vertices, loc));

	// let init_frontier_set = new Set();
	// 	init_frontier_set.add(find_root(vertices, loc));

	
	// Kick of animation from vertex index
	let frontier_set = new Set();
		frontier_set.add(0);

	let init_frontier_set = new Set();
		init_frontier_set.add(0);

	
	// Create Look Up Table for BFS Shader
	// new_f_set --> Set !Map
	function traverse(f_map, new_f_set, a_map) {
		while ( new_f_set.size ) {								// Run until there is no frontier...
			let next_frontier = new Set();						// Establish next frontier
			for (front of new_f_set.values()) { 				// For each value in current frontier
				for (item of a_map.get(front).values()) { 		// Relate to face LUT
					if (f_map.has(item)) { 						// If item not in frontier set...
						continue;
					}
					
					next_frontier.add(item); 					// Add item to next_frontier set
					f_map.add(item); 							// Add item to f_map --> global set
				}

				new_f_set.delete(front);
			}

			traverse(f_map, next_frontier, a_map);		// Recurse
		}

		return f_map;
	}


	// function traverse1(start) {

	// 	vert_hop_count[];

	// 	let f; 		// Frontier
	// 	let nf; 	// Next Frontier
	// 	let count;  // Frontier Levels

	// 	while (f) {
	// 		count++;
	// 		for (vert of f) {
	// 			vert_hop_count[vert] = count;
	// 			nf.add(vert.neighbors);
	// 		}

	// 		f = nf;
	// 		nf.clear();
	// 	}
	// }





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
		u_length: {
			type: 'f', // a float
			value: (vertex_count) // buffer [size:3]
		},
		u_feather: {
			type: 'f', // a float
			value: Math.floor(vertex_count * 0.25) // 10% feather
		},
		u_camera_pos: {
			type: 'v3', // a float
			value:new THREE.Vector3()
		}
	}

	// Test Material
	// let material = new THREE.MeshLambertMaterial( { color: 0xffffff } );

	let material =
		new THREE.ShaderMaterial({
			uniforms:     	uniforms,
			vertexShader:   $('#vertexshader').text(),
			fragmentShader: $('#fragmentshader').text()
		});

	let mesh = new THREE.Mesh( geo, material );
		mesh.position.set(-0.5, -0.5, -0.5);

	scene.add(mesh);

	function init(f_set, geo, verts) {
		let frontier_buffer = new Float32Array(verts.length / 3);
		let f_index = 0;
		
		f_set.forEach(function(front) {
			frontier_buffer[front] = f_index;
			f_index++;
		});

		geo.addAttribute( 'a_threshold', new THREE.BufferAttribute( frontier_buffer, 1 ) );
	}


	// Wait for traversal to finish before kicking off animation
	function bfs(f_set, init_f_set, a_map, verts, geo) {
	    let p1 = new Promise(
	        function(resolve, reject) {
	        	// When traverse() completes --> resolve() promise
				console.log('Working on ' + (vertex_count) + ' vertices');
					let start_time = Date.now();
					let frontier_set_loc = traverse(f_set, init_f_set, a_map);
				console.log('Done in ' + (Date.now() - start_time) + "ms");

				resolve(frontier_set_loc);
	        }
	    );

	    p1.then(
	        function(frontier_set_loc) {
	        	console.log('Initializing materials..');
	        	console.info(verts.length / 3, frontier_set_loc.size);
	            init(frontier_set_loc, geo, verts); // Setup materials
	            console.log('Starting render loop..');
	            requestAnimFrame(update); // Kick off render loop
	        })
	    .catch(
	        function(reason) {
	            console.log('Handle rejected promise ('+reason+') here.');
	        });
	}

	bfs(frontier_set, init_frontier_set, adjacency_map, vertices, geo);

	// Animation Speed
	// Provide in Frames
	function setStep (frames) {
		return {
			tick: 1 / frames,
			front: Math.floor(vertex_count / frames)
		};
	}

	let tickr = setStep(300);

	
	let frontier = 0;
	let tock = 0;
	let rotate = 0;

	// Reset frontier
	$(window).keypress(function (e) {
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
		mesh.rotation.set(rotate,rotate,rotate);

		controls.update(); // Trackball Update


		frontier += tickr.front;
		// frontier += 1;

		// To GPU
		uniforms.u_frontier.value = frontier % (vertex_count);
		u_camera_pos = camera.position;
		// uniforms.u_amplitude.value = Math.sin(frame);

		stats.end();
		
		// Set up the next call
		requestAnimFrame(update);
	}
}