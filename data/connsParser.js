// 2017 Alex Norton

'use strict';

let fs = require('fs');
let csv = require('csv');
let jsonfile = require('jsonfile');

let connsIn = fs.readFileSync('conns.csv', 'utf8');
let conns = connsIn.split('\n');

// Assumse conns -> conns ~ [14] ~ [0] -> length
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

new Promise(function(resolve, reject){
    resolve(parseConns(conns));
})
.then(function(data){
	let obj = {};
	function mapToObj(value, key) { 
		obj[key] = value;
		let file2 = "parsedData/conns-" + key + ".json";
		jsonfile.writeFile(file2, value, function (err) {
		  console.error(err);
		});
	}

	data.forEach(mapToObj);
	
	// Write all cell contacts to json
	let file = 'parsedData/conns.json';
	jsonfile.writeFile(file, obj, function (err) {
	  console.error(err);
	});
})
.catch(function(reason) {
	console.log('promise rejected for ' + reason);
});