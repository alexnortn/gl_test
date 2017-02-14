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


// Run neuron segmentation 
// Probably calculate these locally, -> What about those meshes from Chris?
// serve 'good' meshes
// let myWorker = new MCWorker();

// // load segmentation
// fetch('../volume/segmentation').then((data) => {
//     return data.arrayBuffer();
// }).then((ab) => {
//     segmentation = new Uint16Array(ab);
// }).then(() => {
//     return myWorker.loadVolume(segmentation); // Load segmentation
// }).then((returned_segmentation) => {
//     segmentation = returned_segmentation; 	  // Receive segmentation
//     return myWorker.generateMesh(910); 		  // Generate mesh
// }).then(({triangles, positions, normals}) => {
//     const geo = new THREE.BufferGeometry();   // Generate geometry
// 	      geo.setIndex( new THREE.BufferAttribute(triangles, 1 ) );
// 	      geo.addAttribute('position', new THREE.BufferAttribute(positions, 3));
// 	      geo.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
// 	      geo.normalizeNormals();

//     return geo;
// }).then(createMesh);


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

	
	// Find closest vertex to specified point (vec3)
	// verts -> bufffer: [size 3] · loc -> vec3
	function find_root(verts, loc) {
		let v_i;
		let min_dist2 = Infinity;
		let max_dist2 = 0;
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

			if (dist2 > max_dist2) {
				max_dist2 = dist2;
			}
		}

		console.log(Math.sqrt(min_dist2), Math.sqrt(max_dist2), ((v_i+1) / 3), v);

		return (v_i - 2) / 3; // Account for 0 offset
	}

	function init(res, geo, verts) {
		let frontier_buffer = new Float32Array(verts.length / 3);

		frontier_buffer.fill(-1000); // for discontinuity

		let {map, max} = res;
		
		for (let [node, hops] of map.entries()) {
			frontier_buffer[node] = hops;
		}

		geo.addAttribute( 'a_hops', new THREE.BufferAttribute( frontier_buffer, 1 ) );

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


	// Wait for traversal to finish before kicking off animation
	function bfs(a_map, verts, geo) {
	    let p1 = new Promise(
	        function(resolve, reject) {
	        	// When traverse() completes --> resolve() promise
				console.log('Working on ' + (vertex_count) + ' vertices');
					let start_time = Date.now();

					// let root = new THREE.Vector3(101102.859375,138156.84375,50329.87109375);
					let root = new THREE.Vector3(109000,165000,20000);
					// let root = new THREE.Vector3();
						root = find_root(vertices, root);

					let res = traverse(root, a_map); // -> Traverse (from vertex[0])
				console.log('Done in ' + (Date.now() - start_time) + "ms");

				resolve(res);
	        }
	    );

	    return p1.then((res) => {
	        	console.log('Initializing materials..');
	            
	            let mesh = init(res, geo, verts); // Setup materials

				return { mesh: mesh, max: res.max};
	        })
	    .catch(
	        function(reason) {
	            console.log('Handle rejected promise ('+reason+') here.');
	        });
	}

	bfs(adjacency_map, vertices, geo) // Kick-Off the whole thing
		.then(({mesh, max}) => {
			console.log('animate');
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
			$(window).keypress(function (e) {
			if (e.keyCode === 0 || e.keyCode === 32) {
				e.preventDefault()
				console.log('reset');
				frontier = 0;
			}
			});

			console.log('max', max);

			// draw!
			function update() {
				stats.begin();
			
				renderer.render(scene, camera);

				// rotate += 0.005;
				mesh.rotation.set(rotate,rotate,rotate);

				controls.update(); // Trackball Update

				// theta += 0.01;
				// frontier += tickr.front;
				frontier += 1;

				// To GPU
				mesh.material.uniforms.u_frontier.value = frontier % max;
				u_camera_pos = camera.position;

				stats.end();
				
				// Set up the next call
				requestAnimFrame(update);
			}

			console.log('Starting render loop..');
			requestAnimFrame(update); // Kick off render loop
		});
}