#!/usr/bin/env node

"use strict";

const fs = require('fs');
const tape = require('blue-tape');

const RZ_PATH = require('which').sync('rz', {nothrow: true});

if (!RZ_PATH) {
    tape.only('SKIP: no “rz” in PATH!', (t) => {
        t.end();
    });
}

Object.assign(
    global,
    {
        Zmodem: require('./lib/zmodem'),
    }
);

var helper = require('./lib/testhelp');

var dir_before = process.cwd();
tape.onFinish( () => process.chdir( dir_before ) );

let TEST_STRINGS = [
    "",
    "0",
    "123",
    "\x00",
    "\x18",
    "\x18\x18\x18\x18\x18", //invalid as UTF-8
    "\x8a\x9a\xff\xfe",     //invalid as UTF-8
    "épée",
    "Hi diddle-ee, dee! A sailor’s life for me!",
];

var text_encoder = require('text-encoding').TextEncoder;
text_encoder = new text_encoder();

function _send_batch(t, batch, on_offer) {
    batch = batch.slice(0);

    return helper.exec_lrzsz_steps( t, RZ_PATH, [], [
        (zsession, child) => {
            function offer_sender() {
                if (!batch.length) {
                    zsession.close();
                    return;  //batch finished
                }

                return zsession.send_offer(
                    batch[0][0]
                ).then( (xfer) => {
                    if (on_offer) {
                        on_offer(xfer, batch[0]);
                    }

                    let file_contents = batch.shift()[1];
                    return xfer && xfer.end( Array.from( text_encoder.encode(file_contents) ) );
                } ).then( offer_sender );
            }

            return offer_sender();
        },
        (zsession, child) => {
            return zsession.has_ended();
        },
    ] );
}

function _do_in_temp_dir( todo ) {
    var ret;

    process.chdir( helper.make_temp_dir() );

    try {
        ret = todo();
    }
    catch(e) {
        throw e;
    }
    finally {
        if (!ret) {
            process.chdir( dir_before );
        }
    }

    if (ret) {
        ret = ret.then( () => process.chdir( dir_before ) );
    }

    return ret;
}

tape("rz accepts one, then skips next", (t) => {
    return _do_in_temp_dir( () => {
        let filename = "no-clobberage";

        var batch = [
            [
                { name: filename },
                "the first",
            ],
            [
                { name: filename },
                "the second",
            ],
        ];

        var offers = [];
        function offer_cb(xfer, batch_item) {
            offers.push( xfer );
        }

        return _send_batch(t, batch, offer_cb).then( () => {
            var got_contents = fs.readFileSync(filename, "utf-8");
            t.equals( got_contents, "the first", 'second offer was rejected' );

            t.notEquals( offers[0], undefined, 'got an offer at first' );
            t.equals( offers[1], undefined, '… but no offer second' );
        } );
    } );
});

tape("send batch", (t) => {
    return _do_in_temp_dir( () => {
        var string_num = 0;

        var base = "batch_";
        var mtime_1990 = new Date("1990-01-01T00:00:00Z");

        var batch = TEST_STRINGS.map( (str, i) => {
            return [
                {
                    name: base + i,
                    mtime: mtime_1990,
                },
                str,
            ];
        } );

        return _send_batch(t, batch).then( () => {
            for (var sn=0; sn < TEST_STRINGS.length; sn++) {
                var got_contents = fs.readFileSync(base + sn, "utf-8");
                t.equals( got_contents, TEST_STRINGS[sn], `rz wrote out the file: ` + JSON.stringify(TEST_STRINGS[sn]) );
                t.equals( 0 + fs.statSync(base + sn).mtime, 0 + mtime_1990, `... and observed the sent mtime` );
            }
        } );
    } );
});

tape("send one at a time", (t) => {
    return _do_in_temp_dir( () => {
        var xfer;

        let test_strings = TEST_STRINGS.slice(0);

        function doer() {
            var file_contents = test_strings.shift();
            if (typeof(file_contents) !== "string") return;     //we’re done

            return helper.exec_lrzsz_steps( t, RZ_PATH, ["--overwrite"], [
                (zsession, child) => {
                    zsession.send_offer( { name: "single" } ).then( (xf) => {
                        t.ok( !!xf, 'rz accepted offer' );
                        xfer = xf;
                    } ).then(
                        () => xfer.end( Array.from( text_encoder.encode(file_contents) ) )
                    ).then(
                        () => zsession.close()
                    );

                    return true;
                },
                (zsession, child) => {
                    return zsession.has_ended();
                },
            ] ).then( () => {
                var got_contents = fs.readFileSync("single", "utf-8");
                t.equals( got_contents, file_contents, `rz wrote out the file: ` + JSON.stringify(file_contents) );
            } ).then( doer );
        }

        return doer();
    } );
});

tape("send single large file", (t) => {
    return _do_in_temp_dir( () => {
        var string_num = 0;

        var mtime_1990 = new Date("1990-01-01T00:00:00Z");
        var big_string = Array(30 * 1024 * 1024).fill('x').join("");

        var batch = [
            [
                {
                    name: "big_kahuna",
                },
                big_string,
            ],
        ];

        return _send_batch(t, batch).then( () => {
            var got_contents = fs.readFileSync("big_kahuna", "utf-8");
            t.equals( got_contents, big_string, 'rz wrote out the file');
        } );
    } );
});
