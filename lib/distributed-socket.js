/**
 * Module dependencies
 */

var 	_ = require('lodash'),
	events = require('events')
	;

/**
 * Instance of distributed-socket
 */

var DistributedSocket = function() {
	this.clients = {};
	this.port = 3000;
	this.reliable = true;
};

DistributedSocket.prototype = new events.EventEmitter;

/**
 * Init this instance
 * Options:
 * 	port 			Integer
 * 	reliable 		Boolean
 * 	redisClient 		Client
 * 	redisPub 		Client
 * 	redisSub 		Client
 * 	redisAuth 		String
 * 	io 			Socket.io object
 * 	app 			Expressjs object
 * 	server 			HTTP Server
 * 	authorization 		Function
 * 	authenticate 		Function
 * 	handleConnections 	Function
 * 	handleMessages 		Function
 */
DistributedSocket.prototype.init = function(options) {
	var that = this;
	
	this.options = _.defaults(options || {}, this.options);
	
	if(this.options.port) {
		this.port = this.options.port;
	}//else
	
	if(this.options.reliable) {
		this.reliable = this.options.reliable;
	}//else
	
	if(!this.options.redisClient) {
		var redis = require("redis");
		this.redisClient = redis.createClient();
		
		this.redisClient.on("error", function (err) {
			console.log("Error " + err);
		});
	}//if
	else {
		this.redisClient = this.options.redisClient;
	}//else
	
	if(!this.options.redisSub) {
		var redis = require("redis");
		this.redisSub = redis.createClient();
		
		this.redisSub.on("error", function (err) {
			console.log("Error " + err);
		});
	}//if
	else {
		this.redisSub = this.options.redisSub;
	}//else
	
	if(!this.options.redisPub) {
		var redis = require("redis");
		this.redisPub = redis.createClient();
		
		this.redisPub.on("error", function (err) {
			console.log("Error " + err);
		});
	}//if
	else {
		this.redisPub = this.options.redisPub;
	}//else
	
	if(this.options.redisAuth) {
		this.redisAuth = this.options.redisAuth;
		
		this.redisClient.auth(this.redisAuth, function(err) {});
		this.redisPub.auth(this.redisAuth, function(err) {});
		this.redisSub.auth(this.redisAuth, function(err) {});
	}//if
	
	if(this.options.authenticate) {
		this.authenticate = this.options.authenticate;
	}//if
	else {
		this.authenticate = function(username, password, next) {
			// Dummy auth function
			return next(null);
		};
	}//else
	
	if(this.options.handleConnections) {
		this.handleConnections = this.options.handleConnections;
	}//if
	
	if(this.options.handleMessages) {
		this.handleMessages = this.options.handleMessages;
	}//if
};

/**
 * Start the server and handle connections
 */
DistributedSocket.prototype.start = function() {
	var that = this;
	
	if(!this.options.io) {
		if(!this.options.app) {
			this.app = require('express')();
		}//if
		else {
			this.app = this.options.app;
		}//else
		
		if(!this.options.server) {
			this.server = require('http').createServer(this.app);
		}//if
		else {
			this.server = this.options.server;
		}//else
		
		this.io = require('socket.io')(this.server);
		this.server.listen(this.port);
	}//if
	else {
		this.io = this.options.io;
	}//else
	
	if(this.options.authorization) {
		this.authorization = this.options.authorization;
		
		this.io.use(function (socket, next) {
			// make sure the handshake data looks good
			that.authorization(socket, function(err) {
				next(err);
			});
		});
	}//if
	
	// Start handling connections from clients
	this.handleConnections();
	
	// Start handling messages from other servers
	this.handleMessages();
};

/**
 * Handle messages from other servers.
 * Try to send any messages in the queue to the corresponding client.
 */
DistributedSocket.prototype.handleMessages = function() {
	var that = this;
	
	var consume = function(list, message, next) {
		that.redisClient.lpop(list, function(err, res) {
			if(!err && res) {
				var data = JSON.parse(res);
				
				if(data) {
					that.send(data.room, data.event, data.data);
					
					return process.nextTick(function() {
						consume(list, message, next);
					});
				}//if
			}//if
			
			return process.nextTick(function() {
				next();
			});
		});
	};
	
	this.redisSub.on('message', function(channel, message) {
		if(!that.reliable) {
			var data = JSON.parse(message);
			
			that.send(data.room, data.event, data.data);
		}//if
		else {
			consume(channel, message, function() {
			});
		}//else
	});
};

/**
 * Handle client connections.
 */
DistributedSocket.prototype.handleConnections = function() {
	var that = this;
	
	this.io.on('connection', function(socket){
		socket.authenticated = false;
		
		/**
		 * Event triggered when a user tries to authenticate.
		 * Join room and subscribe to messages to his username.
		 */
		socket.on('login', function(data) {
			var username = data.username;
			var password = data.password;
			
			that.authenticate(username, password, function(err, profile) {
				// We are all set to go
				if(!err) {
					socket.authenticated = true;
					socket.profile = profile;
					
					// Join room
					socket.join(username);
					
					// Store data in the socket object
					socket.userData = {
						username: username,
						password: password
					};
					
					// Store in the list of connected clients
					that.clients[username] = {
						id: socket.id
					};
					
					// Subscribe events
					if(that.redisSub) that.redisSub.subscribe(username);
				}//if
				
				socket.emit('login', {
					error: err
				});
				
				that.emit('login', socket, data);
				
				// Trigger a flush of all events to the user
				that.flush(username);
			});
		});
		
		/**
		 * Event triggered when a user disconnects.
		 * Cleanup message listeners, socket leaves automatically any rooms he joined.
		 */
		socket.on('disconnect', function() {
			// Unsubscribe from messages to be delivered to this user
			if(socket.userData) {
				var username = socket.userData.username;
				
				if(that.redisSub) that.redisSub.unsubscribe(username);
				
				delete that.clients[username];
			}//if
			
			that.emit('disconnect', socket);
		});
		
		that.emit('connection', socket);
	});
};

/**
 * Notify the server to send all events in the list / queue to the user
 */
DistributedSocket.prototype.flush = function(room) {
	if(room) {
		this.redisPub.publish(room, room);
	}//if
};

/**
 * Try to send the event to a connected user, or add it to the queue and notify the other servers
 */
DistributedSocket.prototype.send = function(room, event, data) {
	var that = this;
	
	if(room) {
		// The client is on this server
		if(this.clients[room]) {
			this.io.to(room).emit(event, data);
		}//if
		// Publish the event for another server to consume it
		else {
			if(!this.reliable) {
				this.redisPub.publish(room, JSON.stringify({ room: room, event: event, data: data }));
			}//if
			else {
				this.redisClient.rpush(room, JSON.stringify({ room: room, event: event, data: data }), function(err, res) {
					that.redisPub.publish(room, room);
				});
			}//if
		}//else
	}//if
	else {
		this.io.emit(event, data);
	}//else
};

/**
 * Terminate all connections
 */
DistributedSocket.prototype.destroy = function() {
	if(this.redisClient) this.redisClient.end();
	if(this.redisPub) this.redisPub.end();
	if(this.redisSub) this.redisSub.end();
	if(this.io) this.io.close(); // Close current server
	
	this.clients = null;
};

// Export module
module.exports = new DistributedSocket();
