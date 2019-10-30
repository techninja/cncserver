# CNC Server HTTP API [v1] - Actions

This file defines and documents _only_ the high level drawing "Actions" RESTful
API resource for complex automation and job management. If you haven't read it
yet, see the full [low level API documentation](API.md) first.

> ### _QUICK NOTE:_
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
>    * The `body` key should be either SVG XML content, or path to a server
>    accessible SVG file. If "trace", only the outlines of paths will be drawn,
>    if "fill", only the fill operation will be run on all paths. If "full", both
>    will be run.
>  * `"vectorize"`
>    * The `body` key should be either raster image content in
>    [Base64 URI format](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs)
>    or a path to a server accessible raster image file that will be
>    reinterpreted as vector paths based on the given settings.
>
>#### Operations for `job`:
>  * `"trace"`, `"fill"`, & `"full"`
>    * The `body` key expects a singular or compound path in the standard `d`
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
