#!/usr/bin/env node

"use strict";

var tape = require('tape');

global.Zmodem = require('../zmodem');

require('../zmlib');
require('../zdle');

var zmlib = Zmodem.ZMLIB;
var ZDLE = Zmodem.ZDLE;

tape('round-trip', function(t) {
    var zdle = new ZDLE( { escape_ctrl_chars: true } );

    var times = 1000;

    t.doesNotThrow(
        () => {
            for (var a=0; a<1000; a++) {
                var orig = zmlib.get_random_octets(38);
                var enc = zdle.encode( orig.slice(0) );
                var dec = ZDLE.decode( enc.slice(0) );

                var orig_j = JSON.stringify(orig);
                var dec_j = JSON.stringify(dec);

                if (orig_j !== dec_j) {
                    throw( "Orig: " + orig_j + "\nDecd: " + dec_j );
                }
            }
        },
        `round-trip: ${times} times`
    );

    t.end();
} );
