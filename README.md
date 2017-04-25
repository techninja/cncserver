CNC server
=========
A node.js based RESTful API to serial interface control for plotters, originally
created for ["Super-Awesome" Sylvia's WaterColorBot](http://watercolorbot.com),
the awesome pen plotter that paints with watercolors, thought up by
[MakerSylvia](http://twitter.com/makersylvia) and produced by the incredible
staff at [Evil Mad Scientist](http://http://www.evilmadscientist.com).

## Features
CNC Server is an application that sits on a computer connected to your serial
based CNC peripheral and provides a [simple RESTful API](API.md) to access
common CNC/plotter functions. These controls manifest as an abstracted method of
controlling the bot to do what you ask while sanity checking and keeping crashes
down to a minimum.
 * Fast HTTP server via [Express](http://expressjs.com)
 * Runs great on even modest hardware. Raspberry Pi verified!
 * Self manages absolute pen position for relative motion plotter controllers.
 * Multiple API endpoints allow full control, motor overrides and "tool" changes.
Read [the documentation](API.md) and implement *your own* client!
 * An even simpler [API](SCRATCH.API.md) allows for Scratch programming support, with [examples](https://github.com/evil-mad/watercolorblocks).
 * Accepts direct X/Y absolute pen positions as percentage of total width/height.
 * Client agnostic! We don't care what controls the bot, as long as it follows
the rules. See it in use by [US President Barack Obama on an iPad](http://www.youtube.com/watch?v=2HfgGDOZPCQ&feature=player_embedded#t=1992s)!
 * Configuration file and argument driven (see
[example here](machine_types/watercolorbot.ini)), allows for server
customization to fit *almost* any style of bot using a supported controller.

## Installation

#### Preamble: User or Developer?
CNC Server provides the API used by the WaterColorBot and the RoboPaint
application, but **if you're looking to just get your bot up and running, you
should head over to the main
[RoboPaint page](http://github.com/evil-mad/robopaint) and download the installer
for your system.**

If you're a developer looking to make your own API client or interface, then
continue on!

#### Install Node.js
CNC Server runs on node.js!  Download
[the installer for your operating system](http://www.nodejs.com/download), following
the instructions, and you should be up and running with node! To run a node
application, simply type `node filename.js` into a command line or terminal.

#### Install npm
**npm** is the **N** ode **P** ackage **M** anager, and it makes installing stuff
*really* easy. If you used the node installer for Windows or Mac, you should
already have it! On Linux, (with curl installed), as an admin, simply run
`curl https://www.npmjs.com/install.sh | sh` in a terminal. If you're having
trouble read [here](https://www.npmjs.com/doc/README.html).

#### CNC server files
 * **For easy updating from master:** Use the handy GUI! Click the
"Clone in Mac/Windows" button at the top of the
[GitHub repo homepage](https://github.com/techninja/cncserver). When new code
updates come along, just click the refresh/sync button and you'll be up to date!
 * **For quick use:** Download the files
[here](https://github.com/techninja/cncserver/archive/master.zip), unzip them to
a handy folder, and you're ready to run!
 * **For developers looking to improve it:** Fork the repo, make your changes in
a branch, and submit a pull request! We're always looking for contributions that
make things better for everyone, fix issues, or add features!

#### Installing NPM Dependencies
With your system setup and everything else installed, open a terminal and make your
way to the `cncserver` folder, and enter `npm install` (you may need to preface
that with a sudo command on Mac/Linux). For Mac, building `node-serialport`
requires `make`, which comes with Xcode, a free download.

## Running
CNC Server *currently* only supports the late model
[EBB](http://www.schmalzhaus.com/EBB/) and its command set. Of the devices that
use it, the WaterColorBot, the EggBot, and AxiDraw have reliable support. More
devices to come soon!

Plug in your device, and from the terminal in the `cncserver` repository root
folder, start the server with the command `npm start`, and you've got it!

Once the server is up and running, the API should now be available at
`http://localhost:4242`. The `4242` is the port on the local computer, which you
can easily change in the configuration shown below.

### Configuration
By default, CNC Server hosts the API on the localhost port `4242`
and attempts to autodetect the correct serial port to connect to for the given
bot configuration. If you want to tweak these settings or any other global
configuration permanently, just edit the `config.ini` file that is generated on
first run and stored in the same folder as `cncserver.js`. If you want to make
temporary config adjustments, just pass the same config names and values when
executing. Common examples might include:
```
# Change the hosting port to HTTP default, and force the serial port (no equals)
node cncserver --httpPort 80 --serialPath /dev/ttyUSB1243

# Change bot type to EggBot, and invert the X motor axis (with equals)
node cncserver --botType=eggbot --invertAxis:x=true
```

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
[Evil Mad Scientist](http://evilmadscientist.com). Don't forget, you can
discover more crazy maker fun with
[Sylvia's Super-Awesome Maker Show](http://sylviashow.com)!
