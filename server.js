var jayson = require('jayson');
var nedb = require('nedb');
var core = require('./core');
var os = require( 'os' );

var local_rpc_port = core.random_port();
var local_ip_addr = core.get_local_ip_addr();
var local_admin_port = core.random_port();

// Debug
var debug = true;

var known_nodes = new core.nodes_list(true);

var server = jayson.server({
	find_file: function(name, metadata, callback) 
	{
		callback(null, []);
	},
	// discover envia un ping a (address, port) y reenvia el mensaje a los nodos conocidos,
	// con deep_max-1, si deep_max es 0, no reenvia el mensaje. El efecto es un mensaje que inunda la red
	// presentando al nuevo nodo de la red.
	// En resumen, discover presenta un nodo (address, port) a la red
	discover: function(origin_address, origin_port, deep_max, callback) 
	{
		// Envia ping de vuelta
		var client = jayson.client.http({
			port: origin_port,
			hostname: origin_address
		});
		
		console.log("llego discover");
		client.request('ping', [local_ip_addr, local_rpc_port], null, function(err) {
			if(!err && deep_max > 0) {
				// Si (origin_address, origin_port) esta vivo y deep_max > 0, reenvia el discover
				if(debug)
					console.log("server> forwarding discover from " + core.global_id(origin_address, origin_port));
				known_nodes.forward_discover(origin_address, origin_port, deep_max-1, local_ip_addr, local_rpc_port);
			}
			console.log("AAAA");
		});
		
		// No envia nada de vuelta
		callback();
	},
	ping: function(address, port, callback) 
	{
		known_nodes.touch(address, port);
		callback(null, 'pong');
  	},
	transfer_request: function(file_id, part, calback) 
	{
		
	},
	transfer_response: function(file_id, part, callback)
	{
		
	}
});

setInterval(function () {
	if(debug) {
		console.log("server> checking nodes (ping-pong)");
	}
	known_nodes.check_nodes(local_ip_addr, local_rpc_port);
	known_nodes.print_active_nodes_count();
}, core.ping_interval);

server.http().listen(local_rpc_port, function() {
	console.log("RPC running on port " + local_rpc_port);
	if(process.argv.length > 3) {
		// Se presenta a la red a través de un nodo
		var client = jayson.client.http({
			port: process.argv[3],
			hostname: process.argv[2]
		});
		// el null final indica que no respero una respuesta de esta RPC
		console.log("init> sending discover to " + core.global_id(process.argv[2], process.argv[3]));
		client.request('discover', [local_ip_addr, local_rpc_port, core.discover_deep_max], function(err) {
			if(err) {
				console.log("You must use a reachable node");
				throw err;
			}
		});
	}
});

