// bft — "Breadth-First Traversal" of a mesh's vertex graph.
//
// Given a root vertex (for a neuron mesh this is a point near the soma / cell
// body) and an adjacency map, this computes the BFS *hop distance* from the root
// to every other vertex: root = 0, its neighbours = 1, their neighbours = 2, …
//
// That per-vertex integer becomes the `a_hops` shader attribute. The animation
// then sweeps a moving "frontier" value across this distance field, so a band of
// colour appears to travel outward from (or back toward) the soma along the
// branching arbor — a stand-in for an action potential propagating through the
// neuron.
//
// Returns { map, max }:
//   map — Float32Array(node_count) of hop distances; unreached vertices stay -1000
//         so the shader can treat them as "disconnected" and never light them up.
//   max — the largest hop distance reached (graph eccentricity from the root).

export function bft( start, a_map, node_count ) { // start: vertex index
	let hops = 0;                                  // current BFS level / frontier depth
	const visited = new Uint8Array( node_count );  // 0 = unseen, 1 = enqueued
	const hop_map = new Float32Array( node_count );

	hop_map.fill( -1000 ); // sentinel for vertices the BFS never reaches (discontinuity)

	visited[ start ] = 1;

	let frontier = [ start ];   // vertices at the current depth
	let next_frontier = [];     // vertices discovered at depth+1

	while ( frontier.length ) {
		for ( const node of frontier ) {
			hop_map[ node ] = hops;
			const neighbors = a_map.get( node );

			for ( const neighbor of neighbors ) {
				if ( ! visited[ neighbor ] ) {
					next_frontier.push( neighbor );
					visited[ neighbor ] = 1;
				}
			}
		}

		frontier = next_frontier;
		next_frontier = [];
		hops ++;
	}

	return {
		map: hop_map,
		max: hops - 1,
	};
}
