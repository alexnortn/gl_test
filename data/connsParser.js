// 2017 Alex Norton

'use strict';

let fs = require('fs');
let csv = require('csv');
let jsonfile = require('jsonfile');

let connsIn = fs.readFileSync('conns.csv', 'utf8');
let conns = connsIn.split('\n');

// Assumse conns -> conns ~ [14] ~ [0] -> length
// Returns Map type 
function parseConns(conns) {
	let temp = [];
	let map = new Map();

	// Parse array(String) -> Array(Array)
	conns = conns.map((item) => item.split(','));

	conns[0].forEach((item, index) => { 
		temp = {
			"id":    conns[1][index],
			"area": {
				"x": parseInt(conns[2][index]),
				"y": parseInt(conns[3][index]),
				"z": parseInt(conns[4][index])
			},
			"centroid": {
				"x": parseInt(conns[5][index]),
				"y": parseInt(conns[6][index]),
				"z": parseInt(conns[7][index])
			},
			"post": {
				"x": parseInt(conns[8][index]),
				"y": parseInt(conns[9][index]),
				"z": parseInt(conns[10][index])
			},
			"pre": {
				"x": parseInt(conns[11][index]),
				"y": parseInt(conns[12][index]),
				"z": parseInt(conns[13][index])
			}
		};

		if (map.has(item)) {
			let mapTemp = map.get(item);
				mapTemp.push(temp);
			map.set(item, mapTemp);
		}
		else {
			map.set(item, [temp]);
		}

	});

	return map;
}

// Output cell contacts -> json
new Promise(function(resolve, reject){
    resolve(parseConns(conns)); // parse conns.csv (expect Map)
})
.then(function(data){
	let obj = {};
	let file;
	function mapToObj(value, key) { 
		obj[key] = value; // Set up object for complete export
		file = "parsedData/conns-" + key + ".json"; // Individual cell export
		jsonfile.writeFile(file, value, (error) => { if (error) console.error(err) });
	}

	data.forEach(mapToObj); // Iterate through conns Map
	
	// Write all cell contacts to json
	file = 'parsedData/conns.json'; 
	jsonfile.writeFile(file, obj, (error) => { if (error) console.error(err) });
})
.catch(function(reason) {
	console.log('promise rejected for ' + reason);
});
