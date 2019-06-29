#!/usr/bin/env node

"use strict";

const tape = require('blue-tape');

const SZ_PATH = require('which').sync('sz', {nothrow: true});

if (!SZ_PATH) {
    tape.only('SKIP: no “sz” in PATH!', (t) => {
        t.end();
    });
}

const spawn = require('child_process').spawn;

var helper = require('./lib/testhelp');

Object.assign(
    global,
    {
        Zmodem: require('./lib/zmodem'),
    }
);

var FILE1 = helper.make_temp_file(10 * 1024 * 1024);    //10 MiB

function _test_steps(t, sz_args, steps) {
    return helper.exec_lrzsz_steps( t, SZ_PATH, sz_args, steps );
}

tape('abort() after ZRQINIT', (t) => {
    return _test_steps( t, [FILE1], [
        (zsession, child) => {
            zsession.abort();
            return true;
        },
    ] ).then( (inputs) => {
        //console.log("inputs", inputs);

        var str = String.fromCharCode.apply( String, inputs[ inputs.length - 1 ]);
        t.ok(
            str.match(/\x18\x18\x18\x18\x18/),
            'abort() right after receipt of ZRQINIT',
        );
    } );
});

tape('abort() after ZFILE', (t) => {
    return _test_steps( t, [FILE1], [
        (zsession) => {
            zsession.start();
            return true;
        },
        (zsession) => {
            zsession.abort();
            return true;
        },
    ] ).then( (inputs) => {
        //console.log("inputs", inputs);

        var str = String.fromCharCode.apply( String, inputs[ inputs.length - 1 ]);
        t.ok(
            str.match(/\x18\x18\x18\x18\x18/),
            'abort() right after receipt of ZFILE',
        );
    } );
});

//NB: This test is not unlikely to flap since it depends
//on sz reading the abort sequence prior to finishing its read
//of the file.
tape('abort() during download', { timeout: 30000 }, (t) => {
    var child_pms = _test_steps( t, [FILE1], [
        (zsession) => {
            zsession.on("offer", (offer) => offer.accept() );
            zsession.start();
            return true;
        },
        (zsession) => {
            zsession.abort();
            return true;
        },
    ] );

    return child_pms.then( (inputs) => {
        t.notEquals( inputs, undefined, 'abort() during download ends the transmission' );

        t.ok(
            inputs.every( function(bytes) {
                var str = String.fromCharCode.apply( String, bytes );
                return !/THE_END/.test(str);
            } ),
            "the end of the file was not sent",
        );
    } );
});

//This only works because we use CRC32 to receive. CRC16 in lsz has a
//buffer overflow bug, fixed here:
//
//  https://github.com/gooselinux/lrzsz/blob/master/lrzsz-0.12.20.patch
//
tape('skip() during download', { timeout: 30000 }, (t) => {
    var filenames = [FILE1, helper.make_temp_file(12345678)];
    //filenames = ["-vvvvvvvvvvvvv", FILE1, _make_temp_file()];

    var started, second_offer;

    return _test_steps( t, filenames, [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
                    offer.accept();
                    offer.skip();
                    zsession.off("offer", offer_taker);
                    zsession.on("offer", (offer2) => {
                        second_offer = offer2;
                        offer2.skip();
                    });
                }
                zsession.on("offer", offer_taker);
                zsession.start();
                started = true;
            }
            //return true;
        },
    ] ).then( (inputs) => {
        var never_end = inputs.every( function(bytes) {
            var str = String.fromCharCode.apply( String, bytes );
            return !/THE_END/.test(str);
        } );

        // This is race-prone.
        //t.ok( never_end, "the end of a file is never sent" );

        t.ok( !!second_offer, "we got a 2nd offer after the first" );
    } );
});

tape('skip() - immediately - at end of download', { timeout: 30000 }, (t) => {
    var filenames = [helper.make_temp_file(123)];

    var started;

    return _test_steps( t, filenames, [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
                    offer.accept();
                    offer.skip();
                }
                zsession.on("offer", offer_taker);
                zsession.start();

                started = true;
            }
        },
    ] );
});

// Verify a skip() that happens after a transfer is complete.
// There are no assertions here.
tape('skip() - after a parse - at end of download', { timeout: 30000 }, (t) => {
    var filenames = [helper.make_temp_file(123)];

    var the_offer, started, skipped, completed;

    return _test_steps( t, filenames, [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
                    the_offer = offer;
                    var promise = the_offer.accept();
                    promise.then( () => {
                        completed = 1;
                    } );
                }
                zsession.on("offer", offer_taker);
                zsession.start();
                started = true;
            }

            return the_offer;
        },
        () => {
            if (!skipped && !completed) {
                the_offer.skip();
                skipped = true;
            }
        },
    ] );
});

var happy_filenames = [
    helper.make_temp_file(5),
    helper.make_temp_file(3),
    helper.make_temp_file(1),
    helper.make_empty_temp_file(),
];

tape('happy-path: single batch', { timeout: 30000 }, (t) => {
    var started, the_offer;

    var args = happy_filenames;

    var buffers = [];

    var child_pms = _test_steps( t, args, [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
                    the_offer = offer;
                    the_offer.accept( { on_input: "spool_array" } ).then( (byte_lists) => {
                        var flat = [].concat.apply([], byte_lists);
                        var str = String.fromCharCode.apply( String, flat );
                        buffers.push(str);
                    } );
                }
                zsession.on("offer", offer_taker);
                zsession.start();
                started = true;
            }

            return false;
        },
    ] );

    return child_pms.then( (inputs) => {
        t.equals( buffers[0], "xxxxx=THE_END", '5-byte transfer plus end' );
        t.equals( buffers[1], "xxx=THE_END", '3-byte transfer plus end' );
        t.equals( buffers[2], "x=THE_END", '1-byte transfer plus end' );
        t.equals( buffers[3], "", 'empty transfer plus end' );
    } );
});

tape('happy-path: individual transfers', { timeout: 30000 }, (t) => {
    var promises = happy_filenames.map( (fn) => {
        var str;

        var started;

        var child_pms = _test_steps( t, [fn], [
            (zsession) => {
                if (!started) {
                    function offer_taker(offer) {
                        offer.accept( { on_input: "spool_array" } ).then( (byte_lists) => {
                            var flat = [].concat.apply([], byte_lists);
                            str = String.fromCharCode.apply( String, flat );
                        } );
                    }
                    zsession.on("offer", offer_taker);
                    zsession.start();
                    started = true;
                }

                return false;
            },
        ] );

        return child_pms.then( () => str );
    } );

    return Promise.all(promises).then( (strs) => {
        t.equals( strs[0], "xxxxx=THE_END", '5-byte transfer plus end' );
        t.equals( strs[1], "xxx=THE_END", '3-byte transfer plus end' );
        t.equals( strs[2], "x=THE_END", '1-byte transfer plus end' );
        t.equals( strs[3], "", 'empty transfer plus end' );
    } );
});

//This doesn’t work because we automatically send ZFIN once we receive it,
//which prompts the child to finish up.
tape.skip("abort() after ZEOF", (t) => {
    var received;

    return _test_steps( t, [FILE1], [
        (zsession) => {
            zsession.on("offer", (offer) => {
                offer.accept().then( () => { received = true } );
            } );
            zsession.start();
            return true;
        },
        (zsession) => {
            if (received) {
                zsession.abort();
                return true;
            }
        },
    ] ).then( (inputs) => {
        var str = String.fromCharCode.apply( String, inputs[ inputs.length - 1 ]);
        t.is( str, "OO", "successful close despite abort" );
    } );
});
