// Para efecto didactico (flojera), solo descargara de una fuente secuencialmente. Puede mejorar y mucho.
var fs = require('fs');
var jayson = require('jayson');

var chunk_timeout = 240 * 1000;

function download_state(file_id)
{
	this.file_id = file_id;
	this.started = false;
	this.seeds = [];
}

download_state.prototype.start = function(downloader, progress_callback) 
{
	if(!this.started && this.seeds.length > 0) {
		this.started = true;
		var _this = this;
		downloader.storage.alloc_space(this.file_id, this.seeds[0].desc.filename, this.seeds[0].desc.size, this.seeds[0].desc.chunks, function(fd) {
			downloader.transfer_chunk(fd, _this.seeds[0], 0, progress_callback);
		});
	}
}

function downloader(storage) 
{
	this.downloading = {};
	this.storage = storage;
}

downloader.prototype.transfer_chunk = function(fd, seed, part, progress_callback)
{
	var _this = this;
	var client = jayson.client.http({
		port: seed.port,
		hostname: seed.address
	});
	
	client.request('transfer_request', [seed.desc.file_id, part], function(err, error, buffer) {
		if(err || error) {
			console.log("transfer_chunk> download have failed :-/");
		} else {
			progress_callback(seed.desc.filename, part);
			fs.writeSync(fd, new Buffer(buffer, 'base64'), 0, seed.desc.chunks[part].size, seed.desc.chunks[part].offset);
			if(part + 1 < seed.desc.chunks.length) {
				_this.transfer_chunk(fd, seed, part + 1, progress_callback);
			} else {
				fs.closeSync(fd);
				_this.storage.promote(seed.desc.file_id);
				
			}
		}
	});
}

downloader.prototype.add = function(file_id) 
{
	var state = new download_state(file_id);
	this.downloading[file_id] = state;
	return state;
};

downloader.prototype.add_seed = function(seed) 
{
	var state = this.downloading[seed.desc.file_id];
	if(state) {
		state.seeds.push(seed);
	}
};

downloader.prototype.start = function(file_id, progress_callback) 
{
	var state = this.downloading[file_id];
	if(state) {
		state.start(this, progress_callback);
	}
};

module.exports = downloader;