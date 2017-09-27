#!/usr/bin/env node

"use strict";

var tape = require('tape');

var testhelp = require('./lib/testhelp');

global.Zmodem = require('../zmodem');

require('../encode');
require('../zcrc');
require('../zmlib');
require('../zdle');

require('../zsubpacket');

var zdle = new Zmodem.ZDLE( { escape_ctrl_chars: true } );

tape('build, encode, parse', function(t) {
    let content = [1, 2, 3, 4];

    ["end_ack", "no_end_ack", "end_no_ack", "no_end_no_ack"].forEach( end => {
        var header = Zmodem.Subpacket.build( content, end );

        t.deepEquals(
            header.get_payload(),
            content,
            `${end}: get_payload()`
        );

        t.is(
            header.frame_end(),
            !/no_end/.test(end),
            `${end}: frame_end()`
        );

        t.is(
            header.ack_expected(),
            !/no_ack/.test(end),
            `${end}: ack_expected()`
        );

        [16, 32].forEach( crclen => {
            var encoded = header["encode" + crclen](zdle);
            var parsed = Zmodem.Subpacket["parse" + crclen](encoded);

            t.deepEquals(
                parsed.get_payload(),
                content,
                `${end}, CRC${crclen} rount-trip: get_payload()`
            );

            t.is(
                parsed.frame_end(),
                header.frame_end(),
                `${end}, CRC${crclen} rount-trip: frame_end()`
            );

            t.is(
                parsed.ack_expected(),
                header.ack_expected(),
                `${end}, CRC${crclen} rount-trip: ack_expected()`
            );
        } );
    } );

    t.end();
} );
