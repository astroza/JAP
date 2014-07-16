// Para efecto didactico (flojera), solo descargara de una fuente secuencialmente. Puede mejorar y mucho.
function download_state(file_id)
{
	this.file_id = file_id;
	this.current_part = 0;
	this.current_part_timer = null;
}

download_state.prototype.start = function() 
{
	
}

function downloader() 
{
	this.downloading = [];
	
}