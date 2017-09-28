#!/usr/bin/env node

"use strict";

var tape = require('tape');

global.Zmodem = require('./lib/zmodem');

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
