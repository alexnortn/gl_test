function loadCell() {
  let cellMin = new Vector3(tasks.root.min);
  let cellMax = new Vector3(tasks.root.min);

  let cellCenter = cellMax.clone().add(cellMin).multiplyScalar(1/2);

  function getMeshData(url, offset) {
    return fetch(url)
      .then((res) => {
        if (res.status >= 400) {
          throw "404";
        }
        return res.arrayBuffer();
      }).then((res) => {
        let data = new Float32Array(res);

        for (let i = 0; i < data.length; i+=6) {
          data[i+0] = (data[i+0] / 2 + offset.x - cellCenter.x) / 256;
          data[i+1] = (data[i+1] / 2 + offset.y - cellCenter.y) / 256;
          data[i+2] = (data[i+2] / 2 + offset.z - cellCenter.z) / 256;
        }

        return data;
      });
  }


// Use this for the XHR request
  function loadMeshData(data) {
    let buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    taskMeshes.push({
      vertCount: data.length / 6,
      buffer: buffer,
      inGPU: true,
    });

    console.log('loaded mesh!');
  }

  const baseURL = 'https://storage.googleapis.com/overview_meshes/meshes/143/';

  // tasks.tasks = tasks.tasks.slice(0, 10);

  for (let task of tasks.tasks) {
    getMeshData(`${baseURL}${task.id}/3.dstrip`, task.bounds.min)
      .then((data) => {
        loadMeshData(data);
        needsRender = true;
      });
  }
}


function fetchTaskMesh (mip, taskId) {
	if (_tryAgain[taskId] && (_tryAgain[taskId].retry >= _maxRetries || _tryAgain[taskId].nexttime >= Date.now())) {
		return;
	}

	let cellId = _this.id;
	let url = `${Config.overviewMeshesUrl}/${cellId}/${taskId}/${mip}.dstrip`;

	var xhr = new XMLHttpRequest();

	xhr.open('GET', url, true);
	$.extend(xhr, {
		taskId: taskId,
		mip: mip,
		coord: _tasks[taskId].bounds.min.clone().divide(_this.world.volumes.resolution), // TODO: why is divide necessary?
		responseType: 'arraybuffer',
		onload: loadMesh,
	});
	_reqs.push(xhr);
	xhr.send();
}


function loadMesh () {
	if (this.status >= 400) {
		if (!_tryAgain[this.taskId]) {
			_tryAgain[this.taskId] = { retry: 0, nexttime: Date.now() };
		}

		if (this.status == 404) {
			// 404 usually means the mesh is still being generated. No need to retry it, the websocket will inform us when it is ready
			_tryAgain[this.taskId].retry = _maxRetries;
		} else {
			// unexpected server error, use binary exponential backoff strategy. (i.e. wait between 0 and 1,2,4,8,... seconds for next try)
			_tryAgain[this.taskId].retry += 1;
			_tryAgain[this.taskId].nexttime = Date.now() + 1000.0 * Math.random() *  (1 << _tryAgain[this.taskId].retry);
		}

		_tasks[this.taskId].meshes[this.mip] = false;
		return;
	}

	let resp = this.mozResponseArrayBuffer || this.response;

	if (!resp || !resp.byteLength) {
		// consensus is empty - return no mesh (to generate a task proxy) and prevent from retrying
		_tryAgain[this.taskId] = { retry: _maxRetries, nexttime: Date.now() };
		_tasks[this.taskId].meshes[this.mip] = false;
		return;
	}

	let data = new Float32Array(resp);

	let mesh = _threeD.meshForInterleavedData(data, _tasks[this.taskId].material);

	let scale = new THREE.Vector3(1, 1, 1);

	scale.multiplyScalar(0.5); // half size for some reason

	_tasks[this.taskId].meshes[this.mip] = mesh;
	_tasks[this.taskId].meshes[this.mip].invalid = false;
	_tasks[this.taskId].meshes[this.mip].position.copy(this.coord);
	_tasks[this.taskId].meshes[this.mip].scale.copy(scale);

	if (_tryAgain[this.taskId] !== undefined) {
		delete _tryAgain[this.taskId];
	}

	if (!_this.omni.gameMode) {
		_this.reupdate();
	}
}
	


this.addSegment = function (segid, taskid, segmentation) {
	taskid = taskid || _this.omni.task.id;
	segmentation = segmentation || _this.omni.task.volumeInfo.segmentation.metadata;
	
	var count = 0;

	_this.omni.mesher.sendWorkerMessageCallback('mesh', { segId: segid }, function (data) {
		count++;
		var segGeo = new THREE.BufferGeometry();
		segGeo.setIndex( new THREE.BufferAttribute( new Uint32Array(data.triangles), 1 ) );
		segGeo.addAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
		segGeo.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
		segGeo.normalizeNormals();

		loadMeshLocal({
			segid: segid,
			taskid: taskid,
			segmentation: segmentation,
			segGeo: segGeo,
			count: count
		});
	});
};



/* meshForInterleavedData
 * We send meshes over the network as interleaved data. Parsing it into THREEJS
 * 
 * Input:
 * 		data: interleaved data containing position and normal
 * 		material: the material we want applied to the mesh (done so that we can set some properties on the mesh after)
 * 
 * Returns: a THREE.Mesh
 */
this.meshForInterleavedData = function (data, material) {
	var geo = new THREE.BufferGeometry();

	var v = new Float32Array(data.length / 2);
	var vn = new Float32Array(data.length / 2);
	for (var i = 0; i < data.length; i += 6) {
		v[i/2 + 0] = data[i + 0]
		v[i/2 + 1] = data[i + 1]
		v[i/2 + 2] = data[i + 2]
		vn[i/2 + 0] = data[i + 3]
		vn[i/2 + 1] = data[i + 4]
		vn[i/2 + 2] = data[i + 5]
	}

	geo.addAttribute('position', new THREE.BufferAttribute(v, 3));
	geo.addAttribute('normal', new THREE.BufferAttribute(vn, 3));

	var mesh = new THREE.Mesh(geo, material);

	mesh.frustumCulled = false; // otherwise threejs is aggresivly culling part of the mesh that should be visible, don't understand
	mesh.drawMode = THREE.TriangleStripDrawMode;

	return mesh;
};

/* loadMesh
 *
 * Given the results of a binary XHR 
 * load the mesh data in the 3D view.
 *
 * Required: 
 *   data: Raw array buffer data
 *   segid
 *   taskid
 *   segmentation
 * 
 * Returns: void
 */
function loadMesh (args) {
	args = args || {};

	if (!args.data || !args.data.byteLength || !_this.omni.task) {
		return;
	}

	var data = new Float32Array(args.data);
	var segid = args.segid;
	var tid = parseInt(args.taskid, 10);
	var segmentation = args.segmentation;

	if (!shouldDisplayMesh(segid, tid)) {
		return;
	}
	
	var material = configureMaterial(segid, tid);

	var mesh = _this.meshForInterleavedData(data, material);
	mesh.segid = segid;
	mesh.local = false;

	// add half voxel to server meshes to position them correctly with the tile
	var cubeSize = _this.omni.volume().segmentation.size;
	mesh.position.set(0.5/cubeSize.x, 0.5/cubeSize.y, 0.5/cubeSize.z);

	_view.addSegment(mesh, tid, segmentation);

	if (_this.omni.ready) {
		_view.render();
	}
}
	

function configureMaterial (segid, tid) {
	var shader = $.extend(true, {}, Shaders.idPacked);
	var u = shader.uniforms;
	u.taskid.value = tid;

	var rgb = _this.omni.segcolor[segid] || { r: 0, g: 0, b: 0 };

	if (_this.omni.task && (tid === _this.omni.task.id)) {
		u.color.value = ColorUtils.rgbToColor(rgb);

		var segcolor = _this.omni.segcolor[segid] || { a: 1 };
		u.opacity.value = segcolor.a;
	} 
	else {
		u.color.value = new THREE.Color(0xD2C83C);
		u.opacity.value = 1.0;
		u.clip = _view.clip;
	}

	u.segid.value = parseInt(segid, 10);
	u.mode.value = 0;
	u.center = _view.center;
	u.nMin.value = _this.omni.bounds.min.clone().add(new THREE.Vector3(3, 3, 3));
	u.nMax.value = _this.omni.bounds.max.clone().sub(new THREE.Vector3(3, 3, 3));

	return new THREE.ShaderMaterial(shader);
}

