function bbft(start, a_map, h_map, node_count) { // start: index
    let max = h_map.get(start);  	// Start hop levels from root
    let hops = max;
    
    let nodes_to_root = new Float32Array(node_count);
        nodes_to_root.fill(0);

    let visited = new Uint8Array(node_count);

    visited[start] = 1; // Hashmap: 0 -> False; 1 -> True

    let frontier = [start];
    let next_frontier = [];

    const bleed = 5; // Upstream allowance

    while (hops) {
        for (let node of frontier) {
            nodes_to_root[node] = 1;
            let neighbors = a_map.get(node);

            for (let neighbor of neighbors) {
                if (visited[neighbor]) {
                    continue;
                }
                if (h_map.get(neighbor) > (hops + bleed)) { //
                    continue;
                }
                
                next_frontier.push(neighbor);
                visited[neighbor] = 1;

            }
        }

        frontier = next_frontier;
        next_frontier = [];
        hops--;
    }

    return {
        backprop_buffer: nodes_to_root,
        b_max: max,
    }

}