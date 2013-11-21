# CNC Server NODE API

This file defines and documents all the available exported low-level API
functionality available to node.js scripts running CNC Server as a node_module!

Also this document should cover good examples and basic usage of said functions.
Note that these are ***not*** the ReSTful API, but a lower level subset of very
different, more server specific functionality.

* * *

## General use as a node_module

Once installed into the `node_modules/cncserver` folder, just use the following
syntax at the top of your script:
```javascript
var cncserver = require("cncserver");
```
This will create a global `cncserver` object that is used for every item listed
here, though you can name it however you like. You can also tweak settings as
soon as you have your cncserver object:

```javascript
cncserver.conf.global.overrides({
  httpPort: 1234,
  swapMotors: true
});
```

Available immediately you can use the
[nconf interfaces](https://github.com/flatiron/nconf#hierarchical-configuration)
`cncserver.conf.global` and `cncserver.conf.bot` to edit settings before
continuing.

That's it! Though CNC Server will detect that you're using it as a node_module
and not actually do anything useful (like connecting to anything or starting the
server) until you tell it to...

## Starting the server
### `cncserver.start(callbacks)`

```javascript
// Actually try to start the server
cncserver.start({

  success: function() {
    console.log('Port found, connecting...');
  },

  connect: function() {
    console.log('Bot Connected!');
    initialize();
  },

  disconnect: function() {
    console.log("Bot disconnected!");
  }

  error: function(err) {
    console.log("couldn't connect to bot!", err);
  },

});

// Custom code to do what we want
function initialize() {
  console.log('All ready to do stuff!');
};

```

Call the `.start()` function with an object containing **4** callback functions:
 * `success`: Will get called as soon as the auto-port select process succeeds,
though you're not connected just yet...
 * `connect`: Ok, now you're connected! At this point the server is properly
started and serial commands and API requests can be sent and can be expected to
succeed.
 * `disconnect`: Called immediately when a hardware disconnect event occurs.
 * `error`: Called to report back on **why** the serial connection has failed
during startup only. This is the only callback that actually passes an argument
back, an error object! Well, sometimes an error, sometimes just a string.
We're working on it ;)


## Making a custom endpoint
### `cncserver.createServerEndpoint(path, callback)`

CNC Server provides a number of ReSTful API endpoints, but maybe you want to
piggyback on that awesomesauce and make an endpoint your own for your custom script to
manage? Well, *this is the function for you!*

```javascript
cncserver.createServerEndpoint('/v1/foo/:bar', function(req, res) {

  if (req.route.method == 'get') { // Is this a GET request?
    if (req.params.bar == 'woot') { // What was the value of :bar from the path?
      return {code: 200, body: {thisIs: 'a triumph'}}; // 200 - OK + Body Data
    } else {
      return [404, 'Not Found :P']; // 404 - Not Found
    }
  } else {
    return false; // 405 - Method Not Supported
  }

});
```

This function is basically a wrapper to make new endpoints as simple as possible.
Using the exact same initialization format used by express (the robust HTTP
server running the CNC Server API), the first argument is the path you want to
watch for requests on, including
[any variable path portions](http://expressjs.com/api.html#app.param). The second
argument is your central callback. Any HTTP requests to your endpoint will
trigger this function, passing to it the express `req`
[request object](http://expressjs.com/api.html#req.params), and the
`res` [response object](http://expressjs.com/api.html#res.status).

Actual response to requests is handled entirely by returning data from the
callback in one of the following formats:
 * `false`: Return **false**, and we assume you just don't care, and respond to
the request with `405 - Method Not Supported`.
 * `[404, "Thingie not found!"]`: Return a **2 element array** and we assume you
just want to return a quick status message and custom status code. Array index
[0] should be the numerical
[http status code](http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html)
you want to respond with, and array index [1] should be the string message to be
returned in the body, output like this: `{"status": "I'm a teapot"}`
 * `{code: 200, body: {stuff: "nJunk"}}`: Return an **object** and we'll
respond with the http `code` given, along with the entire object within `body`
as the JSON payload returned to the request.
 * `something else`: If you return something that ***isn't*** any of the above
(number, `true`, etc), no response will be sent by the return handler and it'll
be ***up to you*** to send the response manually via
[`res.send`](http://expressjs.com/api.html#res.send). Only do this if you want
to do something totally different and crazy like sending a file or waiting for
some completely different arbitrary callback.

* * *
## More documentation to come!
* * *
