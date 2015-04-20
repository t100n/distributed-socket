# distributed-socket

Distribute your socket.io nodes without worries, using redis to send messages across nodes.

Install with:

    npm install lodash redis express socket.io socket.io-client

Example of using the library:

```js
	var distributedSocket = require('./lib/distributed-socket');
	
	distributedSocket.init({
		port: 99999,
		authorization: function(socket, next) {
			//console.log(socket);
	
			return next();
		},
		authenticate: function(username, password, next) {
			/* DO SOME DB QUERY */
			
			if(/* CHECK RESULT */) {
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
```

## Initialization Options

### port

Port for the socket.io to listen.

### reliable

Make sure every event is stored when the client isn't online.

### redisClient

Object 

### redisPub

### redisSub

### redisAuth

### io

### app

### server

### authorization

### authenticate

### handleConnections

### handleMessages
