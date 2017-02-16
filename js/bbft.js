function bbft(start, a_map, h_map, node_count, nodes_to_root, offset) { // start: index
    const max = h_map[start];  	// Start hop levels from root
    let hops = max;

    const startt = performance.now();
    const arrLength = nodes_to_root.length;
    for (let i = nodes_to_root.length - 4 + offset; i >= 0; i -= 4) {
        nodes_to_root[i] = 0;
    }
    console.log('clear time', performance.now() - startt, 'ms');

    const visited = new Uint8Array(node_count);

    visited[start] = 1; // Hashmap: 0 -> False; 1 -> True

    let frontier = [start];
    let next_frontier = [];

    while (hops) {
        for (let node of frontier) {
            nodes_to_root[node * 4 + offset] = 1;
            const c_hop = h_map[node];
            const neighbors = a_map.get(node);

            for (let neighbor of neighbors) {
                if (visited[neighbor]) {
                    continue;
                }
                if (h_map[neighbor] > c_hop) { //
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

    return max;
}