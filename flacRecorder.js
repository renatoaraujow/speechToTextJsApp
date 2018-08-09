var audio_context = null;
var stream = null;
var recording = false;
var encoder = null;
var input = null;
var node = null;
var api_url = 'http://localhost/speechToTextPhpApi/';

function startRecording(e) {
	if (recording) return;

	console.log('start recording');//DEBUG
	encoder = new Worker('encoder.js');
	encoder.onmessage = function(e) {
		if (e.data.cmd == 'end') {
			sendRequest(e.data.buf);
			encoder.terminate();
			encoder = null;
		} else if (e.data.cmd == 'debug') {
			console.log('e.data :', e.data);
		} else {
			console.error('Unknown event from encoder (WebWorker): "' + e.data.cmd + '"!');
		}
	};

	if(navigator.webkitGetUserMedia)
		navigator.webkitGetUserMedia({ video: false, audio: true }, gotUserMedia, userMediaFailed);
	else if(navigator.mozGetUserMedia)
		navigator.mozGetUserMedia({ video: false, audio: true }, gotUserMedia, userMediaFailed);
	else
		navigator.getUserMedia({ video: false, audio: true }, gotUserMedia, userMediaFailed);
};

function userMediaFailed(code) {
	console.log('grabbing microphone failed: ' + code);
};

function gotUserMedia(localMediaStream) {
	recording = true;

	console.log('success grabbing microphone');
	stream = localMediaStream;
	
	var audio_context;
	if(typeof webkitAudioContext !== 'undefined') {
		audio_context = new webkitAudioContext;
	} else if(typeof AudioContext !== 'undefined') {
		audio_context = new AudioContext;
	} else {
		console.error('JavaScript execution environment (Browser) does not support AudioContext interface.');
		alert('Could not start recording audio:\n Web Audio is not supported by your browser!');
		return;
	}
	audio_context = audio_context;
	input = audio_context.createMediaStreamSource(stream);
	
	if(input.context.createJavaScriptNode)
		node = input.context.createJavaScriptNode(4096, 1, 1);
	else if(input.context.createScriptProcessor)
		node = input.context.createScriptProcessor(4096, 1, 1);
	else
		console.error('Could not create audio node for JavaScript based Audio Processing.');
	
	console.log('initializing');//DEBUG
	encoder.postMessage({ cmd: 'init' });

	node.onaudioprocess = function(e) {
		if (!recording) return;
		var channelLeft = e.inputBuffer.getChannelData(0);
		// var channelRight = e.inputBuffer.getChannelData(1);
		encoder.postMessage({ cmd: 'encode', buf: channelLeft});
	};

	input.connect(node);
	node.connect(audio_context.destination);
};

function stopRecording() {
	if (!recording) return;

	console.log('stop recording');
	var tracks = stream.getAudioTracks()
	for(var i = tracks.length - 1; i >= 0; --i){
		tracks[i].stop();
	}
	recording = false;
	encoder.postMessage({ cmd: 'finish' });

	input.disconnect();
	node.disconnect();
	input = node = null;
};
	
function sendRequest(blob) {
	function ajaxSuccess() {
		var result = this.responseText;
		console.log("AJAXSubmit - Success!"); //DEBUG
		console.log(result);
		document.getElementById('result').innerHTML = result;

		try {
			result = JSON.parse(result);
			//format the result
			result = JSON.stringify(result, null, 2);
		} catch (exc) {
			console.warn('Could not parse result into JSON object: "' + result + '"');
		}
	}

	var data;
	// use FileReader to convert Blob to base64 encoded data-URL
	var reader = new window.FileReader();
	reader.readAsDataURL(blob);
	reader.onloadend = function() {
		//only use base64-encoded data, i.e. remove meta-data from beginning:
		var audioData = reader.result.replace(/^data:audio\/flac;base64,/,'');
		data = {
			audio: {
				content: audioData
			}
		};
		
		var ajaxReq = new XMLHttpRequest();
		ajaxReq.onload = ajaxSuccess;
		ajaxReq.open("post", api_url, true);
		ajaxReq.setRequestHeader("Content-Type", "application/json");
		ajaxReq.send(JSON.stringify(data));
	};
};
