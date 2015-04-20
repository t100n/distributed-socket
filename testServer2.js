var distributedSocket = require('./lib/distributed-socket');

distributedSocket.init({
	port: 999999,
	authenticate: function(username, password, next) {
		if(username == 't100n' || username == 'ojogador') {
			return next(null, { username: username, email: 'xpto@hotmail.com' });
		}//if
		
		return next({ statusCode: 403, message: 'Invalid account' });
	}
});

distributedSocket.on('login', function(socket, data) {
	console.log('login', socket.id);
});

distributedSocket.on('disconnect', function(socket) {
	console.log('disconnect', socket.id);
});

distributedSocket.on('connection', function(socket) {
	console.log('connection', socket.id);
	
	socket.on('message', function(data) {
		distributedSocket.send(data.to, 'message', data);
	});
});

distributedSocket.start();

