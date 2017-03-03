// 2017 Alex Norton
// Neural reconstruction data (e2198) parser (csv -> json)

// * Run from Node

'use strict';

const fs = require('fs');
const jsonfile = require('jsonfile');

// Load contacts
const connsIn = fs.readFileSync('../conns.csv', 'utf8');
const conns = connsIn.split('\n');

const transform = { "x": 16.5, "y": 16.5, "z": 23 };

// Museum scaling factor
transform.x *= 2;
transform.y *= 2;
transform.z *= 2;

// Assumse conns -> conns ~ [14] ~ [0] -> length
// Returns Map type 
function parseConns(conns) {
	let obj;
	let map = new Map();

	// Parse array(String) -> Array(Array)
	conns = conns.map((item) => item.split(','));

	// Build contact element
	conns[0].forEach((item, index) => { 
		obj = {
			"id": 	 parseInt(conns[1][index]),
			"area": {
				"x": parseInt(conns[2][index])  * transform.x,
				"y": parseInt(conns[3][index])  * transform.y,
				"z": parseInt(conns[4][index])  * transform.z
			},
			"centroid": {
				"x": parseInt(conns[5][index])  * transform.x,
				"y": parseInt(conns[6][index])  * transform.y,
				"z": parseInt(conns[7][index])  * transform.z
			},
			"post": {
				"x": parseInt(conns[8][index])  * transform.x,
				"y": parseInt(conns[9][index])  * transform.y,
				"z": parseInt(conns[10][index]) * transform.z
			},
			"pre": {
				"x": parseInt(conns[11][index]) * transform.x,
				"y": parseInt(conns[12][index]) * transform.y,
				"z": parseInt(conns[13][index]) * transform.z
			}
		};

		item = parseInt(item);

		// Check for duplicates
		if (map.has(item)) {
			let temp = map.get(item);
				temp.push(obj);
			map.set(item, temp);
		}
		else {
			map.set(item, [obj]);
		}
	});

	return map;
}


// Output cell contacts -> json
new Promise(function(resolve, reject){
    resolve(parseConns(conns)); // parse conns.csv (expect Map)
})
.then(function(data){
	const dir = './meshes/';
	let map = new Map();
	let obj = {};

	let total = 0;
	let has = 0;
	let missing = 0;
	
	// Load mesh list
	fs.readdirSync(dir).forEach( (filename) => {
		filename = filename.replace(".ctm", "");
		filename = parseInt(filename);
		map.set(filename, true);
	});

	// Filter output by mesh list
	data.forEach((value, key) => {
		total++;
		if (map.has(parseInt(key))) {
			obj[key] = value;
			has++;
		}
		else {
			missing++;
		}
	});

	console.log(
		"total:",   total, 
		"has:",     has, 
		"missing:", missing);

	return obj;

})
.then(function(data) {

	let obj = [];

	// Write each cell contacts to json
	Object.entries(data).forEach(([cellName, cell]) => {
		obj.push(cellName);
	});

	// Write cell list to json
	let file = '../parsedDataTransform4/conns-list.json'; 
	jsonfile.writeFile(file, obj, (error) => { if (error) console.error(err) }); 

	return data;

})
.then(function(data) {
	let file;
	
	// Write all cell + contacts to json
	file = '../parsedDataTransform4/conns.json'; 
	jsonfile.writeFile(file, data, (error) => { if (error) console.error(err) }); 

	// Get cell by id, get contacts with specific cell
	// contacts = conns['cell1'].filter((el) => { if (el.id === 'cell2') return el });

	return data;

})
.then(function(data) {
	let file, obj;
	let map = new Map();
	// Write each cell contacts to json
	Object.entries(data).forEach(([cellName, cell]) => {
		map.clear();
		cell.forEach((contact) => {
			if (map.has(contact.id)) {
				let temp = map.get(contact.id);
					temp.push(contact);
				map.set(contact.id, temp);
			}
			else {
				map.set(contact.id, [contact]);
			}
		});
		
		obj = {};
		map.forEach((value, key) => { value.forEach((v) => delete v["id"]); obj[key] = value }); // Remove extraneous "id" key, create output object

		file = "../parsedDataTransform4/conns-" + cellName + ".json"; // Individual cell export
		jsonfile.writeFile(file, obj, (error) => { if (error) console.error(err) });	    
	});
})
.catch(function(reason) {
	console.log('promise rejected for ' + reason);
});
