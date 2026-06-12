// CTMLoader (modern) — a thin ES-module wrapper around the vanilla OpenCTM
// JavaScript decoder.
//
// Background:
//   The meshes in /cells are stored as OpenCTM (.ctm) files — a compact,
//   LZMA-compressed triangle-mesh format (http://openctm.sourceforge.net/).
//   The original repo relied on three.js r84's bundled `THREE.CTMLoader`, which
//   was removed from three.js long ago. The actual *decoder* (js/ctm/ctm.js +
//   js/ctm/lzma.js by Juan Mellado) is plain, framework-agnostic JavaScript and
//   still works fine — it just exposes a global `CTM` object. So instead of a
//   heavyweight loader we keep those two decoders as classic <script>s and wrap
//   their output in a modern THREE.BufferGeometry here.
//
// Usage:
//   <script src="../js/ctm/lzma.js"></script>   <!-- defines global LZMA -->
//   <script src="../js/ctm/ctm.js"></script>    <!-- defines global CTM  -->
//   import { CTMLoader } from '../js/loaders/CTMLoader.js';
//   const geometry = await new CTMLoader().load('../cells/10010.ctm');

import { BufferGeometry, BufferAttribute } from 'three';

export class CTMLoader {
	// Fetch + decode a .ctm file. Returns a Promise<THREE.BufferGeometry>.
	async load( url ) {
		const response = await fetch( url );
		if ( ! response.ok ) {
			throw new Error( `CTMLoader: failed to fetch "${url}" (HTTP ${response.status})` );
		}
		const bytes = new Uint8Array( await response.arrayBuffer() );
		return this.parse( bytes );
	}

	// Decode already-fetched CTM bytes into a BufferGeometry.
	parse( bytes ) {
		const CTM = globalThis.CTM;
		if ( ! CTM ) {
			throw new Error(
				'CTMLoader: global "CTM" decoder not found. Load js/ctm/lzma.js and ' +
				'js/ctm/ctm.js as classic <script>s before importing this module.'
			);
		}

		// CTM.Stream is a little-endian cursor over the byte buffer; CTM.File
		// reads the header and decompresses the body (indices / vertices / normals).
		const stream = new CTM.Stream( bytes );
		stream.offset = 0;
		const file = new CTM.File( stream );

		const { indices, vertices, normals } = file.body;

		const geometry = new BufferGeometry();
		// indices is a Uint32Array → requires 32-bit indices (standard in WebGL2).
		geometry.setIndex( new BufferAttribute( indices, 1 ) );
		geometry.setAttribute( 'position', new BufferAttribute( vertices, 3 ) );

		if ( normals !== undefined ) {
			geometry.setAttribute( 'normal', new BufferAttribute( normals, 3 ) );
		} else {
			// The signal-propagation shaders rely on per-vertex normals for shading.
			geometry.computeVertexNormals();
		}

		return geometry;
	}
}
