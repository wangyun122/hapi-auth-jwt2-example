var Hapi        = require('hapi');     // https://github.com/nelsonic/learn-hapi
var hapiAuthJWT = require('hapi-auth-jwt2'); // http://git.io/vT5dZ
var JWT         = require('jsonwebtoken');   // used to sign our content
var port        = process.env.PORT;  // allow port to be set
var aguid       = require('aguid')  // https://github.com/ideaq/aguid
var url         = require('url');   // node core!
// if you don't already have a *FREE* RedisCloud Account
// visit: https://addons.heroku.com/rediscloud (it works outside heroku! free!)
var redisClient = require('redis-connection')(); // instantiate redis-connection

redisClient.set('redis', 'working');
redisClient.get('redis', function (rediserror, reply) {
  /* istanbul ignore if */
  if(rediserror) {
    console.log(rediserror);
  }
  console.log('redis is ' +reply.toString()); // confirm we can access redis
});

// bring your own validation function
var validate = function (decoded, request, callback) {
  console.log(" - - - - - - - DECODED token:");
  console.log(decoded);
  // do your checks to see if the session is valid
  redisClient.get(decoded.id, function (rediserror, reply) {
    /* istanbul ignore if */
    if(rediserror) {
      console.log(rediserror);
    }
    console.log(' - - - - - - - REDIS reply - - - - - - - ', reply);
    var session;
    if(reply) {
      session = JSON.parse(reply);
    }
    else { // unable to find session in redis ... reply is null
      return callback(rediserror, false);
    }

    if (session.valid === true) {
      return callback(rediserror, true);
    }
    else {
      return callback(rediserror, false);
    }
  });
};

var server = new Hapi.Server();
server.connection({ port: port });

server.register(hapiAuthJWT, function (err) {
  // if(err) { // uncomment this in prod
  //   console.log(err);
  // }
  // see: http://hapijs.com/api#serverauthschemename-scheme
  server.auth.strategy('jwt', 'jwt', true,
  { key: process.env.JWT_SECRET,  validateFunc: validate,
    verifyOptions: { ignoreExpiration: true }
  });

  server.route([
    {
      method: "GET", path: "/", config: { auth: false },
      handler: function(request, reply) {
        reply({text: 'Token not required'});
      }
    },
    {
      method: ['GET','POST'], path: '/restricted', config: { auth: 'jwt' },
      handler: function(request, reply) {
        reply({text: 'You used a Token!'})
        .header("Authorization", request.headers.authorization);
      }
    },
    { // implement your own login/auth function here
      method: ['GET','POST'], path: "/auth", config: { auth: false },
      handler: function(request, reply) {
        var session = {
          valid: true, // this will be set to false when the person logs out
          id: aguid(), // a random session id
          exp: new Date().getTime() + 30 * 60 * 1000 // expires in 30 minutes time
        }
        // create the session in Redis
        redisClient.set(session.id, JSON.stringify(session));
        // sign the session as a JWT
        var token = JWT.sign(session, process.env.JWT_SECRET); // synchronous
        console.log(token);

        reply({text: 'Check Auth Header for your Token'})
        .header("Authorization", token);
      }
    },
    {
      method: ['GET','POST'], path: "/logout", config: { auth: 'jwt' },
      handler: function(request, reply) {
        // implement your own login/auth function here
        var decoded = JWT.decode(request.headers.authorization,
          process.env.JWT_SECRET);
        var session;
        redisClient.get(decoded.id, function(rediserror, redisreply) {
          /* istanbul ignore if */
          if(rediserror) {
            console.log(rediserror);
          }
          session = JSON.parse(redisreply)
          console.log(' - - - - - - SESSION - - - - - - - -')
          console.log(session);
          // update the session to no longer valid:
          session.valid = false;
          session.ended = new Date().getTime();
          // create the session in Redis
          redisClient.set(session.id, JSON.stringify(session));

          reply({text: 'Check Auth Header for your Token'})
        })
      }
    },
    { // remove this method if you use this in PROD!
      method: 'GET', path: '/end', config: { auth: false },
      handler: function(request, reply) {
        redisClient.end();
        reply({text: 'end'});
      }
    }
  ]);
});

server.start(function(){
  console.log('Now Visit: http://127.0.0.1:'+port);
}); // uncomment this to run the server directly

module.exports = server;
