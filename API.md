# CNC Server HTTP API [v1]

This file defines and documents all the available RESTful API resources and
configuration for [`cncserver.js`](cncserver.js). RESTful practices are all HTTP
based and accessible by any system or devices that can access a web page.
METHODs are used to differentiate what is being done to a particular resource.

All resources should be requested with, and *return* JSON data, regardless of
status code. Though for non-GET requests, you can pass variables as either JSON,
form encoded, or any other well-known standard, as long as you set the
`Content-Type` header to match.

In each request example below, the server is assumed to be added to the
beginning of each resource, E.G.: `GET http://localhost:4242/v1/pen` will `GET` the
status of the pen from a server plugged into the local computer, at the default
port of `4242`.

If you want to test any of these, try out
[Postman for Google Chrome](https://chrome.google.com/webstore/detail/postman-rest-client/fdmmgilgnpjigdojojpjoooidkmcomcm).
It allows for easy testing of any RESTful HTTP method to even remote servers.

![f1a930d0641920f074aeb32ebc512408](https://f.cloud.github.com/assets/320747/920613/894669a2-fee1-11e2-8349-dc6ad8cd805d.png)

An easy to use Postman JSON config file is now available in the repo
[here](https://raw.github.com/techninja/cncserver/master/cncserver_api.postman.json).
This supplies all the current API resources in a simple click and send test
environment, just import, and setup two global variables `cncserver-host` and
`cncserver-port`. If running on just one computer, these will be by default
`localhost` and `4242` respectively.


***NOTE:*** *Any comments visible in responses/JSON payload in the documentation
below are just to help make it easier to understand what's being sent. Comments
are* ***not allowed*** *in JSON data and will not exist in returned data.*

## 1. Pen
The `pen` resource is meant to act as the input/output for anything having
directly to do with drawing or interacting with the "pen". For the
WaterColorBot, it could be a paintbrush, or a pencil, or even an actual pen.

### GET /v1/pen
Gets the current pen status. This is a direct dump of the internal state of the
pen, so it will include x,y absolute step position, which you should ignore.

#### Request
```javascript
GET /v1/pen
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "x": 2344,               // Coordinates of drawing position, in steps
    "y": 281,
    "state": 1,              // Pen state is from 0 (Up/Off) to 1 (Down/On)*
    "height": 12372,         // The last sent servo position height value
    "tool": color2,          // Machine name of last tool
    "lastDuration": 1288,    // The duration of the last movement
    "distanceCounter": 231,  // Distance traveled in steps with pen down
    "simulation": 0          // 0 = pen is real/ready, 1 = Pen is virtual/not connected to bot
}
```

##### Usage Notes
 * All values are reset with server and will not be kept or otherwise stored as
runtime state.
 * tool will default to first tool in toolset at server start, eg `color0`.
 * distanceCounter must be reset/managed via the client, otherwise it's just a
handy realtime counter for steps when pen is down.
 * Pen simulation mode of 1 means that either the serial connection to the bot
never worked, or has been lost. `PUT` a value of 0 to attempt to reconnect.

* * *

### PUT /v1/pen
Allows for direct setting of state and position. ***Currently, you must set
position and state in separate requests. See issue [#16](https://github.com/techninja/cncserver/issues/16) for status.***

#### Request Example (set state #1)
```javascript
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "state": 0.75  // Pen state is from 0 (Up/Off) to 1 (Down/On)
}

```

#### Request Example (set state #2)
```javascript
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "state": "wash"  // OR use named presets for simpler use, see list below for more.
}

```

#### Request Example (set position)
```javascript
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "x": 13.2919,     // Percentage of total width/height (0 to 100)
    "y": 72.28124910
}

```

#### Request Example (reset distance counter)
```javascript
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "resetCounter": 1 // Should be 0 or 1
}

```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

( RETURNS FULL PEN STATUS, SEE ABOVE EXAMPLE IN: GET /v1/pen RESPONSE )
```

##### Usage Notes
 * As noted above, pen x, y should be sent as a percentage of total canvas width
& height respectively. This means that you can have your input canvas be any
size, as long as the aspect ratio matches the output, you shouldn't get any
stretching in the final image.
 * Pen state supports any value from 0 to 1 (E.G. `0.75`) that sets the servo as
a percentage of the range between the nominal use position, and "up".
 * Pen state named presets are also available as setup in the bot ini file.
Included with [watercolorbot.ini](machine_types/watercolorbot.ini) are:
  * `up`, equivalent to a state of 0
  * `paint`, equivalent to a state of 1 (for painting and getting paint)
  * `wipe`, default equivalent to a state of ~0.9 (for wiping the brush on water dishes)
  * `wash`, default equivalent to a state of ~1.2, a height impossible to move to
via the API without this named preset. Used to squash the bristles down to clean them.
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

* * *

### DELETE /v1/pen
Parks the pen, as you cannot move pen outside of draw area using PUT.

#### Request
```javascript
DELETE /v1/pen
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

( RETURNS FULL PEN STATUS, SEE ABOVE EXAMPLE IN: GET /v1/pen RESPONSE )
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
```javascript
GET /v1/tools
```

### Response
```javascript
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

* * *

### PUT /v1/tools/{toolname}
Sets the tool for the pen. Will make all ***required movements**** for the given
device's tool change operation, request finishes when tool change is complete.
Will return a `404 Not Found` if tool machine name isn't valid.

#### Request
```javascript
PUT /v1/tools/color1
```

### Response
```javascript
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
```javascript
DELETE /v1/motors
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Disabled"
}
```

##### Usage Notes
 * Motors will be enabled again as soon as any command that moves them is run.

* * *

### PUT /v1/motors
Allows direct setting of motor details, currently only supports resetting motor
offsets. Use after disabling the motors and parking by hand to ensure proper
relative offset reset without needing to restart the server.

#### Request
```javascript
PUT /v1/motors
Content-Type: application/json; charset=UTF-8

{
    "reset": 1
}
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Motor offset reset to park position"
}
```

## 4. Settings
The `settings` resource gives you handy, low level access to all the INI and
command line options currently in use by CNC Server, giving you the ability to
change height presets, servo duration, tool settings and anything else controlled
via nconf.

### GET /v1/settings
Gets the list of available settings types, handing the relative URI over for each.

#### Request
```javascript
GET /v1/settings
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "global": "/v1/settings/global",
    "bot": "/v1/settings/bot"
}
```

### GET /v1/settings/{settings type}
Gets a full dump of all settings for the given settings type, 404 not found if
settings type not found. Listed values are pulled from environment, then ini file,
then user set overrides.

#### Request
```javascript
GET /v1/settings/global
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "httpPort": "4242",
    "httpLocalOnly": false,
    "swapMotors": false,
    "invertAxis": {
        "x": false,
        "y": false
    },
    "serialPath": "/dev/ttyACM0",
    "bufferLatencyOffset": "50",
    "debug": false,
    "botType": "watercolorbot"
}
```

* * *

### PUT /v1/settings/{settings type}
Set root or sub level values for *any* settings on the given type.

#### Request
```javascript
PUT /v1/settings/global
Content-Type: application/json; charset=UTF-8

{
  "debug": true
}
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "httpPort": "4242",
    "httpLocalOnly": false,
    "swapMotors": false,
    "invertAxis": {
        "x": false,
        "y": false
    },
    "serialPath": "/dev/ttyACM0",
    "bufferLatencyOffset": "50",
    "debug": true,                // This value was previously false
    "botType": "watercolorbot"
}
```

* * *

#### Request Example (replace entire subtree)
```javascript
PUT /v1/settings/bot
Content-Type: application/json; charset=UTF-8

{
    "tools": {
        "inkwell": {             // ALL tools will be replaced with this entry
            "x": 0,
            "y": 0,
            "wiggleAxis": "y",
            "wiggleTravel": 300,
            "wiggleIterations": 4
        }
    }
}

```

#### Request Example (specific sub-level override)
```javascript
PUT /v1/settings/bot
Content-Type: application/json; charset=UTF-8

{
    "servo:duration": 450  // Only duration will be set when using nconf collapsed JSON format
}

```

#### Request Example (new sub-level entry and value)
```javascript
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "servo:presets:foo": 42  // Creates new height preset named "foo" under servo:presets with a value of 42%
}

```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

( RETURNS FULL SETTINGS VALUE OUTPUT, SEE ABOVE EXAMPLE IN: GET /v1/settings/{settings type} RESPONSE )
```

##### Usage Notes
 * This interface allows for changing every single setting, but in its current
implementation *no callbacks are triggered* for certain changes like
`serialPath` or `botType`, therefore there will only be a real effect if CNC
Server references the setting value in an operation after it's been changed.
 * Settings change callbacks could be added if there were a clear need
with examples. Looking for something like this? Submit a pull request or an issue!
 * All settings are reset to defaults/INI/environment on server restart.
 * As illustrated in the latter examples, you must either use the compressed
JSON notation to replace sub-level items like `servo:duration`, or you can
reference the exact structure, but doing so will replace the entire item and all
its children.
 * If experimenting, make sure that the output returned matches your expectations
 * There's currently no sanity checks for data ranges or variable types, and all
storage through INI files defaults to strings, so play nice and double check the
validity of your settings or you'll be chasing down ***very*** strange issues.

## 5. Buffer
The `buffer` resource gives you insight into the command buffer used to
internally queue work to be done by the hardware. Any commands meant to require
action from bot hardware write to the command buffer, other commands write to
the servers variables directly and are "instant". The most common use case for
this resource is to pause or resume command running on a low level.

### GET /v1/buffer
Gets the current buffer status, length of buffer and even the low level items to
be run next.

#### Request
```javascript
GET /v1/buffer
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "running": false, // Whether or not the buffer is currently processing
    "paused": false,  // True if Paused, false if ready
    "count": 0,       // Length of buffer
    "buffer": []      // Full buffer output
}
```

##### Usage Notes
 * The buffer is checked every 10ms, and processes that with short timing
intervals below a given threshold happen in an "instant" next-run blocking
fashion to ensure they occur without jitters or gaps.
 * The buffer output format is an array or low level serial commands specific to
the bot. These may **eventually** be abstracted to allow importing of rendered
commands directly into the buffer.


* * *

### PUT /v1/buffer
Set elements of the buffer state. Currently only supports `paused` state.

#### Request
```javascript
PUT /v1/buffer
Content-Type: application/json; charset=UTF-8

{
  "paused": true
}
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "running": false,
    "paused": true,
    "count": 0,
    "buffer": []
}
```

##### Usage Notes
 * The data given is always the same as the GET method, but current as of the
last change.


* * *

### DELETE /v1/buffer
Immediately clear the entire buffer of further commands.

#### Request
```javascript
DELETE /v1/buffer
Content-Type: application/json; charset=UTF-8

```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Buffer cleared"
}
```

##### Usage Notes
 * No wait is given, buffer is immediately cleared and no waiting callbacks are
called. This might have to change though...
