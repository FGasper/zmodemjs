#!/usr/bin/env node

"use strict";

const fs = require('fs');
const tape = require('blue-tape');

const SZ_PATH = require('which').sync('sz', {nothrow: true});

if (!SZ_PATH) {
    tape.only('SKIP: no “sz” in PATH!', (t) => {
        t.end();
    });
}

const tmp = require('tmp');
const spawn = require('child_process').spawn;

var helper = require('./lib/testhelp');

Object.assign(
    global,
    {
        TextDecoder: require('text-encoding').TextDecoder,
    }
);

global.Zmodem = require('./lib/zmodem');

function _make_temp_file() {
    var tmpobj = tmp.fileSync();
    for (let i of [ ... Array(500000) ]) {
        fs.writeSync( tmpobj.fd, "0123456789" );
    }
    fs.writeSync( tmpobj.fd, "=THE_END" );
    fs.closeSync( tmpobj.fd );

    return tmpobj.name;
}

var FILE1 = _make_temp_file();

function _test_steps(t, sz_args, steps) {
    var child;

    var zsession;
    var zsentry = new Zmodem.Sentry( {
        to_terminal: Object,
        on_detect: (d) => { zsession = d.confirm() },
        on_retract: console.error.bind(console),
        sender: (d) => {
            child.stdin.write( new Buffer(d) );
        },
    } );

    var step = 0;
    var inputs = [];

    child = spawn(SZ_PATH, sz_args);
    child.on("error", console.error.bind(console));

    //We can’t just pipe this on through because there can be lone CR
    //bytes which screw up TAP::Harness.
    child.stderr.on("data", (d) => {
        process.stderr.write( d.toString().replace(/\r/g, "\n") );
    });

    child.stdout.on("data", (d) => {
        //console.log("STDOUT from child", d);
        inputs.push( Array.from(d) );

        zsentry.consume( Array.from(d) );

        if (zsession) {
            if ( steps[step] ) {
                if ( steps[step](zsession, child) ) {
                    step++;
                }
            }
            else {
                child.stdin.end();
            }
        }
    });

    var exit_promise = new Promise( (res, rej) => {
        child.on("exit", (code, signal) => {
            console.log(`# "${SZ_PATH}" exit: code ${code}, signal ${signal}`);
            res([code, signal]);
        } );
    } );

    return exit_promise.then( () => { return inputs } );
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

//This only works when the zsdata() buffer overflow bug is fixed,
//as demonstrated here:
//
//  https://github.com/gooselinux/lrzsz/blob/master/lrzsz-0.12.20.patch
//
tape.skip('skip() during download', { timeout: 30000 }, (t) => {
    var filenames = [FILE1, _make_temp_file()];
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
