#!/usr/bin/env node

"use strict";

var tape = require('blue-tape');

global.Zmodem = require('./lib/zmodem');

var zmlib = Zmodem.ZMLIB;

tape('constants', function(t) {
    t.equal(typeof zmlib.ZDLE, "number", 'ZDLE');
    t.equal(typeof zmlib.XON, "number", 'XON');
    t.equal(typeof zmlib.XOFF, "number", 'XOFF');
    t.end();
} );

tape('strip_ignored_bytes', function(t) {
    var input = [ zmlib.XOFF, 12, 45, 76, zmlib.XON, 22, zmlib.XOFF, 32, zmlib.XON | 0x80, 0, zmlib.XOFF | 0x80, 255, zmlib.XON ];
    var should_be = [ 12, 45, 76, 22, 32, 0, 255 ];

    var input_copy = input.slice(0);

    var out = zmlib.strip_ignored_bytes(input_copy);

    t.deepEqual( out, should_be, 'intended bytes are stripped' );
    t.equal( out, input_copy, 'output is the mutated input' );

    t.end();
} );

/*
tape('get_random_octets', function(t) {
    t.equal(
        zmlib.get_random_octets(42).length,
        42,
        'length is correct'
    );

    t.equal(
        typeof zmlib.get_random_octets(42)[0],
        "number",
        'type is correct'
    );

    t.ok(
        zmlib.get_random_octets(999999).every( (i) => i>=0 && i<=255 ),
        'values are all octet values'
    );

    t.end();
} );
*/

tape('find_subarray', function(t) {
    t.equal(
        zmlib.find_subarray([12, 56, 43, 77], [43, 77]),
        2,
        'finds at end'
    );

    t.equal(
        zmlib.find_subarray([12, 56, 43, 77], [12, 56]),
        0,
        'finds at begin'
    );

    t.equal(
        zmlib.find_subarray([12, 56, 43, 77], [56, 43]),
        1,
        'finds in the middle'
    );

    t.equal(
        zmlib.find_subarray([12, 56, 43, 77], [56, 43, 43]),
        -1,
        'non-find'
    );

    t.end();
} );
