class MCWorker {
    constructor() {
        this.worker = new Worker('../js/marching_cubes_worker.js');

        let messageCount = 0;

        let callbacks = new Map();

        this.worker.onmessage = (e) => {
            if (callbacks.has(e.data.id)) {
                callbacks.get(e.data.id)(e.data.msg);
                callbacks.delete(e.data.id);
            }
        }

        this.worker.onerror = (e) => {
            console.error(e);
        }

        let sendMessageCallback = (type, msg, transferrables, callback) => {
            callbacks.set(messageCount, callback);

            this.worker.postMessage({
                id: messageCount,
                type: type,
                msg: msg
            }, transferrables);

            messageCount++;
        }

        this._sendMessage = (type, msg, transferrables) => {
            return new Promise((f, r) => {
                sendMessageCallback(type, msg, transferrables, f);
            });
        }
    }

    loadVolume(volume, bbox = null) {
        return this._sendMessage('volume', {
            segmentation_buffer: volume.buffer,
            bbox: bbox
        }, [volume.buffer]).then(({segmentation_buffer}) => {
            return new volume.constructor(segmentation_buffer)
        });
    }

    generateMesh(id) {
        return this._sendMessage('mesh', {
            segId: id
        }).then(({triangles, positions, normals}) => {
            return {
                triangles: new Uint32Array(triangles),
                positions: new Float32Array(positions),
                normals: new Float32Array(normals)
            };
        });
    }
}