# CNC Server API [v1]

This file defines and documents all the available RESTful API resources and
configuration for [`cncserver.js`](cncserver.js). RESTful practices are all HTTP
based and accessible by any system or devices that can access a web page.
METHODs are used to differentiate what is being done to a particular resource.

All resources should be requested with, and *return* JSON data, regardless of
status code. Though for non-GET requests, you can pass variables as either JSON,
form encoded, or any other well-known standard, as long as you set the
`Content-Type` header to match.

In each request example below, the server is assumed to be added to the
beginning of each resource, E.G.: `GET http://localhost:4242/pen` will `GET` the
status of the pen from a server plugged into the local computer, at the default
port of `4242`.

If you want to test any of these, try out
[Postman for Google Chrome](https://chrome.google.com/webstore/detail/postman-rest-client/fdmmgilgnpjigdojojpjoooidkmcomcm).
It allows for easy testing of any RESTful HTTP method to even remote servers.

![f1a930d0641920f074aeb32ebc512408](https://f.cloud.github.com/assets/320747/920613/894669a2-fee1-11e2-8349-dc6ad8cd805d.png)

An easy to use Postman JSON config file is now available in the repo for
[here](https://raw.github.com/techninja/cncserver/master/cncserver_api.postman.json).
This supplies all the current API resources in a simple click and send test
environment, just import, and setup two global variables `cncserver-host` and
`cncserver-port`. If running on just one computer, these will be by default
`localhost` and `4242` respectively.


***NOTE:*** *Any comments visible in responses/JSON payload in the documentation
below are just to help make it easier to understand what's being sent. Comments
are *not allowed* in JSON data and will not exist in returned data.*

## 1. Pen
The `pen` resource is meant to act as the input/output for anything having
directly to do with drawing or interacting with the "pen". For the
WaterColorBot, it could be a paintbrush, or a pencil, or even an actual pen.

### GET /v1/pen
Gets the current pen status. This is a direct dump of the internal state of the
pen, so it will include x,y absolute step position, which you should ignore.

#### Request
```
GET /v1/pen
```

#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "x": 2344,               // Coordinates of drawing position, in steps
    "y: 281,
    "state": 1,              // Pen state is from 0 (Up/Off) to 1 (Down/On)
    "tool": color2,          // Machine name of last tool
    "lastDuration": 1288     // The duration of the last movement
    "distanceCounter": 231,  // Distance traveled in steps with pen down
    "simulation": 0      // 0 = pen is real/ready, 1 = Pen is virtual/not connected to bot
}
```

##### Usage Notes
 * All values are reset with server and will not be kept or otherwise stored as
runtime state.
 * tool will default to first tool in toolset at server start, eg `color0`.
 * distanceCounter must be reset/managed via the client, otherwise it's just a
handy realtime counter for steps when pen is down.
 * Pen simulation mode means that either the serial connection to the bot never
worked, or has been lost. Put a value of 0 to attempt to reconnect.


### PUT /v1/pen
Allows for direct setting of state and position. ***Currently, you must set
position and state in separate requests. See issue [#16](https://github.com/techninja/cncserver/issues/16) for status.***

#### Request Example (set state)
```
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "state": 1  // Pen state is from 0 (Up/Off) to 1 (Down/On)
}

```

#### Request Example (set position)
```
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "x": 13.2919,     // Percentage of total width/height (0 to 100)
    "y": 72.28124910
}

```

#### Request Example (reset distance counter)
```
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "resetCounter": 1 // Should be 0 or 1
}

```

#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

(RETURNS FULL PEN STATUS, SEE ABOVE EXAMPLE IN GET /pen RESPONSE)
```

##### Usage Notes
 * As noted above, pen x, y should be sent as a percentage of total canvas width
& height respectively. This means that you can have your input canvas be any
size, as long as the aspect ratio matches the output, you shouldn't get any
stretching in the final image.
 * Pen state will eventually support a range of values between 0 and 1
(see issue [#18](https://github.com/techninja/cncserver/issues/18)), but for now it will be forced to either 0 or 1 based on input.
 * Returns full pen status on success, no matter what was sent or changed.
 * Tools can't be changed here. See `/tools` resource below.
 * Request will not complete until movement is actually complete, though you can
send more requests through separate channels.
 * Passing the variable `ignoreTimeout` as `1` for x/y movements will
finish the request immediately, even though it may still be moving to that
position. In those cases, the response will return a `202 Accepted` instead of a
`200 OK`.
 * `lastDuration` in return data can be used in conjunction with ignoreTimeout
to allow the client to manage timings instead of waiting on the server.

### DELETE /v1/pen
Parks the pen, as you cannot move pen outside of draw area using PUT.

#### Request
```
DELETE /v1/pen
```

#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

(RETURNS FULL PEN STATUS, SEE ABOVE EXAMPLE IN GET /pen RESPONSE)
```

##### Usage Notes
 * Relies on the original parking position being correct in the first place,
obviously.



## 2. Tools
The tools resource is meant to allow automated changing and listing of tools,
or colors for the WaterColorBot. The server may not know what exact type of tool
its using as tool sets can be changed out, as long as tool positions don't
change, they can stay configured server-side.

### GET /v1/tools
Lists all tools machine names in the device's tool configuration list.

#### Request
```
GET /v1/tools
```

### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "tools" :
      [
        "water0",
        "water1",
        "water2",
        "color1"
      ]
}
```


### PUT /v1/tools/{toolname}
Sets the tool for the pen. Will make all ***required movements**** for the given
device's tool change operation, request finishes when tool change is complete.
Will return a `404 Not Found` if tool machine name isn't valid.

#### Request
```
PUT /v1/tools/color1
```

### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Tool changed to color1"
}
```
##### Usage Notes
 * **"required movements"** for each tool change depend on server configuration
for each tool. For example, WaterColorBot tool changes all follow exactly this
pattern: "pen up, move to position, pen down, wiggle, pen up". The ability to
change this is planned in issue [#39](https://github.com/techninja/cncserver/issues/39)
 * Consecutive requests to the same tool will ***not*** act any differently than
a request to change to a new tool, and will therefore repeat all required
movements.



## 3. Motors
Provides **low level** access to stepper motor driver, and is placeholder for
more low level functions in the future.

### DELETE /v1/motors
Turn off/unlock the motors. This allows for the motors to be moved by hand.
After having moved programmatically, the motors are locked to that position
until this is called.

#### Request
```
DELETE /v1/motors
```

#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Disabled"
}
```

##### Usage Notes
 * Motors will be enabled again as soon as any command that moves them is run.


### PUT /v1/motors
Allows direct setting of motor details, currently only supports resetting motor
offsets. Use after disabling the motors and parking by hand to ensure proper
relative offset reset without needing to restart the server.

#### Request
```
PUT /v1/motors
Content-Type: application/json; charset=UTF-8

{
    "reset": 1
}
```

#### Response
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Motor offset zeroed"
}
```
