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

/*
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

        t.ok( never_end, "the end of a file is never sent" );

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

tape('skip() - after a parse - at end of download', { timeout: 30000 }, (t) => {
    var filenames = [helper.make_temp_file(123)];

    var the_offer, started, skipped;

    return _test_steps( t, filenames, [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
                    the_offer = offer;
                    the_offer.accept();
                }
                zsession.on("offer", offer_taker);
                zsession.start();
                started = true;
            }

            return the_offer;
        },
        () => {
            if (!skipped) {
                the_offer.skip();
                skipped = true;
            }
        },
    ] );
});
*/

tape('single file', { timeout: 30000 }, (t) => {
console.warn('--------------------------');
    var filename = helper.make_temp_file(3);

    var started, the_offer;

    var child_pms = _test_steps( t, [ "-v", filename ], [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
console.log("got offer");
                    the_offer = offer;
                    the_offer.accept().then( (bytes) => {
                        var str = String.fromCharCode.apply( String, bytes[0] );
                        t.ok(
                            /THE_END$/.test(str),
                            'file sent'
                        );
                    } );
                }
                zsession.on("offer", offer_taker);
                zsession.start();
                started = true;
            }

            return the_offer;
        },
    ] );

    return child_pms.then( (inputs) => {
        t.ok(true, "done ==================");
    } );
    return Promise.resolve(1);
});

/*
tape('single empty file', { timeout: 30000 }, (t) => {
console.warn('--------------------------');
    var filename = helper.make_empty_temp_file();

    var started, the_offer;

    var child_pms = _test_steps( t, [ "-vvvvvvvvvvvvv", filename ], [
        (zsession) => {
            if (!started) {
                function offer_taker(offer) {
console.log("got offer");
                    the_offer = offer;
                    the_offer.accept().then( (bytes) => {
                        var str = String.fromCharCode.apply( String, bytes[0] );
                        t.equals( str, "", 'empty file transferred' );
                    } );
                }
                zsession.on("offer", offer_taker);
                zsession.start();
                started = true;
            }

            return the_offer;
        },
    ] );

    return child_pms.then( (inputs) => {
        t.ok(true, "done ==================");
    } );
    return Promise.resolve(1);
});
*/

//----------------------------------------------------------------------

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
