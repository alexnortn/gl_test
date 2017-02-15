function bft(start, a_map, node_count) { // start: index
    let hops = 0;  	// Frontier Levels
    const visited = new Uint8Array(node_count);
    const hop_map = new Float32Array(node_count);

    hop_map.fill(-1000); // for discontinuity

    visited[start] = 1; // Hashmap: 0 -> False; 1 -> True

    let frontier = [start];
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
        max: hops - 1
    };
}
