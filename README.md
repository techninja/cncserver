# CNC server

<img src="https://github.com/techninja/cncserver/blob/v3/src/interface/icon.png?raw=true" style="float: right">

A [Node.js](https://nodejs.org/) based RESTful API to serial interface control for plotters, originally
created for the [WaterColorBot](http://watercolorbot.com), currently aimed at [EBB controller](https://shop.evilmadscientist.com/productsmenu/188) based plotters from [Evil Mad Scientist Laboratories](https://www.evilmadscientist.com/) like
[Axidraw](https://axidraw.com/), [Eggbot](https://egg-bot.com/), and other DIY implementations.

The purpose of the project is to abstract the nitty-gritty details for controlling a drawing robot, and utilizing proven web technologies, to simplify the interface and make drawing bots easier and more useful, either at your desk with a GUI, or via your own script running remotely.

## Features

CNC Server is an application that sits on a computer connected to your serial
based CNC peripheral and provides a [simple RESTful API](API.md) to access
common CNC/plotter functions. These controls manifest as an abstracted method of
controlling the bot to do what you ask while sanity checking and keeping crashes
down to a minimum.

- Fast HTTP server via [Express](http://expressjs.com)
- Runs great on even modest hardware. Raspberry Pi verified!
- Self manages absolute pen position for relative motion plotter controllers.
- Multiple API endpoints allow full control, motor overrides and "tool" changes.
  Read [the documentation](API.md) and implement _your own_ client!
- An even simpler [API](SCRATCH.API.md) allows for Scratch programming support, with [examples](https://github.com/evil-mad/watercolorblocks).
- Accepts direct X/Y absolute pen positions as percentage of total width/height.
- Client agnostic! We don't care what controls the bot, as long as it follows
  the rules. See it in use by [US President Barack Obama on an iPad](https://youtu.be/2HfgGDOZPCQ?t=1928)!
- Configuration file and argument driven (see
  [example here](machine_types/watercolorbot.ini)), allows for server
  customization to fit _almost_ any style of bot using a supported controller.

## Installation

### Install Node.js

Unless you already have it installed, either download [the installer for your operating system](http://www.nodejs.com/download), or use [node version manager](https://github.com/nvm-sh/nvm). We recommend using at least version 18+, although lower versions may work.

### CNC server files

- **For easy updating from master:** Use the handy GUI! Click the
  "Clone in Mac/Windows" button at the top of the
  [GitHub repo homepage](https://github.com/techninja/cncserver). When new code
  updates come along, just click the refresh/sync button and you'll be up to date!
- **For quick use:** Download the files
  [here](https://github.com/techninja/cncserver/archive/master.zip), unzip them to
  a handy folder, and you're ready to run!
- **For developers looking to improve it:** Fork the repo, make your changes in
  a branch, and submit a pull request! We're always looking for contributions that
  make things better for everyone, fix issues, or add features!

### Installing NPM Dependencies

With your system setup and everything else installed, open a terminal and make your
way to the `cncserver` folder, and enter `npm install` (you may need to preface
that with a sudo command on Mac/Linux). For Mac, building `node-serialport`
requires `make`, which comes with Xcode, a free download.

## Running

CNC Server _currently_ only supports the late model
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

**_Stuck on something?_** Submit an issue! Click the
[issues tab](https://github.com/techninja/cncserver/issues) and see if someone
is covering your question or problem, if not, ask away! Someone will be around
to help soon.

**_Know how to fix a problem? Or want to add a new feature??_** Submit a pull
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
