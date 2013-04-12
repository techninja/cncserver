CNC server
=========
A node.js web server based serial interface control for plotters, built for
[Super Awesome Sylvia's WaterColorBot](http://watercolorbot.com), built and
produced by the incredible staff at
[Evil Mad Scientist](http://http://www.evilmadscientist.com).

## Installation

#### Install Node.js
CNC Server runs on node.js!  Download
[the installer for your operating system](http://nodejs.org/download), following
the instructions, and you should be up and running with node! To run a node
application, simply type `node filename.js` into a command line or terminal.

#### Install npm
**npm** is the **n**ode **p**ackage **m**anager, and it makes installing stuff
*really* easy. If you used the node installer for Windows or Mac, you should
already have it! On Linux, (with curl installed), as an admin, simply run
`curl https://npmjs.org/install.sh | sh` in a terminal. If you're having
trouble read [here](https://npmjs.org/doc/README.html).

#### CNC server files
 * **For easy updating during alpha phase:** Use the handy GUI! Click the
"Clone in Mac/Windows" button at the top of the
[GitHub repo homepage](https://github.com/techninja/cncserver). When new code
updates come along, just click the refresh/sync button and you'll be up to date!
 * **For quick use:** Download the files
[here](https://github.com/techninja/cncserver/archive/master.zip), unzip them to
a handy folder, and you're ready to run!
 * **For Devs:** clone the repo via the usual way to a handy folder, or fork the
repo and submit a pull request, we're always looking for contributions that make
things better for everyone!

#### Installing NPM Dependencies
With your system setup and everything else installed, open a terminal and make your
way to the `cncserver` folder, and enter `npm install` (you may need to preface
that with a sudo command on Mac/Linux). For Mac, building `node-serialport`
requires `make`, which comes with Xcode, a free download.

## Running
CNC Server *currently* only supports the late model
[EBB](http://www.schmalzhaus.com/EBB/) and its command set. Of the devices that
use it, ***only*** the WaterColorBot Beta, with EggBot support next. More
devices to come soon!

Plug in your device, and from the terminal in the cncserver folder, start the
server with the command `node cncserver.js`, and you've got it!

Once the server is up and running, the website should now be available at
`http://localhost:4242`. The `4242` is the port on the local computer, which you
can easily change in the configuration shown below.

### Configuration
By default, CNC Server hosts the client site and API on the localhost port `4242`
and attempts to autodetect the correct serial port to connect to. If you want to
tweak these settings or any other global configuration permanently, just edit
the `config.ini` file that is generated on first run. If you want to make
temporary config adjustments, just pass the same config names and values when
executing. Common examples might include:
```
# Change the hosting port to HTTP default, and force the serial port
node cncserver --httpPort 80 --serialPath /dev/ttyUSB1243

# Change bot type to EggBot, and invert the X motor axis
node cncserver --botType=eggbot --invertAxis:x=true
```

## Features

CNC Server comes as two component parts, a client web app, and a server
application. The server hands over the client via HTTP, but beyond that, the
client only communicates to the server via a [simple RESTful API](API.md). These
controls manifest as an abstracted method of controlling the bot to do what you
ask while sanity checking and keeping crashes down to a minimum.

### Client
 * Web application tested for all modern mobile and desktop web browsers.
 * Real-time SVG preview and shape tracing, with fully automatic path filling,
color similarity chooser, and outline manager.
 * Path tracing for fills, allowing for an infinite array of creative path based
crosshatches .
 * Uses visual path position checking, ensuring that overlapping or invisible
portions of paths aren't drawn.

### Server
 * Fast HTTP server via [Express](http://expressjs.com) allows for full stack
web application and extensions.
 * Runs great on even modest hardware. Raspberry Pi verified!
 * Self manages absolute pen position.
 * 3 API endpoints allow full pen control, motor overrides and tool changes.
Read [the documentation](API.md) and implement *your own* client!
 * Accepts direct X/Y absolute pen positions as percentage of total width/height.
 * Client agnostic! We don't care what controls the bot, as long as it follows
the rules. (iPad app coming soon!)
 * Configuration file and argument driven (see
[example here](machine_types/watercolorbot.ini)), allows for server
customization to fit *almost* any style of bot.

## Problems?
***Stuck on something?*** Submit an issue! Click the
[issues tab](https://github.com/techninja/cncserver/issues) and see if someone
is covering your question or problem, if not, ask away! Someone will be around
to help soon.

***Know how to fix a problem? Or want to add a new feature??*** Submit a pull
request! Just fork the repo using the button on the
[cncserver github homepage](https://github.com/techninja/cncserver), and this
will give you your own version of cncserver. Make your change in a few commits
to your branch, then click the pull request button at the top! Talk about what
changes you made and submit. A maintainer of the project will check your work,
possibly ask you to fix a few more things, and then if all is well, your work
will be merged into the project!

## ETC.

All code MIT licensed. Created by TechNinja, with support and collaboration from
[Evil Mad Scientist](http://evilmadscientist.com).
