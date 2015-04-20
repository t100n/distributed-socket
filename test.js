var DistributedSocket = require('./lib/distributed-socket')({
	port: 9999,
	onConnection: function(socket) {
		console.log('connection', socket.id);
	}
});

