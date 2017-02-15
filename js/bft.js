function bft(start, a_map, node_count) { // start: index
    let hops = 0;  	// Frontier Levels
    let hop_map = new Map();
    let visited = new Uint8Array(node_count);

    visited[start] = 1;

    let frontier = [start];
    let next_frontier = [];

    while (frontier.length) {
        for (let node of frontier) {
            hop_map.set(node, hops);
            let neighbors = a_map.get(node);

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