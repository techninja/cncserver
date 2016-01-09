/*jslint node: true */
/*global describe, it, beforeEach, afterEach */
"use strict";

var chai = require('chai');
var expect = chai.expect;
var rewire = require('rewire');
var cncserver_mod = rewire("../cncserver.js");

var cncserver = cncserver_mod.__get__("cncserver");
var autoDetectPort = cncserver_mod.__get__("autoDetectPort");

describe('autoDetectPort', function(){

  function setPlatform(mockPlatform) {
    Object.defineProperty(process, 'platform', {
      value: mockPlatform
    });
  }

  beforeEach( function(){
    cncserver.gConf.set('serialPath', "{auto}");

    // save original process.platform
    this.originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach( function(){
    // restore original process.platfork
    Object.defineProperty(process, 'platform', this.originalPlatform);
  });


  // Test example botConf configuration
  var botConfController = { manufacturer: "SchmalzHaus",
                            name: "EiBotBoard",
                            vendorId: "0x04d8",
                            productId: "0xfd92"
                          };

  it('autodetects El Capitan port listing for EiBotBoard', function(){
    setPlatform('darwin');
    var elCapitanPortListing = {
      comName: '/dev/cu.usbmodem411',
      manufacturer: 'SchmalzHaus',
      serialNumber: '',
      pnpId: '',
      locationId: '0x04100000',
      vendorId: '0x04d8',
      productId: '0xfd92'
    };

    autoDetectPort(elCapitanPortListing, botConfController);
    expect(cncserver.gConf.get('serialPath')).to.equal(elCapitanPortListing.comName);
  });

  it('autodetects Ubuntu port listing for EiBotBoard', function(){
    setPlatform('linux');
    var ubuntuPortListing = {
      comName: '/dev/ttyACM0',
      manufacturer: 'SchmalzHaus',
      serialNumber: 'SchmalzHaus_EiBotBoard',
      pnpId: 'usb-SchmalzHaus_EiBotBoard-if00',
      vendorId: '0x04d8',
      productId: '0xfd92'
    };

    autoDetectPort(ubuntuPortListing, botConfController);
    expect(cncserver.gConf.get('serialPath')).to.equal(ubuntuPortListing.comName);
  });

  it('autodetects Windows port listing for EiBotBoard', function(){
    setPlatform('win32');
    var windowsPortListing = {
      comName: 'COM3',
      manufacturer: 'SchmalzHaus LLC',
      serialNumber: '',
      pnpId: 'USB\\VID_04D8&PID_FD92\\6&10988163&0&8',
      locationId: '',
      vendorId: '',
      productId: ''
    };

    autoDetectPort(windowsPortListing, botConfController);
    expect(cncserver.gConf.get('serialPath')).to.equal(windowsPortListing.comName);
  });
});
