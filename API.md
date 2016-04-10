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
[Postman for Google Chrome](https://www.getpostman.com/).
It allows for easy testing of any RESTful HTTP method to even remote servers.

![Postman](https://cloud.githubusercontent.com/assets/320747/14413647/3b79921a-ff35-11e5-9f52-a10e949ac083.png)

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

Gets the "current" pen status at the tip of the execution buffer (note that this
is ***not*** the known actual machine status if the buffer has any items in it).
This is a direct dump of the internal state of the pen, so it will include x,y
absolute step position, which can be used in conjunction with bot settings
`maxArea` width and height to tell you exactly where the pen should be.

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
    "power": 0,              // The amount of power given to the pen (not always supported)
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
 * To restate: if there are items in the buffer, this will only represent the
very end of the buffer (the last action sent). To get the actual pen position,
add `?actual=1` to the query URI, or use the real-time event driven API detailed
at the bottom of this document.

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

#### Request Example (set power)
This will set the PWM output on B3 of the EBB
```javascript
PUT /v1/pen
Content-Type: application/json; charset=UTF-8

{
    "power": 0.75  // Pen power is a float from 0 (Full off) to 1 (Full on)
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

### POST /v1/buffer
Create buffer specific items for the buffer. Currently only supports `message`
and `callback`.

#### Request: Add message
```javascript
POST /v1/buffer
Content-Type: application/json; charset=UTF-8

{
  "message": "Going and drawing something"
}
```

#### Request: Add callback name
```javascript
POST /v1/buffer
Content-Type: application/json; charset=UTF-8

{
  "callback": "drawcomplete"
}
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "Message added to buffer"
}
```

##### Usage Notes
 * For clients that want event driven status messages, this adds the messages to
the same buffer as the other commands, so as the message item is reached during
buffer processing, it's sent out via the `message update` Socket.IO event. See
socket/streaming section below for more info.
 * No filtering is done to this string, use with care.

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


## 6. Socket.IO & real-time event data streaming
The API has served the project incredibly well, but it was lacking in one
important aspect: a remote client can receive no updates without asking first,
no events or data without polling or some other kludge. That is now all
completely fixed with full Socket.IO streaming support.

Though not technically ReSTful *or* required, CNC Server now supports streaming
of server oriented events that allow for a far better buffer management,
visualization and accuracy.

To use an event, just pass the named event type into your `socket.on` function
like this:
```javascript
socket.on('pen update', function(actualPen){
  console.log('The pen just moved to x:' + actualPen.x + ' y:' + actualPen.y);
});
```

The following named Socket.IO event types and data are available:

### Socket.IO event: "pen update"
Triggered whenever the actualPen object is changed, usually during serial
command sends.

#### Event Response Argument Object
```javascript
( RETURNS FULL PEN STATUS OBJECT, SEE ABOVE EXAMPLE IN: GET /v1/pen RESPONSE )
```

##### Usage Notes
 * Pen status object here is the `actualPen` object, so it should represent the
current status, or at least the soon to be current status of the bot itself.
 * This is triggered as serial commands are being sent out. For movement,
the bot will only just start moving at the moment this is triggered, so you can
use the `lastDuration` key in the object to animate the movement linearly
between the last location and the new location perfectly. See example
application CNC Server Controller at the web root for an idea of how this works.
 * Unfortunately because of issues upstream, if being used as a node module with
a local callback `penUpdateTrigger`, these event updates will no longer be
sent. This shouldn't need to be the case, but it ensures that commands are sent
cleanly to the bot over repeating this data over the stream.
 * _This event can trigger an update with no actual pen changes._

* * *

### Socket.IO event: "buffer update"
Triggered whenever the buffer object (or its associated variables) is changed,
usually during serial command sends, or pausing/unpausing.

#### Event Response Argument Object
```javascript
{
    bufferList: ["hash1", "..."],   // Countable array of hashes, in order.
    bufferData: { hash1: {...}},    // Object keyed by hash, of each buffer action.
    bufferRunning: bufferRunning,   // Boolean: Buffer is currently processing/running?
    bufferPaused: bufferPaused,     // Boolean: Is the buffer paused?
    bufferPausePen: bufferPausePen  // Object: Last pen object set before paused
}
```

#### Buffer Item Objects
```javascript
move =
{
    type: "absmove",
    x: 4200,
    y: 1200,
}

height =
{
    type: "absheight",
    z: 19750,
    state: "up",
}

message =
{
    type: "message",
    message: "This is a custom text message!"
}
```

##### Usage Notes
 * Buffer items are verbatim as used in the event loop. See above buffer object
descriptions.
 * If buffer command is not an object, it will be a string to be sent out as
serial ASCII data with no extra metadata.
 * _This event can trigger an update with no actual buffer changes._

* * *

### Socket.IO event: "message update"
Triggered whenever a "message" item in the buffer is reached, added via the
`/v1/buffer POST`.

#### Event Response Argument Object
```javascript
{
    message: "I never could get the hang of Thursdays.",
    timestamp: "Thur Sep 1 2016 12:09:45 GMT-0700 (Pacific Standard Time)"
}
```

##### Usage Notes
 * These custom text messages are set simply to trigger this event, and intend
to simply help inform users about where the bot might be or what it's intent is
within a large set of operations.


* * *

### Socket.IO event: "callback update"
Triggered whenever a "callbackname" item in the buffer is reached, added via the
`/v1/buffer POST`.

#### Event Response Argument Object
```javascript
{
    name: "drawcomplete",
    timestamp: "Thur Sep 1 2016 12:09:45 GMT-0700 (Pacific Standard Time)"
}
```

##### Usage Notes
 * Yet another custom text message, but with the sole intent to be used as a
switch case in the event function to trigger events as "callbacks" at certain
points in execution.
