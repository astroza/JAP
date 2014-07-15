var nedb = require('nedb');
var jayson = require('jayson');
var os = require('os');
// var ping_interval = 30*1000; // ms
var ping_interval = 5*1000;

function random_port()
{
	return Math.floor(Math.random() * (65535 - 1024) + 65535);
}

function global_id(address, port) 
{
	return address + '.' + port;
}

function nodes_list(debug) 
{
	this.debug = debug;
    this.db = new nedb({ filename: 'nodes.db', autoload: true });
}

nodes_list.prototype.touch = function(address, port) 
{
	var db = this.db;
	var debug = this.debug;
	db.findOne({address: address, port: port}, function (err, doc) {
		if(doc == null) {
			doc = {address: address, port: port, timestamp: Date.now()};
			db.insert(doc, function(err, num) {
				if(debug)
					console.log("nodes_list> " + global_id(address, port) + " was added");
			});
		} else {
			db.update({_id: doc._id}, { $set: {timestamp: Date.now()}}, function(err, num) {
				if(debug)
					console.log("nodes_list> " + global_id(address, port) + " was updated (timestamp)");
			});
		}
	});
};

nodes_list.prototype.check_nodes = function(local_ip_addr, local_rpc_port) 
{
	var db = this.db;
	var debug = this.debug;
	var _this = this;
	// Los nodos que tienen como timestamp un valor menor que el tiempo actual menos ping_interval,
	// necesitan ser verificados
	db.find({timestamp: {$lt: Date.now() - ping_interval}}, function (err, docs) {
		for(i = 0; i < docs.length; i++) {
			var node = docs[i];
			// No hace ping a si mismo
			if(node.address == local_ip_addr && node.port == local_rpc_port)
				continue;
				
			if(debug) {
				console.log("check_nodes> pinging to " + global_id(node.address, node.port));
			}
			var client = jayson.client.http({
				port: node.port,
				hostname: node.address
			});
			client.request('ping', [local_ip_addr, local_rpc_port], function(err, error, response) {
				if(err) {
					// Si no pudo enviar el ping, el nodo esta muerto y es eliminado
					db.remove({ _id: node._id });
					if(debug) {
						console.log("check_nodes> " + global_id(node.address, node.port) + " was removed (no ping response)");
					}
				} else {
					if(debug) {
						console.log("check_nodes> " + response + " was received from " + global_id(node.address, node.port));
					}
					_this.touch(node.address, node.port);
				}
			});
		}
	});
};

nodes_list.prototype.forward_discover = function(origin_address, origin_port, deep_max, local_ip_addr, local_rpc_port) 
{
	var debug = this.debug;
	this.db.find({}, function (err, docs) {
		for(i = 0; i < docs.length; i++) {
			var node = docs[i];
			// No reenvia a si mismo
			if(node.address == local_ip_addr && node.port == local_rpc_port)
				continue;
				
			var client = jayson.client.http({
				port: node.port,
				hostname: node.address
			});
			// Finalmente, reenvia el discover
			client.request('discover', [origin_address, origin_port, deep_max], function(err) {
				if(!err && debug) {
					console.log("forward_discover> discover was sent to " + global_id(origin_address, origin_port));
				}
			});
		}
	});
}

nodes_list.prototype.print_active_nodes_count = function() {
	this.db.count({}, function (err, count) {
		console.log("check_nodes> active nodes count: " + count);
	});
};

// Con esto obtengo la dirección IPv4 propia en la red local
function get_local_ip_addr() 
{
	var ifaces = os.networkInterfaces();
	for(name in ifaces) {
		iface = ifaces[name];
		for(i = 0; i < iface.length; i++) {
			conf = iface[i];
			if((conf.family == 'IPv4' || conf.family == 'ipv4') && conf.internal == false)
				return conf.address;
		}
	}
	return null;
}


module.exports.random_port = random_port;
module.exports.nodes_list = nodes_list;

// Configuración
module.exports.chunk_size = 1024*128; // Cada pedazo de un archivo es de 128 kb
module.exports.ping_interval = ping_interval;
module.exports.global_id = global_id;
module.exports.get_local_ip_addr = get_local_ip_addr;
module.exports.discover_deep_max = 2;