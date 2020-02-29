# CNC Server HTTP API [v1] - Actions

This file defines and documents _only_ the high level drawing "Actions" RESTful
API resource for complex automation and job management. If you haven't read it
yet, see the full [low level API documentation](API.md) first.

> ## _QUICK NOTE:_
>
> *Any comments visible in responses/JSON payload in the documentation
> below are just to help make it easier to understand what's being sent. Comments
> are* ***not allowed*** *in JSON data and will not exist in returned data.*

## Preamble

The Actions API is the jumping off point for all complex or combined/calculated
work that will eventually be rendered into simpler functions. Instead of telling
the drawing bot exactly where to move and when to draw, the actions API simply
dictates and stores the minimum definition of what should be done, and the work
is drawn to a virtual `preview` canvas, returned via the Socket.io connection
when internally updated in the form of Paper.js JSON object.

**TODO: ADD SCREENSHOT OF FINISHED PREVIEW**
TODO: Make sure this shows an animation of the intended workflow:
Image -> Stage -> Render -> Draw!

The intent is that through the API a client can `stage` a piece of content (SVG
Vector, source raster) to an intermediate layer, allowing for clientside
refining of positioning/scale relative to other objects and the draw area. Once
staged, content can be rendered into drawing paths using global defaults or per
object overrides, allowing as many staged source content -> to render previews
as needed for the user to achieve their expected result.

If you just want to render a piece of content once, knowing fully where/how you
want to render it, you can specify your operation intent and settings via the
semi-volatile action method that renders immediately to the preview, ready to be
printed.

When the client is "ready", this work can be order optimized (or simply drawn as
given), and will be converted into tasks and instructions. This allows for
simple higher order APIs to exist within the singular Actions endpoint, but you
as an API implementor need to understand what it means to create an "action" in
the ReSTful sense is fundamentally different than all of the lower level APIs.

Anatomy of a unit of work
=========================
All work done by the server is broken down and queued into four types of work in
_ascending_ order of abstraction:

**Instructions:** Move Pen, Up/Down
---------------------------------
  * Actual serial commands to be queued.
  * Basically all direct pen movements from the `/v1/pen` API.

**Task:** Group of Instructions
---------------------------------
  * Move with accelleration from point A to point B
  * Any other group of instructions that could be considered singular but need
  to be rendered as multiple commands because of controller restrictions.

**Job:** Group of Tasks
---------------------------------
  * Directly trace the outline(stroke) of a single path with given settings,
  including all pen lifts.
  * Fill a single path with given settings (eventually rendered to a trace)

**Project:** Group of jobs
----------------------------------
  * Fill and trace an entire SVG with given settings
  * Raster drawing conversion and interpretation into ready to trace paths

Thinking in terms of our units of work, the low level API creates and queues
within the buffer mostly abstracted `instruction`s. When using the
_Actions API_, these commands will _**not**_ be returned via the
standard buffer queue. Though the server can easily manage creation and
rendering of this data out to a bot, complex path rendering over the socket API
and reinterpretation of these instructions on the clientside presents an
unreasonable amount of data/transfer overhead very quickly.

The solution is to use this high level source data "as-is", streamlining
rendering and allowing clients to simply use existing data formats and import
techniques.


Actions and their types
===========================
Because the low level APIs remain and cover all the bases for both tasks and
instructions, only **Projects** and **Jobs** can be created as actions. Creating
an action does not actually tell the server to draw it immediately. Instead, the
work is added to the list of actions, and rendered to the preview canvas. If
using the included browser based UI, the rendered preview data should be
immediately visible on the preview canvas. Each action gets a hash ID allowing
it to be managed directly and progress checked.

## You want a `project` if...
 * You have the source code for an entire SVG and want it painted/drawn
 * You have the URL/file location (accessible by the server) for an SVG file and
 want it painted/drawn
 * You have an image data/file url of a raster you want interpreted as
 something drawable

## You want a `job` if...
 * You have an SVG "path data" string representing a single or compound path
 that you wish to directly outline stroke or fill with custom settings.
 * You have a string of text you wish to render as a job grouping of strokes in
 a particular font.


Common Action argument shapes
===========================
The Actions API accepts a single JSON object in the raw `POST` request, and
through this object all work is defined. The following are all of the object
keys that are shared between both `project` and `job` types.

## ▶ `"type": "project" | "job"` (required)
Simply pass the machine name of the action type you wish to create. This changes
the entire nature of the operation so be sure you're creating the right kind to
match what you're trying to do.

**TODO:** I've painted myself in a corner and by not actually doing any real
drawing by adding actions, I needed some way to actually trigger drawing, so
there's actually a third type here, `drawpreview`, given with zero other
arguments, and this will process whatever is on the preview canvas and draw it.

## ▶ `"operation": "[TYPE]"` (required)
The operation key defines a machine name string of _what you intend to do_ for
either a job or a project, and it changes what input content is expected in the
`body` and `settings` keys.

>#### Operations for `project`:
>  * `"trace"`, `"fill"`, & `"full"`
>    * If "trace", only the outlines of paths will be drawn.
>    * If "fill", only the fill operation will be run on all paths.
>    * If "full", both will be run.
>    * The `body` key value should be either:
>      * A string containing Paper.js JSON export data.
>      * A string containing escaped SVG XML content.
>      * A string containing the path to a server accessible SVG file.
>  * `"vectorize"`
>    * Reinterprets an image as vector paths based on the given settings.
>    * The `body` key value should be either:
>      * A raster image content in [Base64 URI format](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs)
>      * A path to a server accessible raster image.
>
>#### Operations for `job`:
>  * `"trace"`, `"fill"`, & `"full"`
>    * The `body` key value should be either:
>      * A singular or compound path in the standard SVG `d` format.
>      * A singular or compound path in a Paper.js JSON export string.
>  * `"text"`
>    SVG path attribute data format, and will trace, fill, or both.
>    * `body` key expects the string you want to be rendered as text, including
>    newlines.

## ▶ `"bounds": { ... }` (optional)
The `bounds` object is likely the most important key as it defines how your paths
will be positioned within the canvas, and without it, the direct pixel -> mm
mapping would likely leave your paths at entirely the wrong scale/position.

Internally, this uses the
[Paper.js Rectangle definition standard](http://paperjs.org/reference/rectangle/#rectangle-object)
applied _directly_ via [`fitBounds`](http://paperjs.org/reference/group/#fitbounds-rectangle),
ensuring that the shape(s) are both positioned and sized, retaining aspect ratio,
within the defined rectangle.

```javascript
// From/To style: Fit the path(s) within a rectangle that has its
//   * Top left corner at X: 10mm, Y: 10mm
//   * Bottom right corner at X: 200mm, Y: 150mm
"bounds": {
    "from": [10, 10],
    "to": [200, 150]
}

// Point/Size style: Fit the path(s) within a rectangle that has its
//   * Top left corner at X: 10mm, Y: 10mm
//   * Width is 190mm and height is 140mm
"bounds": {
    "point": [10, 10],
    "size": [190, 140]
}
```
These styles are entirely interchangable and both examples above define the same
bounding rectangle. Both are used across the code, usually depending on what
makes the most sense in context. If you're placing a single object at a specific
place within the canvas, point/size may make the most sense. If you're simply
defining a margin around the entire canvas for a project, from/to style likely
makes more sense.

Default bounds apply to set a reasonable margin without this argument, ensure
you set this to your desired bounds or expect your path(s) to be fit within the
the entire canvas less 5mm around the edge.

## ▶ `"settings": { ... }` (optional)
Though each action/operation will use the `settings` key to define _how_ it
operates, there is no standard between them for what the contents of the object
are. Unsupported object keys passed here will simply be ignored, and if the
settings are omitted or invalid, they will default. No storage of per-request
settings are saved between requests to maintain statelessness, so this must be
managed within the client. See the web based interface for how that's managed.


Actions API Examples: `GET`
===========================

TODO: Examples of parsing lists, getting action details

## The following docs are incomplete and represent unfinished functionality, tread with caution

* * *

### POST /v1/actions
Endpoint for creating an action, as described above, either a `project`, or a
`job`.

**Important notes:**
  * All actions are drawn/rendered on an absolute coordinate canvas **measured
  in _millimeters_** as defined by bot settings. All examples and expected
  inputs for positioning and resizing use this as a base.
  * All input coordinates found in source SVG paths are mapped over to the
  internal millimeter based canvas through the `bounds` object detailed below.
  All project contents are resized and positioned based on this bounds
  definition _together_, but jobs must use their own bounds, or they will fill
  the drawable area of the canvas.
  * Customized server managed settings for the incredibly complicated set of
  rendering options available for each project/job type are **not** available.
  There is a set of defaults, but only for the sake of fallback and sanity
  checking. Every single request needs to send all adjustments to default
  settings every time to keep the API as stateless and true to ReST ideals as
  possible.


#### Request - Create project
```javascript
POST /v1/actions
Content-Type: application/json; charset=UTF-8

{
    "type": "project",
    "operation": "full",
    "name": "testfile.svg",
    "body": "<SVG version='1.1' ...",
}
```
#### Request - Create job
```javascript
POST /v1/actions
Content-Type: application/json; charset=UTF-8

{
    "type": "project",
    "parent": null,
    "operation": "trace",
    "name": "path-42",
    "body": "M201.6,195.7c0.4,0.2,...",
    "bounds": {
        "from": [50, 50],
        "to": [150, 150]
    }
}
```

### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    ... complete job details
}
```

##### Usage Notes
 * Because actions are high level, all coordinates are in absolute millimeter
 measurements.
 * `type`: should be `job` or `project`.
 * `bounds`: represents coordinates or top left and bottom right of a rectangle
 that the incoming path (or SVG) will be forced to fit into the destination
 coordinate plane. If omitted, coordinates in the path will be used as is _which
 may result in some very bad scaling issues_. Preprocess your paths, or submit
 an SVG which will be bound together with all paths.
 * `type: job`: takes a single SVG path "`d`" format in the `body` key data
 * `type: project`: takes an XML SVG string in the `body` key data


Colors: How to draw with different things
=========================================
In previous versions, all color and drawing management remained firmly in the
realm of the implementing client. With version 3, we intend to implement the
absolute basics of color based vector separation, splitting work for action
based high level drawing using nearest color to matching active color set entry.

**For Axidraw (and other single pen based drawing bots):**
 * Only one color will be available by default, no color separation is expected.
 * If more than one color is given in current color set, colors matching the
 closest to the ones in the colorset will be grouped as separate work and
 displayed with their configured color in the preview.
 * When actually drawing, the pen will be parked, then the user be alerted via
 the socket API. After confirmation that the new color/implement has been
 switched, drawing can be resumed.

**For WaterColorBot (and single pen drawing bots configured to use paint):**
 * On startup an 8 item default color set will be set via bot support
 * Color separation will happen automatically, and when drawing commences for a
 color, it will change to the tool matching the matching color machine name id.
 * Water wash, paint refill, etc will be handled by bot support.


### GET /v1/colors


#### Response - Current set default
```javascript
GET /v1/colors
Content-Type: application/json; charset=UTF-8
{
    "set": [
      {
        "id": "color0",
        "name": "Black",
        "color": "#000000"
      }
    ],
    "presets": [
      {...}
    ]
}
```

#### Response - Current set customized
```javascript
GET /v1/colors
Content-Type: application/json; charset=UTF-8
{
    "set": [
      {
        "id": "color0",
        "name": "Black watercolor",
        "color": "#000000"
      },
      {
        "id": "pencolor1",
        "name": "Red sharpie",
        "color": "#FF0000"
      },
      {...}
    ],
    "presets": [
      {...}
    ]
}
```

##### Usage Notes
 * ???


### POST /v1/colors

#### Request: Add a color to the set
```javascript
POST /v1/colors
Content-Type: application/json; charset=UTF-8

{
  "id": "color1",
  "name": "Blue",
  "color": "#0000FF"
}
```

#### Request: Revert colorset to a preset
```javascript
POST /v1/colors
Content-Type: application/json; charset=UTF-8

{
  "preset": "crayola-tertiary"
}
```

### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
  // Duplicates response of GET /v1/colors with new colorset additions
  ...
}
```

##### Usage Notes
 * Color machine name/ID is arbitrary, but be sure to match it with a tool name
 for it to trigger the tool change, or expect a socket based wait/confirm tool
 change. This allows for pencil/pen swaps on watercolor projects.
 * Setting to a preset will completely replace the current colorset.
 * Presets come with standard `color[n]` style names to match with WaterColorBot
 tools.

### GET /v1/colors/{colorid}

#### Request: View details for a color
```javascript
GET /v1/colors/color1
Content-Type: application/json; charset=UTF-8

{
  "id": "color1",
  "name": "Blue",
  "color": "#0000FF"
}
```

### Delete /v1/colors/{colorid}

#### Request: Remove color from the set
```javascript
GET /v1/colors/color1
Content-Type: application/json; charset=UTF-8

{
  "status": "removed"
}
```

##### Usage Notes
 * Deleting removes the information about the color from the set.
 * Removing the last item of the colorset will simply revert it to default black
 as there's always one color assumed.

