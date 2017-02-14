function traverse(start, a_map) { // start: index
    let hops = 0;  	// Frontier Levels
    let hop_map = new Map();
    let visited = new Set([start]);
    let frontier = new Set([start]);
    let next_frontier = new Set();
    
    let totalTime = 0;
    
    while (frontier.size) {
        for (let node of frontier) {
            hop_map.set(node, hops);
            let neighbors = a_map.get(node);

            for (let neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    next_frontier.add(neighbor);
                    visited.add(node);
                }
            }
        }

        [frontier, next_frontier] = [next_frontier, frontier];
        next_frontier.clear(); // was the previous
        hops++;
    }

    return {
        map: hop_map,
        max: hops - 1
    };
}