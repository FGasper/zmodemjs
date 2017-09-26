#!/usr/bin/env node

const tape = require('blue-tape');
const tmp = require('tmp');
const spawn = require('child_process').spawn;

var helper = require('./lib/testhelp');

Object.assign(
    global,
    {
        Zmodem: require('../zmodem'),
        TextDecoder: require('text-encoding').TextDecoder,
    }
);

require('../encode');
require('../zmlib');
require('../zcrc');
require('../zdle');
require('../zheader');
require('../zsubpacket');
require('../zsession');
require('../zsentry');

var tmpobj = tmp.fileSync();
var fs = require('fs');
for (let i of [ ... Array(500000) ]) {
    fs.writeSync( tmpobj.fd, "0123456789" );
}
fs.writeSync( tmpobj.fd, "=THE_END" );
fs.closeSync( tmpobj.fd );

function _test_steps(t, steps) {
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

    child = spawn("sz", [tmpobj.name]);
    child.on("error", console.error.bind(console));
    child.stderr.pipe( process.stderr );
    child.stdout.on("data", (d) => {
        //console.log("stdout", d);
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
            //console.log(`exit - code ${code}, signal ${signal}`);
            res([code, signal]);
        } );
    } );

    return exit_promise.then( () => { return inputs } );
}

tape('abort() after ZRQINIT', (t) => {
    return _test_steps( t, [
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
    return _test_steps( t, [
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
    var child_pms = _test_steps( t, [
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
            "the end of the file wasn’t sent",
        );
    } );
});

tape('abort() after ZEOF', (t) => {
    var received;

    return _test_steps( t, [
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
        t.is( str, "OO", 'abort() right after receipt of ZEOF' );
    } );
});
