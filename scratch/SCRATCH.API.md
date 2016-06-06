# CNC Server Scratch HTTP API [v1]

This file defines and documents all the available non-ReSTful Scratch 2 offline
editor "[experimental HTTP extension](http://wiki.scratch.mit.edu/wiki/Scratch_Extension#HTTP_Extensions)"
API resources and configuration for [`cncserver.js`](cncserver.js). As noted,
these are as experimental as Scratch considers them, and the output format may
change without warning.

### Unlike the ReSTful API:
 * `GET` is the only method used for the requests. This means data is only
passed in the URL path structure, or in get variables.
 * No data is intended to be read from HTTP responses with the exception of the
`/poll` endpoint, therefore other request in the API return no data.
 * Scratch currently doesn't support any kind of namespacing for URIs, so these
endpoints live outside the `/v1` ReSTful namsespaced API, directly on the
root.
 * Scratch _**also**_ doesn't seem to support arbitrary slashes in URI structure
so I've replaced them with periods. This unfortunately does not apply to
variables, and must be also added to the end before any variables (if any).
:imp:

In each request example below, the server is assumed to be added to the
beginning of each resource, E.G.: `GET http://localhost:4242/poll` will `GET`
the poll content output page from a server plugged into the local computer, at
the default port of `4242`.


### How do I use this?
Though there's not a 1:1 relationship between them, these API endpoints are
intended to be used in Scratch via the custom block definitions found in
[watercolorbot_scratch.s2e](watercolorbot_scratch.s2e). Though this is
WaterColorbot specific, most blocks should work regardless of the machine
selected. To access the blocks, either open an example Scratch example file from
the [WaterColorBlocks repository](https://github.com/evil-mad/watercolorblocks),
or import them via the hidden extension menu item in the Scratch 2 offline
editor accessed by pressing the shift key and clicking the file menu, select
"Import Experimental HTTP Extension" from the bottom of the menu, then load
the `.s2e` file above from the root of CNC Server.

![All defined WaterColorBlocks](https://cloud.githubusercontent.com/assets/320747/3940401/e0948ae8-24df-11e4-852f-2c6314d9722e.png)

Once imported, the blocks depicted above should all be available in the
"More Blocks" section on the UI.


### An Important Note on Timing... :clock1: :clock1030: :clock10:
At the beginning of
[creating Scratch support](https://github.com/techninja/cncserver/issues/50),
efforts focused on ensuring that Scratch would wait for every single process to
complete, as current clients like RoboPaint do. It was soon found that Scratch
had an open bug that didn't allow for this, but a "send and forget" model for
triggered commands works quite well as CNCserver manages its own command buffer.
This means that all commands are sent and wait for the previous command to
complete before running, allowing for very smooth performance for lots of little
commands that are streamed to CNCServer as quickly as they can be pushed into
the buffer. One remaining downside is that X/Y/Z positional values (and others)
read from the bot are realtime and do not take into account past or possible
future values.

* * *

## 1. Output
These are Scratch 2 required, *output only* resources required for general use.

### GET /poll
This page is polled during every screen draw (about 30 times a second), and
all input *into* Scratch is handled here. Any value block are populated directly
from this page, along with any waiting processes (not yet fully implemented).

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: text/plain; charset=UTF-8

x 0
y 0
z 0
angle 90
sleeping 0
state 0
height 0
busy false
tool color0
lastDuration 0
distanceCounter 0
simulation 1
```

##### Usage Notes
 * Values are set directly from internal storage variables and reflect what the
bot is currently doing, not what was sent into the buffer and still must be
done.
 * `x` & `y` are in an arbitrary absolute scale based on the relative offset
between Scratch pixel values and the number of steps on the WaterColorBot stage
at default resolution, with 0,0 right in the center to mimic Scratch standards.
 * `z` is either 0 or 1 depending on if the brush is up (0/Not painting), or down
(1/Totally painting)
 * `angle` the current angle of the internal "turtle", used only for this API to
allow for linear forward and backward relative movement.
 * `sleeping`, either 0 or 1, states whether the API is actually listening to
commands.
 * Other fields are pulled directly from the
[pen object of the ReSTful API](https://github.com/techninja/cncserver/blob/master/API.md#response).

* * *

### GET /crossdomain.xml
Created before the CORs standard, this required "file" for flash applications
allows the resources to be accessed outside of the security realm of the flash
application.

#### Response
```javascript
GET /crossdomain.xml
Content-Type: text/plain; charset=UTF-8

<?xml version="1.0" ?><cross-domain-policy><allow-access-from domain="*" to-ports="4242"/></cross-domain-policy>
```
* * *

## Triggers/Input
**Note:** The following examples do not include requests or responses as these
all use the `GET` HTTP method with URL parameters and return no text in the body
as described above.

## 3. Absolute movement/settings
If you need to change something to an exact know value, these are what you need.

### GET /pen.up & /pen.down
Does just what it says on the tin.

### GET /coord/:x/:y
Set the absolute X/Y position, given in the same pixel approximate scale in the
return coordinates.

### GET /coord/:named-x/:named-y
Set the absolute X/Y position based on the given word for the position, E.G.:
`/coord/right/bottom`, `/coord/center/top`. Accepts standard English `top`,
`left`, `right`, `bottom` & `center`.

### GET /move.absturn./:angle
Set the exact angle of the turtle's facing direction or relative movement to the
given angle.

### GET /move.speed./:value
Sets the move speed to the given value, accepts 0-10.

### GET /penreink/:distance
Sets the number of centimeters the bot will draw (movement over the canvas while
the brush is down) before "re-inking" the brush with the last used media
(water/paint). 48 is the default value used by RoboPaint and is recommended.
This value is reset to 0 (do nothing) whenever the Stop button/`/reset_all` is
triggered.

### GET /penstopreink
A shortcut to set the re-ink distance to 0, or OFF.

* * *

## 4. Relative movement/settings
Relative movement is made possible via the "turtle" pointer interface and is
based on angle, X/Y or other known variables. All relative values are sanity
checked to avoid crashes.

### GET /move.forward./:amount
Steps the turtle forward (based on angle) from current position.

### GET /move.nudge.x./:amount & /move.nudge.y./:amount
Nudges the turtle X or Y value by the given amount. Allows for positive or
negative values, does not change turtle angle.

### GET /move.right./:amount & /move.left./:amount
Rotate direction that the turtle is facing either right or left by the amount of
degrees given.

### GET /move.toward./:x/:y
Absolutely sets the turtle facing direction angle towards an absolute X/Y
coordinate *relative* to the current turtle position. Useful for "follow the
mouse" applications.

* * *

## 5. Grouped functions
These do a series of actions to help make things easier

### GET /tool.color./:index & /tool.water./:index
Helpers for getting water or paint on the brush based off the integer index
number given. 0-2 for `water`, 0-7 for `color`.

### GET /pen.wash
Washes the brush in all three water dishes from the top to the bottom. Does not
park, but does life the brush when complete.

### GET /park
Park the bot in the top left parking location. Note: this is *not* the default
absolute center position the turtle pointer begins at, and this will not effect
the turtle position.

## 6. Misc

### GET /reset_all
Triggered by Scratch when the red "stop sign" is clicked, or when another
action is expected to reset the program.

##### Usage Notes
 * Completely resets internal "turtle" to 0 position
 * Clears entire run buffer, so this should stop any currently running action
or group action (like getting paint).
 * _*Does not*_ park or lift the brush. This may be up for debate.

* * *

### GET /pen.off
Turn off motors and reset pointer to top left park position.

### GET /pen.resetDistance
Reset the `distanceCounter` variable back to 0.

### GET /pen.sleep.0 & /pen.sleep.1
Turn on or off sleep mode based on the given value, either 1 for on, 0 for off.
Sleep mode ON will prevent the API from doing anything until sleep mode is turned
OFF.

### GET /move.wait./:seconds
Sets a "wait" command in the buffer for the specified number of seconds, decimal
values like 0.5 are OK.
