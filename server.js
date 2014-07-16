var jayson = require('jayson');
var nedb = require('nedb');
var core = require('./core');
var files = require('./files');
var os = require( 'os' );
var fs = require('fs');

var local_rpc_port = core.random_port();
var local_ip_addr = core.get_local_ip_addr();
var local_admin_port = core.random_port();

// Admin
var ejs = require('ejs');
var admin_app = require('express')();
var admin_server = require('http').Server(admin_app);
var io = require('socket.io')(admin_server);

admin_server.listen(local_admin_port);
console.log("init> Web admin running on http://localhost:" + local_admin_port);

admin_app.get('/', function (req, res) {
	html = ejs.render(fs.readFileSync(__dirname + '/admin/index.html.ejs', 'utf8'), {socket_io_port: local_admin_port, ip_address: local_ip_addr, rpc_port: local_rpc_port});
	res.send(html);
});

io.on('connection', function (socket) {
  socket.emit('find', { hello: 'world' });
});

// Debug
var debug = true;

var known_nodes = new core.nodes_list(debug);
var storage = new files.storage('storage');

function send_find_response(address, port, docs)
{
	var client = jayson.client.http({
		port: port,
		hostname: address
	});
	
	client.request('find_response', [docs], null, function(err) {
		if(debug && err)
			console.log("server> can't send find response to " + core.global_id(address, port));
	});
}

function create_msg_id()
{
	return core.create_msg_id(local_ip_addr, local_rpc_port);
}

function announce_node(address, port)
{
	var client = jayson.client.http({
		port: port,
		hostname: address
	});
	// el null final indica que no respero una respuesta de esta RPC
	console.log("init> sending discover to " + core.global_id(address, port));
	client.request('discover', [local_ip_addr, local_rpc_port, core.discover_deep_max, create_msg_id()], function(err) {
		if(err) {
			console.log("init> you must use a reachable node");
			throw err;
		}
	});
}

function find_by_name(name) 
{
	var msg_id = create_msg_id();
	known_nodes.forward(local_ip_addr, local_rpc_port, msg_id, function(client) {
		// Finalmente, reenvia el discover
		client.request('find_by_name', [name, local_ip_addr, local_rpc_port, core.find_deep_max, msg_id], function(err) {
			if(err && debug) {
				console.log("server> can't send find_by_name");
			}
		});
	});
}

admin_app.get('/find', function (req, res) 
{
	if(req.query.q) {
		find_by_name(req.query.q);
		res.send("Finding: " + req.query.q);
	} else
		res.send("Please use ?q=<something>");
});

var server = jayson.server({
	find_by_name: function(name, origin_address, origin_port, deep_max, msg_id, callback) 
	{
		// reenvio busca a vecinos
		known_nodes.forward(local_ip_addr, local_rpc_port, msg_id, function(client) {
			// Finalmente, reenvia el discover
			client.request('find_by_name', [name, origin_address, origin_port, deep_max-1, msg_id], function(err) {
				if(err && debug) {
					console.log("forward_discover> can't send find_by_name");
				}
			});
		});
		// busco localmente y envio la respuesta al origen
		storage.find_by_name(name, function(docs) {
			if(docs != null)
				send_find_response(origin_address, origin_port, docs);
		});
		callback();
	},
	
	find_by_id: function(id, origin_address, origin_port, deep_max, msg_id, callback) 
	{
		// reenvio busca a vecinos
		known_nodes.forward(local_ip_addr, local_rpc_port, msg_id, function(client) {
			// Finalmente, reenvia el discover
			client.request('find_by_id', [id, origin_address, origin_port, deep_max-1, msg_id], function(err) {
				if(err && debug) {
					console.log("forward_discover> can't send find_by_id");
				}
			});
		});
		// busco localmente y envio la respuesta al origen
		storage.find_by_id(id, function(doc) {
			if(doc != null)
				send_find_response(origin_address, origin_port, doc);
		});
		callback();
	},
	
	find_response: function(response, callback)
	{
		if(Array.isArray(response)) {
			// Respuesta de una busqueda hecha por el usuario
			// publico en el canal 'find response' la respuesta que llego
			console.log("RET="+io.sockets.emit('find', response));
		} else {
			// Respuesta de busqueda hecha por el sistema para un archivo en especifico
		}
		console.log(response);
		callback();
	},
	// discover envia un ping a (address, port) y reenvia el mensaje a los nodos conocidos,
	// con deep_max-1, si deep_max es 0, no reenvia el mensaje. El efecto es un mensaje que inunda la red
	// presentando al nuevo nodo de la red.
	// En resumen, discover presenta un nodo (address, port) a la red
	discover: function(origin_address, origin_port, deep_max, msg_id, callback) 
	{
		// Envia ping de vuelta
		var client = jayson.client.http({
			port: origin_port,
			hostname: origin_address
		});
		
		client.request('ping', [local_ip_addr, local_rpc_port], null, function(err) {
			if(!err && deep_max > 0) {
				// Si (origin_address, origin_port) esta vivo y deep_max > 0, reenvia el discover
				if(debug)
					console.log("server> forwarding discover from " + core.global_id(origin_address, origin_port));
					
				known_nodes.forward(local_ip_addr, local_rpc_port, msg_id, function(client) {
					// Finalmente, reenvia el discover
					client.request('discover', [origin_address, origin_port, deep_max-1, msg_id], function(err) {
						if(!err && debug) {
							console.log("forward_discover> discover was sent to " + global_id(origin_address, origin_port));
						}
					});
				});
			}
		});
		
		// No envia nada de vuelta
		callback();
	},
	ping: function(address, port, callback) 
	{
		known_nodes.touch(address, port);
		callback(null, 'pong');
  	},
	transfer_request: function(file_id, part, callback) 
	{
		storage.get_chunk(file_id, part, function(buffer) {
			if(buffer != null)
				callback(null, buffer);
			else
				callback('not found', null);
		});
	}
});

setInterval(function () {
	if(debug) {
		console.log("server> checking nodes (ping-pong)");
	}
	known_nodes.check_nodes(local_ip_addr, local_rpc_port);
}, core.ping_interval);

setInterval(function () {
	known_nodes.print_active_nodes_count();
}, core.ping_interval*3);

server.http().listen(local_rpc_port, function() {
	console.log("init> RPC running on port " + local_rpc_port);
	if(process.argv.length > 3) {
		// Se presenta a la red a través de un nodo
		announce_node(process.argv[2], process.argv[3]);
	}
});

