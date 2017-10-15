#!/usr/bin/env node

"use strict";

var tape = require('blue-tape');

var Zmodem = Object.assign(
    {},
    require('../src/zcrc')
);

var zcrc = Zmodem.CRC;

tape('crc16', function(t) {
    t.deepEqual(
        zcrc.crc16( [ 0x0d, 0x0a ] ),
        [ 0xd7, 0x16 ],
        'crc16 - first test'
    );

    t.deepEqual(
        zcrc.crc16( [ 0x11, 0x17, 0, 0, 0 ] ),
        [ 0xe4, 0x81 ],
        'crc16 - second test'
    );

    t.end();
} );

tape('verify16', function(t) {
    t.doesNotThrow(
        () => zcrc.verify16( [ 0x0d, 0x0a ], [ 0xd7, 0x16 ] ),
        'verify16 - no throw on good'
    );

    var err;
    try { zcrc.verify16( [ 0x0d, 0x0a ], [ 0xd7, 16 ] ) }
    catch(e) { err = e };

    t.ok(
        /215,16.*215,22/.test(err.message),
        'verify16 - throw on bad (message)'
    );

    t.ok(
        err instanceof Zmodem.Error,
        'verify16 - typed error'
    );

    t.ok(
        err.type,
        'verify16 - error type'
    );

    t.end();
} );

//----------------------------------------------------------------------
// The crc32 logic is unused for now, but some misbehaving ZMODEM
// implementation might send CRC32 regardless of that we don’t
// advertise it.
//----------------------------------------------------------------------

tape('crc32', function(t) {
    const tests = [
        [ [ 4, 0, 0, 0, 0 ], [ 0xdd, 0x51, 0xa2, 0x33 ] ],
        [ [ 11, 17, 0, 0, 0 ], [ 0xf6, 0xf6, 0x57, 0x59 ] ],
        [ [ 3, 0, 0, 0, 0 ], [ 205, 141, 130, 129 ] ],
    ];
//    } [ 3, 0, 0, 0, 0 ] [ 205, 141, 131, -127 ]
//2172816845
//crc32 [ 3, 0, 0, 0, 0 ] -2122150451

    tests.forEach( (cur_t) => {
        let [ input, output ] = cur_t;

        t.deepEqual(
            zcrc.crc32(input),
            output,
            "crc32: " + input.join(", ")
        );
    } );

    t.end();
} );

tape('verify32', function(t) {
    t.doesNotThrow(
        () => zcrc.verify32( [ 4, 0, 0, 0, 0 ], [ 0xdd, 0x51, 0xa2, 0x33 ] ),
        'verify32 - no throw on good'
    );

    var err;
    try { zcrc.verify32( [ 4, 0, 0, 0, 0 ], [ 1,2,3,4 ] ) }
    catch(e) { err = e };

    t.ok(
        /1,2,3,4.*221,81,162,51/.test(err.message),
        'verify32 - throw on bad (message)'
    );

    t.ok(
        err instanceof Zmodem.Error,
        'verify32 - typed error'
    );

    t.ok(
        err.type,
        'verify32 - error type'
    );

    t.end();
} );
