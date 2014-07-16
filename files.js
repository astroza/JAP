var chokidar = require('chokidar');
var nedb = require('nedb');
var fs = require('fs');
var core = require('./core');
var crypto = require('crypto');
var path = require('path');

// Se encarga de todo lo q tiene que ver con el manejo de archivos completados e incompletos.
// Storage verificará (en el futuro) la integridad de los "chunk" de un archivo
function storage(dir) 
{
	this.dir = dir;
	
	try {
		fs.mkdirSync(dir);
		fs.mkdirSync(dir + '/share');
		fs.mkdirSync(dir + '/share/incomplete');
	} catch (err) {
		console.log("init> using previous storage");
	}
	
	this.db = new nedb({ filename: dir + '/storage.db', autoload: true });
	this.watcher = chokidar.watch(dir + '/share', {ignored: /([\/\\]incomplete|[\/\\]\.)/, persistent: true});
	var _this = this;
	this.watcher.on('add', function(file_path) 
	{
		var stat = fs.statSync(file_path);
		if(stat.isFile()) {
			var chunks_count = Math.ceil(stat.size / core.chunk_size);
			var file_id = crypto.createHash('sha256').update(path + Date.now).digest('base64');
			var chunks = [];
			for(i = 0; i < chunks_count; i++) {
				var remaining = stat.size - i*core.chunk_size;
				var chunk_size = core.chunk_size;
				if(remaining < core.chunk_size)
					chunk_size = remaining;
				var chunk = {present: true, size: chunk_size, offset: i*core.chunk_size};
				chunks.push(chunk);
			}
			var doc = {file_id: file_id, filename: path.basename(file_path), size: stat.size, completed: true, path: file_path, chunks_count: chunks_count, chunks: chunks};
			_this.db.findOne({path: file_path}, function(err, old_doc) {
				if(old_doc == null)
					_this.db.insert(doc);
			});
		}
	});
	
	this.watcher.on('remove', function(filename, size) {
		// TODO
	});
}

// TODO: soporte para que leechers puedan compartir sus pedazos, o sea, q se puedan usar archivos con completed: false
storage.prototype.find_by_id = function(file_id, callback)
{
	this.db.findOne({completed: true, file_id: file_id}, function(err, doc) {
		callback(doc);
	});
};

storage.prototype.find_by_name = function(regexp_str, callback) 
{
	var rexp = new RegExp(regexp_str);
	this.db.find({completed: true, filename: {$regex: rexp}}, function(err, docs) {
		callback(docs);
	});
};

storage.prototype.get_chunk = function(file_id, part, callback)
{
	this.db.findOne({file_id: file_id}, function(err, doc) {
		if(doc != null) {
			chunk = doc.chunks[part];
			var buffer = new Buffer(chunk.size);
			var fd = fs.openSync(doc.path, 'r');
			fs.readSync(fd, buffer, 0, chunk.size, chunk.offset);
			callback(buffer);
		} else
			callback(null);
	});
};

storage.prototype.alloc_space = function(file_id, filename, size, chunks, ready_callback)
{
	// TODO: Marcar chunks no presentes, (actualmente solo hago una copia desde la semilla)
	var doc = {file_id: file_id, filename: filename, size: size, completed: false, path: this.dir + '/share/incomplete/' + filename, chunks_count: chunks.length, chunks: chunks};
	this.db.insert(doc, function(err, new_doc) {
		var fd = fs.openSync(doc.path, 'w');
		console.log("DEBUG: " + fd + " " + size)
		fs.ftruncateSync(fd, size-1);
		fs.writeSync(fd, new Buffer(1), 0, 1, size-1);
		ready_callback(fd);
	});
};

storage.prototype.promote = function(file_id)
{
	var _this = this;
	this.db.findOne({file_id: file_id}, function(err, doc) {
		if(doc) {
			fs.renameSync(doc.path, _this.dir + '/share/' + doc.filename);
			// _this.db.update();
		}
	});
};

module.exports.storage = storage;