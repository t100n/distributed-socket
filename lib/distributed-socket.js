/**
 * Module dependencies
 */

var _ = require('lodash');

/**
 * Instance of distributed-socket
 * Options:
 * 	port 			Integer
 * 	redisClient 		Client
 * 	redisAuth 		String
 * 	io 			Socket.io object
 * 	app 			Expressjs object
 * 	server 			HTTP Server
 * 	socketAuthorization 	Function
 * 	authenticate 		Function
 * 	handleConnections 	Function
 * 	handleMessages 		Function
 * 	onConnection		Function
 */
var DistributedSocket = module.exports = function(options) {
	if(!(this instanceof DistributedSocket)) return new DistributedSocket(options);
	
	var that = this;
	
	this.options = _.defaults(options || {}, this.options);
	
	this.clients = {};
	
	if(!this.options.port) {
		this.port = 3000;
	}//if
	else {
		this.port = this.options.port;
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
	
	if(this.options.redisAuth) {
		this.redisAuth = this.options.redisAuth;
		
		this.redisClient.auth(this.redisAuth, function(err) {});
	}//if
	
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
	
	if(!this.options.onConnection) {
		this.onConnection = function(socket) {};
	}//if
	else {
		this.onConnection = this.options.onConnection;
	}//else
	
	if(this.options.socketAuthorization) {
		this.socketAuthorization = this.options.socketAuthorization;
		
		this.io.use(function (socket, next) {
			var handshakeData = socket.request;
			
			// make sure the handshake data looks good
			that.socketAuthorization(handshakeData, function(err) {
				next(err);
			});
		});
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
	
	// Start handling connections from clients
	this.handleConnections();
	
	// Start handling messages from other servers
	this.handleMessages();
};

DistributedSocket.prototype.handleMessages = function() {
	var that = this;
	
	this.redisClient.on('message', function(channel, message) {
		var data = JSON.parse(message);
		
		that.emit(data.room, data.event, data.data);
	});
};

DistributedSocket.prototype.handleConnections = function() {
	var that = this;
	
	this.io.on('connection', function(socket){
		/**
		 * Event triggered when a user tries to authenticate.
		 * Join room and subscribe to messages to his username.
		 */
		socket.on('login', function(data) {
			var username = data.username;
			var password = data.password;
			
			that.authenticate(username, password, function(err) {
				// We are all set to go
				if(!err) {
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
					if(that.redisClient) that.redisClient.subscribe(username);
				}//if
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
				
				if(that.redisClient) that.redisClient.unsubscribe(username);
				
				delete that.clients[username];
			}//if
		});
		
		that.onConnection(socket);
	});
};

DistributedSocket.prototype.emit = function(room, event, data) {
	if(room) {
		// The client is on this server
		if(that.clients[room]) {
			this.io.to(room).emit(event, data);
		}//if
		// Publish the event for another server to consume it
		else {
			this.redisClient.publish(room, JSON.stringify({ room: room, event: event, data: data }));
		}//else
	}//if
	else {
		this.io.emit(event, data);
	}//else
};

DistributedSocket.prototype.destroy = function() {
	if(this.redisClient) this.redisClient.end();
	if(this.io) this.io.close(); // Close current server
	
	this.clients = null;
};
