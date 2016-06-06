/*jslint node: true */
/*global describe, it, before, after */
"use strict";

var chai = require('chai');
var expect = chai.expect;
var cncserver = require('./spawn/spawn-server.js');
var path = cncserver.path;
var req = require('request');
var isCentered = false;

cncserver.ready();

describe('ScratchTests', function(){

  // Only start tests when CNCserver is initialized and ready.
  before(function( done ){
    cncserver.waitFor(function(){return cncserver.isReady;}, done);
  });

  describe('Init start', function(){
    it('should be on by default', function(){
      expect(
        cncserver.said('Scratch v2 Programming support ENABLED')
      ).to.equal(true);
    });

    it('[pen.up] put the pen up for the rest of the way', function(done){
      req.get(path + 'pen.up').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[2]).to.contain('SC,5,19750'); // Set Position
          expect(cncserver.out[1]).to.contain('SP,0'); // Go to position
          expect(cncserver.out[0]).to.contain('SM,384,0,0'); // Block till done.
          done();
        }, 150); // Eat up the whole time taken for move
      });
    });

    it('[coord] move to the center from park (3833, 1800)', function(done){
      req.get(path + 'coord/0/0').on('response', function(){
        isCentered = true;
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,2732,3833,1800');
          expect(cncserver.out[1]).to.equal('Move pen to coord 3832.5 1800');
          done();
        }, 1500); // Take up some of the 2.8s the initial move takes
      });
    });

    // Continue tests once we're centered.
    after(function( done ){
      cncserver.waitFor(function(){return isCentered;}, done);
    });
  });

  describe('Basic Moving (forward, right, left, toward, absturn)', function(){
    it('[forward] move 10 steps (100 steppers steps right)', function(done){
      req.get(path + 'move.forward./10').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,65,100,0');
          expect(cncserver.out[1]).to.equal('Move pen by 10 steps');
          done();
        }, 1500); // Eat up the rest of the 2.8s from the initial move.
        // Later commands should be faster
      });
    });

    it('[right] turn right 90deg to 90deg (no movement)', function(done){
      req.get(path + 'move.right./90').on('response', function(){
        expect(cncserver.out[0]).to.equal('Rotate right 90 deg. to 90 deg.');
        done();
      });
    });

    it('[forward] move 10 steps down (100 steppers steps)', function(done){
      req.get(path + 'move.forward./10').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,65,0,100');
          expect(cncserver.out[1]).to.equal('Move pen by 10 steps');
          done();
        }, 100);
      });
    });

    it('[right] turn right 90deg to 180deg (no movement)', function(done){
      req.get(path + 'move.right./90').on('response', function(){
        expect(cncserver.out[0]).to.equal('Rotate right 90 deg. to 180 deg.');
        done();
      });
    });

    it('[forward] move 10 steps left (100 steppers steps)', function(done){
      req.get(path + 'move.forward./10').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,65,-100,0');
          expect(cncserver.out[1]).to.equal('Move pen by 10 steps');
          done();
        }, 100);
      });
    });

    it('[right] turn right 90deg to 270deg (no movement)', function(done){
      req.get(path + 'move.right./90').on('response', function(){
        expect(cncserver.out[0]).to.equal('Rotate right 90 deg. to 270 deg.');
        done();
      });
    });

    it('[forward] should move 10 steps up (100 steppers steps)', function(done){
      req.get(path + 'move.forward./10').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,65,0,-100');
          expect(cncserver.out[1]).to.equal('Move pen by 10 steps');
          done();
        }, 100);
      });
    });

    it('[left] should turn left 90deg to 180deg (no movement)', function(done){
      req.get(path + 'move.left./90').on('response', function(){
        expect(cncserver.out[0]).to.equal('Rotate left 90 deg. to 180 deg.');
        done();
      });
    });

    it('[forward] move 10 steps left (100 steppers steps)', function(done){
      req.get(path + 'move.forward./10').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,65,-100,0');
          expect(cncserver.out[1]).to.equal('Move pen by 10 steps');
          done();
        }, 100);
      });
    });

    it('[toward] turn towards (0,0) to 0deg (no movement)', function(done){
      req.get(path + 'move.toward./0/0').on('response', function(){
        expect(cncserver.out[0]).to.equal(
          'Rotate relative towards 3832.5,1800 from 3733, 1800 to 0 deg'
        );
        done();
      });
    });

    it('[absturn] turn to 270deg (no movement)', function(done){
      req.get(path + 'move.absturn./270').on('response', function(){
        expect(cncserver.out[0]).to.equal(
          'Rotate to 270 scratch degrees (actual angle 180deg)'
        );
        done();
      });
    });

    it('[forward] move -10 steps right (-100 steppers steps)', function(done){
      req.get(path + 'move.forward./-10').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.contain('SM,65,100,0');
          expect(cncserver.out[1]).to.equal('Move pen by -10 steps');
          done();
        }, 100);
      });
    });

    it('[poll] be in a specific location/angle', function(done){
      req(path + 'poll', function(err, response, body){ // jshint unused:false
        expect(body).to.contain('x 0.05'); // Rounding error? :P
        expect(body).to.contain('y 0');
        expect(body).to.contain('angle 270');
        done();
      });
    });
  });

  //============================================================================
  //============================================================================

  describe('Draw outside area (forward, left, absturn, pen.down)', function(){
    it('[absturn] should turn to 0deg (no movement)', function(done){
      req.get(path + 'move.absturn./0').on('response', function(){
        expect(cncserver.out[0]).to.equal(
          'Rotate to 0 scratch degrees (actual angle -90deg)'
        );
        done();
      });
    });

    it('[pen.down] put the pen down for drawing', function(done){
      req.get(path + 'pen.down').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[2]).to.contain('SC,5,12750'); // Set Position
          expect(cncserver.out[1]).to.contain('SP,0'); // Go to position
          expect(cncserver.out[0]).to.contain('SM,136,0,0'); // Block till done.
          done();
        }, 15); // Eat up the whole time taken for move
      });
    });

    it('[forward] attempt to move 500 steps, limited by area', function(done){
      req.get(path + 'move.forward./500').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[5]).to.equal('Move pen by 500 steps');
          expect(cncserver.out[4]).to.contain('SM,1161,0,-1800');
          expect(cncserver.out[3]).to.equal(
            'Skipping buffer to set height: 19750' // Buffer skipped lift
          );
          expect(cncserver.out[2]).to.contain('SC,5,19750'); // Set Position
          expect(cncserver.out[1]).to.contain('SP,0'); // Go to position
          expect(cncserver.out[0]).to.contain('SM,136,0,0'); // Block till done.

          done();
        }, 1500); // Eat up the whole time taken to move there
      });
    });

    it('[poll] should be at -500 y, pointing up (off canvas)', function(done){
      req(path + 'poll', function(err, response, body){ // jshint unused:false
        expect(body).to.contain('y -500');
        expect(body).to.contain('angle 0');
        done();
      });
    });


    it('[left] turn left 90deg to 180deg (left, no movement)', function(done){
      req.get(path + 'move.left./90').on('response', function(){
        expect(cncserver.out[0]).to.equal('Rotate left 90 deg. to 180 deg.');
        done();
      });
    });

    it('[forward] move 20 steps left (200 stepper steps)', function(done){
      req.get(path + 'move.forward./20').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[1]).to.equal('Move pen by 20 steps');
          expect(cncserver.out[0]).to.contain('SM,129,-200,0');
          done();
        }, 200); // Eat up the whole time taken to move there
      });
    });

    it('[left] turn left 90deg to 90deg (down, no movement)', function(done){
      req.get(path + 'move.left./90').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[0]).to.equal('Rotate left 90 deg. to 90 deg.');
          done();
        }, 10);
      });
    });

    it('[forward] move 100 steps down (0 actual stepper steps)', function(done){
      req.get(path + 'move.forward./100').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[1]).to.equal('Move pen by 100 steps');
          expect(cncserver.out[0]).to.contain('Not moved any distance');
          done();
        }, 50);
      });
    });

    it('[forward] move 400 steps down (1800 stepper steps)', function(done){
      req.get(path + 'move.forward./400').on('response', function(){
        setTimeout(function(){
          expect(cncserver.out[5]).to.equal('Move pen by 400 steps');
          expect(cncserver.out[4]).to.equal('Go back to: draw'); // last height
          expect(cncserver.out[3]).to.contain('SC,5,12750'); // Set Position
          expect(cncserver.out[2]).to.contain('SP,0'); // Go to position
          expect(cncserver.out[1]).to.contain('SM,136,0,0'); // Block till done
          expect(cncserver.out[0]).to.contain('SM,1161,0,1800'); // Move
          done();
        }, 1800); // Eat up the whole time taken to move there
      });
    });
  });

  //============================================================================
  //============================================================================

  describe('Shut Down internal testing server...', function(){
    this.timeout(8000);
    it('parking & turning off motors', function(done){
      req.del(path + "v1/pen").on('response', function(){
        req.del(path + "v1/motors").on('response', function(){
          done();
        });
      });
    });

    // The last sub-group should be the one to kill the server.
    after(function(done){
      cncserver.kill(done);
    });
  });
});
