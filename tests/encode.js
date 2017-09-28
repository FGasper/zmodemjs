#!/usr/bin/env node

"use strict";

var tape = require('tape');

var Zmodem = require('../zmodem');

var enclib = Zmodem.ENCODELIB;

tape('round-trip: 32-bit little-endian', function(t) {
    var times = 1000;

    t.doesNotThrow(
        () => {
            for (var a=0; a<times; a++) {
                var orig = Math.floor( 0xffffffff * Math.random() );

                var enc = enclib.pack_u32_le(orig);
                var roundtrip = enclib.unpack_u32_le(enc);

                if (roundtrip !== orig) {
                    throw( `Orig: ${orig}, Packed: ` + JSON.stringify(enc) + `, Parsed: ${roundtrip}` );
                }
            }
        },
        `round-trip 32-bit little-endian: ${times} times`
    );

    t.end();
} );

tape('unpack_u32_le', function(t) {
    t.equals(
        enclib.unpack_u32_le([222,233,202,254]),
        4274711006,
        'unpack 4-byte number'
    );

    var highest = 0xffffffff;
    t.equals(
        enclib.unpack_u32_le([255,255,255,255]),
        highest,
        `highest number possible (${highest})`
    );

    t.equals(
        enclib.unpack_u32_le([1, 0, 0, 0]),
        1,
        '1'
    );

    t.end();
});

tape('unpack_u16_be', function(t) {
    t.equals(
        enclib.unpack_u16_be([202,254]),
        51966,
        'unpack 2-byte number'
    );

    var highest = 0xffff;
    t.equals(
        enclib.unpack_u16_be([255,255]),
        highest,
        `highest number possible (${highest})`
    );

    t.equals(
        enclib.unpack_u16_be([0, 1]),
        1,
        '1'
    );

    t.end();
});

tape('octets_to_hex', function(t) {
    t.deepEquals(
        enclib.octets_to_hex( [ 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x0a ] ),
        '123456789abcdef00a'.split("").map( (c) => c.charCodeAt(0) ),
        'hex encoding'
    );

    t.end();
} );

tape('parse_hex_octets', function(t) {
    t.deepEquals(
        enclib.parse_hex_octets( [ 48, 49, 102, 101 ] ),
        [ 0x01, 0xfe ],
        'parse hex excoding',
    );

    t.end();
} );

tape('round-trip: 16-bit big-endian', function(t) {
    var times = 10000;

    t.doesNotThrow(
        () => {
            for (var a=0; a<times; a++) {
                var orig = Math.floor( 0x10000 * Math.random() );

                var enc = enclib.pack_u16_be(orig);
                var roundtrip = enclib.unpack_u16_be(enc);

                if (roundtrip !== orig) {
                    throw( `Orig: ${orig}, Packed: ` + JSON.stringify(enc) + `, Parsed: ${roundtrip}` );
                }
            }
        },
        `round-trip 16-bit big-endian: ${times} times`
    );

    t.end();
} );
