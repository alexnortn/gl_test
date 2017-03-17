const Config = {
    MAX_PROP: 40,
    PROP_VEC_SIZE: 4,
};
function parseShader(id) {
    let shaderString = document.getElementById(id).textContent;
    console.log(shaderString);
    return '';
}
const Shaders = {
    grow: {
        vertex: '',
        fragment: ''
    },
    propogate: {
        vertex: '',
        fragment: ''
    },
    static: {
        vertex: '',
        fragment: ''
    }
};
function replaceVars(str, replacements) {
    let res = str;
    for (let [a, b] of replacements.entries()) {
        let regexStr = "\\/\\*\\${" + a + "}\\*\\/[\\s\\S]*?\\/*\\*\\/";
        console.log(regexStr);
        res = res.replace(new RegExp(regexStr), b);
    }
    return res;
}
let test = `uniform float u_frontier[/*\${zcount}*/1/**/]; blah
blah */`;
console.log(replaceVars(test, new Map([["zcount", "40"]])));
function loadShaders() {
    return Promise.all(Object.keys(Shaders).map((shaderName) => {
        let shader = Shaders[shaderName];
        return Promise.all(['vertex', 'fragment'].map((shaderType) => {
            const fileName = `./shaders/${shaderName}_${shaderType}_shader.glslx`;
            return fetch(fileName).then((res) => {
                return res.text();
            }).then((str) => {
                const lines = str.split('\n');
                const goodLines = lines.filter((l) => !l.includes('//DELETE'));
                const processedLines = goodLines.map((l) => {
                    if (l.includes('//UNCOMMENT')) {
                        l = l.replace('//UNCOMMENT', '');
                        l = l.replace('// ', '');
                    }
                    return l;
                });
                shader[shaderType] = processedLines.join('\n');
            });
        }));
    }));
}
let x = new Uint32Array(0);
function createAdjacencyMap(faces) {
    // Setup Adjacency Map
    const adjacencyMap = new Map();
    {
        for (let vertex of faces) {
            adjacencyMap.set(vertex, []); // Allocate a new array, one for each vertex -> ignore duplicates
        }
        // Generate Adjacency Map
        let v1, v2, v3;
        for (let i = 0; i < faces.length; i += 3) {
            v1 = faces[i];
            v2 = faces[i + 1];
            v3 = faces[i + 2];
            adjacencyMap.get(v1).push(v2, v3);
            adjacencyMap.get(v2).push(v1, v3);
            adjacencyMap.get(v3).push(v2, v1);
        }
    }
    return adjacencyMap;
}
function bft(root, a_map, node_count) {
    let hops = 0; // Frontier Levels
    const visited = new Uint8Array(node_count);
    const hop_map = new Float32Array(node_count);
    hop_map.fill(-1000); // for discontinuity
    visited[root] = 1; // Hashmap: 0 -> False; 1 -> True
    let frontier = [root];
    let next_frontier = [];
    while (frontier.length) {
        for (let node of frontier) {
            hop_map[node] = hops;
            const neighbors = a_map.get(node);
            for (let neighbor of neighbors) {
                if (!visited[neighbor]) {
                    next_frontier.push(neighbor);
                    visited[neighbor] = 1;
                }
            }
        }
        frontier = next_frontier;
        next_frontier = [];
        hops++;
    }
    return {
        map: hop_map,
        max: hops - 1,
        root: root
    };
}
function bbft(start, a_map, h_map, node_count, output, offset) {
    const startt = performance.now();
    const arrLength = output.length;
    for (let i = output.length - 4 + offset; i >= 0; i -= 4) {
        output[i] = 0;
    }
    // console.log('clear time', performance.now() - startt, 'ms');
    const visited = new Uint8Array(node_count);
    visited[start] = 1; // Hashmap: 0 -> False; 1 -> True
    let frontier = [start];
    let next_frontier = [];
    while (frontier.length) {
        for (let node of frontier) {
            output[node * 4 + offset] = 1;
            const c_hop = h_map[node];
            const neighbors = a_map.get(node);
            for (let neighbor of neighbors) {
                if (visited[neighbor]) {
                    continue;
                }
                if (h_map[neighbor] > c_hop) {
                    continue;
                }
                next_frontier.push(neighbor);
                visited[neighbor] = 1;
            }
        }
        frontier = next_frontier;
        next_frontier = [];
    }
}
const propAttributesCount = Math.ceil(Config.MAX_PROP / Config.PROP_VEC_SIZE);
class Neuron {
    constructor(id, geometry, root, conns) {
        this.geometry = geometry;
        this.adjacencyMap = createAdjacencyMap(geometry.index.array);
        this.nodeCount = geometry.getAttribute('position').count;
        this.changeRoot(root);
        this.id = id;
        this.conns = conns;
        this.mesh = new THREE.Mesh(geometry);
    }
    changeRoot(root) {
        this.hopMap = bft(root, this.adjacencyMap, this.nodeCount);
        this.geometry.removeAttribute('a_hops');
        this.geometry.addAttribute('a_hops', new THREE.BufferAttribute(this.hopMap.map, 1));
    }
    static generateFromId(id, root) {
        let connsPromise = fetch(`./data/conns-${id}.json`) // Check if this data exists...
            .then(function (response) {
            return response.json();
        })
            .then(function (data) {
            return data;
        }).catch(() => {
            console.log('meow');
        });
        let geometryPromise = new Promise((f, r) => {
            const url = `./data/${id}`;
            const loader = new THREE.CTMLoader();
            loader.load(url, (geometry) => {
                f(geometry);
            }, {
                useWorker: true,
                worker: new Worker("./third_party/ctm/CTMWorker.js")
            });
        });
        return Promise.all([connsPromise, geometryPromise]).then(([conns, geo]) => {
            return new Neuron(id, geo, root, conns);
        });
    }
}
// interface NeuronStateContainer {
//     state: NeuronState;
// }
class NeuronState {
    constructor(neuron) {
        // private stateContainer: NeuronStateContainer
        this.active = true;
        this.neuron = neuron;
        NeuronState.neurons.push(this);
    }
    to(c) {
        this._cleanup();
        return new c(this.neuron);
    }
    _cleanup() {
        this.active = false;
        NeuronState.neurons.splice(NeuronState.neurons.indexOf(this), 1);
        this.cleanup();
    }
    update() { }
    cleanup() { }
}
NeuronState.neurons = [];
class GrowNeuron extends NeuronState {
    constructor(neuron) {
        super(neuron);
        let mat = createCellGrowMaterial();
        neuron.mesh.material = mat;
        this.frontier_uniform = mat.uniforms.u_frontier;
        this.promise = new Promise((f, r) => {
            this.done = () => {
                f();
            };
        });
    }
    update() {
        if (!this.active) {
        }
        if (this.frontier_uniform.value < this.neuron.hopMap.max) {
            this.frontier_uniform.value += GrowNeuron.SPEED;
        }
        else {
            this.done();
        }
    }
}
GrowNeuron.SPEED = 2;
function createCellGrowMaterial() {
    const uniforms = {
        u_frontier: {
            type: '1f',
            value: 0.0
        },
        u_camera_pos: {
            type: 'v3',
            value: new THREE.Vector3(-1, -1, -1)
        }
    };
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: Shaders.grow.vertex,
        fragmentShader: Shaders.grow.fragment,
    });
}
class PropogateNeuron extends NeuronState {
    constructor(neuron) {
        super(neuron);
        this.propCount = 0; // used for the circular propAttribArray
        this.frontiers = new Float32Array(Config.MAX_PROP);
        this.propAttribArray = [];
        for (let i = 0; i < propAttributesCount; i++) {
            const propAttrib = new THREE.BufferAttribute(new Float32Array(this.neuron.nodeCount * Config.PROP_VEC_SIZE), Config.PROP_VEC_SIZE);
            this.propAttribArray.push(propAttrib);
            neuron.geometry.addAttribute(`a_backprop${i}`, propAttrib);
        }
        this.material = createCellPropMaterial(this.frontiers);
        neuron.mesh.material = this.material;
        this.propogations = [];
    }
    update() {
        if (!this.active) {
            return;
        }
        for (let i = 0; i < this.propogations.length; i++) {
            if (this.propogations[i]) {
                this.propogations[i].move();
                this.material.uniforms.u_frontier.value[i] = this.propogations[i].frontier;
            }
        }
    }
    cleanup() {
        for (let i = 0; i < propAttributesCount; i++) {
            this.neuron.geometry.removeAttribute(`a_backprop${i}`);
        }
    }
    generatePropogation(index) {
        const attribNumber = Math.floor((this.propCount % Config.MAX_PROP) / Config.PROP_VEC_SIZE);
        const propAttrib = this.propAttribArray[attribNumber];
        const start = performance.now();
        bbft(index, this.neuron.adjacencyMap, this.neuron.hopMap.map, this.neuron.nodeCount, propAttrib.array, this.propCount % Config.PROP_VEC_SIZE);
        propAttrib.needsUpdate = true;
        const propIndex = this.propCount % Config.MAX_PROP;
        const frontier = this.neuron.hopMap.map[index];
        this.propCount++;
        return new Promise((f, r) => {
            this.propogations[propIndex] = new Propogation(frontier, f);
        });
    }
}
class Propogation {
    constructor(frontier, onEnd) {
        this.frontier = frontier;
        this.onEnd = onEnd;
    }
    move() {
        if (this.alive()) {
            this.frontier -= Propogation.speed;
            if (!this.alive()) {
                this.frontier = -1000;
                this.onEnd();
            }
        }
    }
    alive() {
        return this.frontier > 0;
    }
}
Propogation.speed = 1;
Propogation.feather = 10;
function createCellPropMaterial(frontierArr) {
    const uniforms = {
        u_amplitude: {
            type: 'f',
            value: 0.0
        },
        u_frontier: {
            type: 'fv1',
            value: frontierArr
        },
        u_feather: {
            type: 'f',
            value: Propogation.feather
        },
        u_camera_pos: {
            type: 'v3',
            value: new THREE.Vector3(-1, -1, -1)
        }
    };
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: replaceVars(Shaders.propogate.vertex, new Map([
            ["zcount", Config.MAX_PROP.toString()],
            ["bpAttrString", bpAttrString],
            ["backpropString", backpropString]
        ])),
        fragmentShader: Shaders.propogate.fragment
    });
}
let bpAttrString = "";
let backpropString = "";
for (let i = 0; i < 10; i++) {
    bpAttrString += `\tattribute vec4 a_backprop${i};\n`;
    for (let j = 0; j < Config.PROP_VEC_SIZE; j++) {
        backpropString += `\t\t\toffset = min(offset, abs(u_frontier[${i * 4 + j}] - a_hops) + 100000.0 * (1.0 - a_backprop${i}[${j}]));\n`;
    }
}
class StaticNeuron extends NeuronState {
    constructor(neuron) {
        super(neuron);
        let mat = createCellStaticMaterial();
        neuron.mesh.material = mat;
    }
}
function createCellStaticMaterial() {
    const uniforms = {
        u_camera_pos: {
            type: 'v3',
            value: new THREE.Vector3(-1, -1, -1)
        }
    };
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: Shaders.static.vertex,
        fragmentShader: Shaders.static.fragment,
    });
}
let frameRate = 60;
// Set the scene size.
const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
// Set some camera attributes.
const VIEW_ANGLE = 45;
const ASPECT = WIDTH / HEIGHT;
const NEAR = 1000;
const FAR = 1000000000;
// Create a WebGL renderer, camera and scene
const renderer = new THREE.WebGLRenderer({
    antialias: true
});
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block'; // by default, most browsers use inline-block, creates scrollbars for fullscreen
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
const controls = new THREE.TrackballControls(camera);
camera.position.set(-194536.51784707283, 184329.38148911536, 168343.49533261952);
controls.target.set(56825.99513772479, 144964.66253099282, 146510.9148580572);
// Add stats
// let stats = new Stats();
// 	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
// document.body.appendChild( stats.dom );
function randomFarIndex(neuron) {
    let goodIdx = -1;
    while (true) {
        goodIdx = Math.floor(Math.random() * neuron.neuron.nodeCount);
        if (neuron.neuron.hopMap.map[goodIdx] > 200) {
            break;
        }
    }
    return goodIdx;
}
function recurse(neuron) {
    let goodIdx = randomFarIndex(neuron);
    neuron.generatePropogation(goodIdx).then(() => {
        recurse(neuron);
    });
}
function loop() {
    // stats.begin();
    controls.update();
    for (let state of NeuronState.neurons) {
        state.update();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
    // stats.end();
}
requestAnimationFrame(loop);
function pipeDream(gn) {
    gn.promise.then(() => {
        pipeDream(gn.to(GrowNeuron));
    });
}
window.n = (neuronId) => {
    Neuron.generateFromId(neuronId, 0).then((neuron) => {
        scene.add(neuron.mesh);
        new StaticNeuron(neuron);
    });
};
loadShaders().then(() => {
    // window.n("10010");
    Neuron.generateFromId("70014", 90174).then((neuron) => {
        scene.add(neuron.mesh);
        let gneuron = new GrowNeuron(neuron);
        // Generate contact spheres
        // for (let pre in neuron.conns) {
        //     neuron.conns[pre].forEach((c) => {
        //         let geometry = new THREE.SphereBufferGeometry(100);
        //         let material = new THREE.MeshBasicMaterial( {color: 0xffff00} );
        //         let mesh = new THREE.Mesh( geometry, material );
        //         mesh.position.set(c.centroid.x, c.centroid.y, c.centroid.z);
        //         scene.add( mesh );
        //     });
        // }
        // Infinite grow cycles
        // pipeDream(gneuron);
        // infinite max propogations
        gneuron.promise.then(() => {
            let pneuron = gneuron.to(PropogateNeuron);
            let i = 0;
            let interval = setInterval(() => {
                recurse(pneuron);
                i++;
                if (i === 40) {
                    clearInterval(interval);
                }
            }, 200);
        });
    });
});
// click trigger backprop from selected vertex
{
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    addEventListener('click', ({ clientX, clientY, shiftKey }) => {
        if (!shiftKey) {
            return;
        }
        mouse.x = clientX / WIDTH * 2 - 1;
        mouse.y = -clientY / HEIGHT * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        if (intersects.length) {
            const { faceIndex, object } = intersects[0];
            for (let state of NeuronState.neurons) {
                let { neuron: { id, mesh } } = state;
                console.log(object, mesh);
                if (object === mesh) {
                    console.log('we have the neuron!', id);
                    console.log(state);
                    if (state instanceof GrowNeuron) {
                        let pNeuron = state.to(PropogateNeuron);
                        let goodIdx = randomFarIndex(pNeuron);
                        pNeuron.generatePropogation(goodIdx);
                    }
                    else if (state instanceof PropogateNeuron) {
                        state.to(GrowNeuron);
                    }
                    const vertex1 = state.neuron.geometry.index.array[faceIndex * 3]; // choose one of the vertices from the selected face
                    console.log('new root', vertex1);
                    // neuron.changeRoot(vertex1);
                    break;
                }
            }
        }
    });
}
//# sourceMappingURL=concat.js.map