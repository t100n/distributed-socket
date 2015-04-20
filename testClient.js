var socket = require('socket.io-client')('http://localhost:99999');

var username = 't100n';
var password = '123';

socket.on('connect', function() {
	console.log('connected');
	
	socket.emit('login', {
		username: username,
		password: password
	});
});

socket.on('login', function(data) {
	console.log('login', data);
	
	var counter = 0;
	
	setInterval(function() {
		socket.emit('message', { to: 'ojogador', message: 'awesome stuff '+counter });
		counter++;
	}, 20000);
});

socket.on('message', function(data) {
	console.log('message ['+username+']', data);
});

socket.on('disconnect', function() {
	console.log('disconnected');
});
