#!/usr/bin/env node

"use strict";

var tape = require('blue-tape');

global.Zmodem = require('./lib/zmodem');
const helper = require('./lib/testhelp');

var zmlib = Zmodem.ZMLIB;
var ZDLE = Zmodem.ZDLE;

tape('round-trip', function(t) {
    var zdle = new ZDLE( { escape_ctrl_chars: true } );

    var times = 1000;

    t.doesNotThrow(
        () => {
            for (let a of Array(times)) {
                var orig = helper.get_random_octets(38);
                var enc = zdle.encode( orig.slice(0) );
                var dec = ZDLE.decode( enc.slice(0) );

                var orig_j = orig.join();
                var dec_j = dec.join();

                if (orig_j !== dec_j) {
                    console.error("Original", orig.join());
                    console.error("Encoded", enc.join());
                    console.error("Decoded", dec.join());

                    throw 'mismatch';
                }
            }
        },
        `round-trip`
    );

    t.end();
} );
