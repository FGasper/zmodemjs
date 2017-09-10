#!/usr/bin/env node

var tape = require('tape');

global.Zmodem = require('../zmodem');

require('../encode');
require('../zcrc');

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

    t.throws(
        () => zcrc.verify16( [ 0x0d, 0x0a ], [ 0xd7, 16 ] ),
        /215,22.*215,16/,
        'verify16 - throw on bad'
    );

    t.end();
} );

//----------------------------------------------------------------------
// The crc32 logic is unused for now, but some misbehaving ZMODEM
// implementation might send CRC32 regardless of that we don’t
// advertise it.
//----------------------------------------------------------------------

tape('crc32', function(t) {
    t.deepEqual(
        zcrc.crc32( [ 4, 0, 0, 0, 0 ] ),
        [ 0xdd, 0x51, 0xa2, 0x33 ],
        'crc32 - first test'
    );

    t.deepEqual(
        zcrc.crc32( [ 11, 17, 0, 0, 0 ] ),
        [ 0xf6, 0xf6, 0x57, 0x59 ],
        'crc32 - second test'
    );

    t.end();
} );

tape('verify32', function(t) {
    t.doesNotThrow(
        () => zcrc.verify32( [ 4, 0, 0, 0, 0 ], [ 0xdd, 0x51, 0xa2, 0x33 ] ),
        'verify32 - no throw on good'
    );

    t.throws(
        () => zcrc.verify32( [ 4, 0, 0, 0, 0 ], [ 1,2,3,4 ] ),
        /221,81,162,51.*1,2,3,4/,
        'verify32 - throw on bad'
    );

    t.end();
} );
