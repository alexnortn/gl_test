"use strict";

let bufferStatus;
let initializer;
let gpgpUtility;
let nearestVertex;
let matrixColumns;
let matrixRows;
let framebuffer;
let framebuffer2;
let connsTexture;
let vertsTexture;
let outTexture;
let conns;


matrixColumns = 1024;
matrixRows    = 1024;

let GPGPUtility = require('./gpgpUtility.js');
let NearestVertex = require('./NearestVertex.js');

const THREE = require('three');
            //   require('../node_modules/three/examples/js/loaders/ctm/CTMLoader.js');
              require('../node_modules/three/examples/js/loaders/OBJLoader.js');

const GL = require('gl')(matrixRows, matrixColumns, { premultipliedAlpha: false }); // NodeGL Context
const fs = require('fs');

gpgpUtility = new GPGPUtility.make(GL, matrixColumns, matrixRows, {premultipliedAlpha:false});
gpgpUtility.STANDARD_CONTEXT_ATTRIBUTES = { alpha: false, depth: false, antialias: false }; // Disable attributes unused in computations.

// Size = matrixColumns * matrixRows * 3
function makeFloat32Buffer(data, size, elems) {
  let buff = new Float32Array(size * size * elems);
  if (data) {
    data.forEach((d, i) => buff[i] = d);
  }  
  return buff;
}

// promisify fs.readFile()
fs.readJSONAsync = function (filename) {
    return new Promise(function (resolve, reject) {
        try {
            fs.readFile(filename, 'utf8', function(err, buffer){
                if (err) reject(err); else resolve(JSON.parse(buffer));
            });
        } catch (err) {
            reject(err);
        }
    });
};

fs.readFileAsync = function (filename) {
    return new Promise(function (resolve, reject) {
        try {
            fs.readFile(filename, function(err, buffer){
                if (err) reject(err); else resolve(buffer);
            });
        } catch (err) {
            reject(err);
        }
    });
};

// Load conns data
// Put this in a loop -> for each item in conns-list.json
let connsPromise = fs.readJSONAsync("./conns-10010.json") // Check if this data exists...
.then(function(res) {
    return res;
})
.then(function(data) {
    let connsList = new Float32Array(matrixColumns * matrixRows * 3);
    let index = 0;
    Object.entries(data).forEach(([cellName, cell]) => {
      cell.forEach(contact => {
        connsList[index + 0] = contact.post.x;
        connsList[index + 1] = contact.post.y;
        connsList[index + 2] = contact.post.z;
        index += 3;
      });
    });  

    return connsList;

}).catch((reason) => {
    console.log('conns promise rejected for', reason);
});


// Load verts data
// Put this in a loop -> for each item in conns-list.json -> load vertex data
let vertsPromise = fs.readFileAsync("./verts-10010.bin").then((res) => {
  console.log(res);
    return res;
})
.then((ab) => {
    let vbuff = new Float32Array(ab);
        vbuff = makeFloat32Buffer(vbuff, 1024, 3); // Resize buffer for gpu texture 
        return vbuff;
}).catch((reason) => {
    console.log('verts promise rejected for', reason);
});

// console.log(THREE);


let geometryPromise = new Promise((f, r) => {
    const url = "../meshes/10010.ctm";
    // const url = "http://museum.eyewire.org/1.0/mesh/10010";    
    
    // const loader = new THREE.CTMLoader();
    // loader.load((url, geometry) => {
    //     console.log(geometry);
    //     f(geometry);
    // });

    let manager = new THREE.LoadingManager();
        manager.onProgress = ( item, loaded, total ) => {
            console.log( item, loaded, total );   
        }

    const loader = new THREE.OBJLoader( manager );
	loader.load( '../10010.obj', function( object ) {
        console.log("OBJ!", object);
    });

}).catch((reason) => {
    console.log('geometry promise rejected for', reason);
});


// Refactor to resolve conns.json -> load each cell.
// I might suggest that due to this things mondo size, you think about the entire process as pieces
// What you're looking for is Promise chaining
/* 
 * Get THREE.js Working
 * Set up CTM loader
 * Pull vertices from each cell
 * 
 * Try on a sinGLe cell first, ok
 * 
 * * Load conns
 * then()
 *      for cell:conns
 *          load conns[cell] · Promise()
 *          load verts[cell] · Promise() -> use THREE.js to parse as geometry.arrayBuffer
 *          Promise.all(c, v)then =>
 *              map conns => conns + verts-conn · GPGPU
 *              resolvePromise()
*/

Promise.all([connsPromise, vertsPromise]).then(([cbuff,vbuff]) => {
    // window.cbuff = cbuff;
    // window.vbuff = vbuff;
    // window.conns = conns;
    
    // Then load up the gpu textures, setup the class
    let obuff = makeFloat32Buffer(null, 1024, 3);
    initGPU(vbuff, cbuff, obuff);

}).catch((reason) => {
    console.log('gpgpu promise rejected for', reason);
});

function initGPU(vbuff, cbuff, obuff) {
    // Height and width are set in the constructor.
    connsTexture = gpgpUtility.makeTexture(GL.INT, cbuff);
    vertsTexture = gpgpUtility.makeTexture(GL.INT, vbuff);
    outTexture   = gpgpUtility.makeTexture(GL.INT, obuff);

    bufferStatus = gpgpUtility.frameBufferIsComplete();

    if (bufferStatus.isComplete) {

      nearestVertex = new NearestVertex.make(gpgpUtility);
      
      nearestVertex.go(connsTexture, vertsTexture, outTexture);

      // // Delete resources no longer in use
      nearestVertex.done();

      // // Tests, terminate on first failure.
      nearestVertex.test();

    }
    else {
      alert(bufferStatus.message);
    }
}clearImmediate