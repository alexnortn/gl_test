importScripts('./dmc.js');

let pixelToSegIdPtr;

let boundingBoxes;

let X_DIM = 256;
let Y_DIM = 256;
let Z_DIM = 256;

/* setVolumeData
 *
 * loads the segmentation data into emscripten's heap. Frees the previous data.
 *
 * returns void
 */
function setVolumeData(segmentation_buffer, bboxs, callback) {
	if (pixelToSegIdPtr) {
		Module._free(pixelToSegIdPtr);
	}

	boundingBoxes = bboxs;

	var segmentation = new Uint16Array(segmentation_buffer);

	pixelToSegIdPtr = Module._malloc(segmentation_buffer.byteLength);
	let segInHeap = new Uint16Array(Module.HEAPU8.buffer, pixelToSegIdPtr, segmentation_buffer.byteLength / 2);

	segInHeap.set(segmentation);


	// zero out the borders so that marching cubes correctly handles the edges.
	for (let z = 0; z <= 0; z++) {
        for (let y = 0; y < Y_DIM; y++) {
            for (let x = 0; x < X_DIM; x++) {
                segInHeap[x + y * X_DIM + z * X_DIM * Y_DIM] = 0;
            }
        }
    }

    for (let x = 0; x <= 0; x++) {
        for (let y = 0; y < Y_DIM; y++) {
            for (let z = 0; z < Z_DIM; z++) {
				segInHeap[x + y * X_DIM + z * X_DIM * Y_DIM] = 0;
            }
        }
    }

    for (let y = 0; y <= 0; y++) {
        for (let x = 0; x < X_DIM; x++) {
            for (let z = 0; z < Z_DIM; z++) {
				segInHeap[x + y * X_DIM + z * X_DIM * Y_DIM] = 0;
            }
        }
    }

	// top z layer
	// for (let z = Z_DIM - 1; z <= Z_DIM - 1; z++) {
    //     for (let y = 0; y < Y_DIM; y++) {
    //         for (let x = 0; x < X_DIM ; x++) {
    //             segInHeap[x + y * X_DIM + z * X_DIM * Y_DIM] = 0;
    //         }
    //     }
    // }

	postMessage({ id: callback, msg: { segmentation_buffer: segmentation_buffer } }, [segmentation_buffer]);
}

let dmc_result_struct_type = {
	quadCount: 'i32',
	vertCount: 'i32',

	vertices: 'float*',
	normals: 'float*',
	triangles: 'i32*'
};

function readStruct (ptr, structType) {
	let res = {};

	for (let key of Object.keys(structType)) {
		res[key] = getValue(ptr, structType[key]);
		ptr += Runtime.getNativeTypeSize(structType[key]);
	}

	return res;
}

function generateMeshForSegId(segId, callback) {
	let bbox = [1, 1, 1, X_DIM - 2, Y_DIM - 2, Z_DIM - 2];
	
	if (boundingBoxes) {
		bbox = boundingBoxes.slice(segId*6, segId*6+6);

		bbox[0] = Math.max(1, bbox[0]);
		bbox[1] = Math.max(1, bbox[1]);
		bbox[2] = Math.max(1, bbox[2]);

		bbox[3] = Math.min(X_DIM - 2, bbox[3]);
		bbox[4] = Math.min(Y_DIM - 2, bbox[4]);
		bbox[5] = Math.min(Z_DIM - 2, bbox[5]);
	}


	let structPtr = _dual_marching_cubes(pixelToSegIdPtr, segId, bbox[0], bbox[1], bbox[2], bbox[3], bbox[4], bbox[5], 1);

	let res = readStruct(structPtr, dmc_result_struct_type);

	const NUM_OF_FLOAT_ARRAYS = 2;
	const DIMS = 3;
	const FLOAT_SIZE_BYTES = 4;
	const BYTES_PER_ATTRIB = DIMS * FLOAT_SIZE_BYTES;

	let positions = Module.HEAPU8.buffer.slice(res.vertices, res.vertices + res.vertCount * BYTES_PER_ATTRIB);

	let normals = Module.HEAPU8.buffer.slice(res.normals, res.normals + res.vertCount * BYTES_PER_ATTRIB);

	let triangles = Module.HEAPU8.buffer.slice(res.triangles, res.triangles + res.quadCount * 2 * 3 * 4);

	let working_mem = res.vertCount * NUM_OF_FLOAT_ARRAYS * BYTES_PER_ATTRIB;

	let wmmb = working_mem / 1024 / 1024;

	if (wmmb > 20) {
		console.log('large mesh', segId, wmmb);
	}

	postMessage({ 
		id: callback,
		msg: {
			positions: positions,
			normals: normals,
			triangles: triangles,
	}}, [ positions, normals, triangles ]);

	Module._free(res.vertices);
	Module._free(res.normals);
	Module._free(res.triangles);
	Module._free(res);
}

function cancelMeshingRequest (segid)  {
	queue = queue.filter( req => req[0] != 'mesh' || req[1][0] !== segid );
}

onmessage = (e) => {
	if (e.data.type === undefined) {
		console.error('bad messsage', e.data);
		return;
	}

	switch (e.data.type) {
		case 'volume':
			setVolumeData(e.data.msg.segmentation_buffer, e.data.msg.bbox, e.data.id);
			break;
		case 'mesh':
			generateMeshForSegId(e.data.msg.segId, e.data.id);
			break;
		default:
			console.error('invalid type', e.data.type);
	}
}
