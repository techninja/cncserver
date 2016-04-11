/*jslint node: true */
"use strict";

/*
 * Code re-use for managing child cncserver.
 */

// Our very own copy of CNC Server running for tests!
var spawn = require('child_process').spawn;
var cncserver = spawn('node', ['cncserver', '--showSerial=true']);
exports.path = "http://localhost:4242/";

// Array string storage for every line output from
exports.out = [];
exports.err = [];


// Add data to start of arrays to allow referencing of lines directly from
// newest at [0] to oldest [n].
cncserver.stdout.on('data', function(data){
  var d = data.toString().split('\n');

  // Split the data by newlines, add each to the data.
  for(var i in d) {
    if (d[i].length) exports.out.unshift(d[i]);
  }

  //console.log('STDOUT: ' + data); // TODO: Make this triggerable on test run
});

cncserver.stderr.on('data', function (data) {
  exports.err.unshift(data.toString());
  //console.log('stderr: ' + data);
});

exports.isReady = 0;
exports.ready = function(callback) {
  console.log('Waiting for CNCServer to startup...');
  var initWait = setInterval(function(){
    if (strInArray('ready to receive commands')) {
      clearInterval(initWait);
      console.log('CNCServer ready! Lets start testing.\n==================\n');
      exports.isReady = true;
      if (callback) callback();
    }
  }, 50);
};

exports.kill = function(callback){
  console.log('Killing child process ' + cncserver.pid  + '...');
  cncserver.kill('SIGINT');
  if (callback) callback();
};


exports.waitFor = function(v, callback) {
  if (v()) {
    callback();
  } else {
    setTimeout( function(){ exports.waitFor(v, callback); }, 250);
  }
};

/**
 * Util function, does a string exist in the array of strings?
 *
 * @param {type} str
 *   String to find within a string in the array.
 * @param {type} ar
 *   Array to search. Will default to global "out" array;
 * @returns {Boolean}
 *   True if string exists anywhere in array, false if not.
 */
exports.said = strInArray;
function strInArray(str, ar) {
  if (typeof ar === 'undefined') {
    ar = exports.out;
  }

  for (var i in ar) {
    if (ar[i].indexOf(str) !== -1) {
      return true;
    }
  }

  return false;
}

exports.clear = function (){ exports.out = []; exports.err = []; };
