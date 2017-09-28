#!/usr/bin/env node

"use strict";

const tape = require('tape'),
    Zmodem = require('../zmodem'),
    TYPE_CHECKS = {
        aborted: [ [] ],
        peer_aborted: [],
        already_aborted: [],
        crc: [
            [ [ 1, 2 ], [ 3, 4 ] ],
            (t, err) => {
                t.ok(
                    /1,2/.test(err.message),
                    '"got" values are in the message'
                );
                t.ok(
                    /3,4/.test(err.message),
                    '"expected" values are in the message'
                );
                t.ok(
                    /CRC/i.test(err.message),
                    '"CRC" is in the message'
                );
            },
        ],
        validation: [
            [ "some string" ],
            (t, err) => {
                t.is(
                    err.message,
                    "some string",
                    'message is given value'
                );
            },
        ],
    }
;

tape("typed", (t) => {
    let Ctr = Zmodem.Error;

    for (let type in TYPE_CHECKS) {
        let args = [type].concat( TYPE_CHECKS[type][0] );

        //https://stackoverflow.com/questions/33193310/constr-applythis-args-in-es6-classes
        var err = new (Ctr.bind.apply(Ctr, [null].concat(args)));

        t.ok(
            (err instanceof Zmodem.Error),
            `${type} type isa ZmodemError`
        );
        t.ok(
            !!err.message.length,
            `${type}: message has length`
        );

        if ( TYPE_CHECKS[type][1] ) {
            TYPE_CHECKS[type][1](t, err);
        }
    }

    t.end();
});

tape("generic", (t) => {
    let err = new Zmodem.Error("Van Gogh was a guy.");

    t.ok(
        (err instanceof Zmodem.Error),
        `generic isa ZmodemError`
    );
    t.is(
        err.message,
        "Van Gogh was a guy.",
        "passthrough of string"
    );

    t.end();
});
