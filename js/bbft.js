// bbft — "Back-Breadth-First Traversal": trace the path of a signal travelling
// *back toward the soma* from some starting vertex out on the dendritic arbor.
//
// `bft` (see bft.js) already labelled every vertex with its hop distance from the
// root. To make a signal that flows inward (a "backprop" event, fired either by a
// shift-click on the mesh or at random in the idle animation), we walk the graph
// from `start` but only step to neighbours whose hop distance is *lower* — i.e.
// strictly closer to the root. Following the descending-distance gradient yields
// the (approximately geodesic) route from the start vertex down to the soma.
//
// Every vertex on that route is flagged in `nodes_to_root`, an interleaved
// Float32Array shared with the GPU. It packs up to 4 independent backprop paths
// per buffer (one per vec4 component); `offset` (0–3) selects which component /
// path this call writes into, so several signals can animate at once without
// overwriting each other.
//
// Returns `max` — the start vertex's hop distance, i.e. how far the signal must
// travel. The caller uses it to seed that path's frontier so the lit band starts
// out at the tip and sweeps down to 0 at the soma.

export function bbft( start, a_map, h_map, node_count, nodes_to_root, offset ) { // start: vertex index
	const max = h_map[ start ];  // start's hop distance from the root = path length
	let hops = max;

	// Clear only *this* path's component (every 4th slot at `offset`) so the other
	// three paths sharing this buffer keep animating undisturbed.
	for ( let i = nodes_to_root.length - 4 + offset; i >= 0; i -= 4 ) {
		nodes_to_root[ i ] = 0;
	}

	const visited = new Uint8Array( node_count );
	visited[ start ] = 1;

	let frontier = [ start ];
	let next_frontier = [];

	// Descend exactly `max` levels — one per hop between the start and the root.
	while ( hops ) {
		for ( const node of frontier ) {
			nodes_to_root[ node * 4 + offset ] = 1; // mark this vertex as on-path
			const c_hop = h_map[ node ];
			const neighbors = a_map.get( node );

			for ( const neighbor of neighbors ) {
				if ( visited[ neighbor ] ) continue;
				if ( h_map[ neighbor ] > c_hop ) continue; // only step *toward* the root

				next_frontier.push( neighbor );
				visited[ neighbor ] = 1;
			}
		}

		frontier = next_frontier;
		next_frontier = [];
		hops --;
	}

	return max;
}
