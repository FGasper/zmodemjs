#!/usr/bin/env node

"use strict";

var tape = require('blue-tape');

var Zmodem = require('../src/zmodem');

var ZText = Zmodem.Text;

const TEXTS = [
    [ "-./", [45, 46, 47] ],
    [ "épée", [195, 169, 112, 195, 169, 101] ],
    [ "“words”", [226, 128, 156, 119, 111, 114, 100, 115, 226, 128, 157] ],
    [ "🍊", [240, 159, 141, 138] ],
    [ "🍊🍊", [240, 159, 141, 138, 240, 159, 141, 138] ],
];

tape('decoder', function(t) {
    var decoder = new ZText.Decoder();

    TEXTS.forEach( (tt) => {
        t.is(
            decoder.decode( new Uint8Array(tt[1]) ),
            tt[0],
            `decode: ${tt[1]} -> ${tt[0]}`
        );
    } );

    t.end();
} );

tape('encoder', function(t) {
    var encoder = new ZText.Encoder();

    TEXTS.forEach( (tt) => {
        t.deepEquals(
            encoder.encode(tt[0]),
            new Uint8Array( tt[1] ),
            `encode: ${tt[0]} -> ${tt[1]}`
        );
    } );

    t.end();
} );
