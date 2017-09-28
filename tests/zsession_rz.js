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
        TextEncoder: require('text-encoding').TextEncoder,
    }
);

var helper = require('./lib/testhelp');

process.chdir( helper.make_temp_dir() );

let TEST_STRINGS = [
    "",
    "0",
    "123",
    "\x00",
    "\x18",
    "\x18\x18\x18\x18\x18",
    "épée",
    "Hi diddle-ee, dee! A sailor’s life for me!",
];

tape("send batch", (t) => {
    var string_num = 0;

    var mtime_1990 = new Date("1990-01-01T00:00:00Z");

    return helper.exec_lrzsz_steps( t, RZ_PATH, [], [
        (zsession, child) => {
            function offer_sender() {
                if (string_num >= TEST_STRINGS.length) {
                    zsession.close();
                    return;  //batch finished
                }

                let file_contents = TEST_STRINGS[string_num];

                return zsession.send_offer( {
                    name: "batch_" + string_num,
                    mtime: mtime_1990,
                } ).then( (xfer) => {
                    string_num++;
                    return xfer.end( helper.string_to_octets(file_contents) );
                } ).then( offer_sender );
            }

            return offer_sender();
        },
        (zsession, child) => {
            return zsession.has_ended();
        },
    ] ).then( () => {
        for (var sn=0; sn < TEST_STRINGS.length; sn++) {
            var got_contents = fs.readFileSync("batch_" + sn, "utf-8");
            t.equals( got_contents, TEST_STRINGS[sn], `rz wrote out the file (${TEST_STRINGS[sn]})` );
            t.equals( 0 + fs.statSync("batch_" + sn).mtime, 0 + mtime_1990, `... and observed the sent mtime` );
        }
    } );
});

tape("send single", (t) => {
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
                    () => xfer.end( helper.string_to_octets(file_contents) )
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
            t.equals( got_contents, file_contents, `rz wrote out the file (${file_contents})` );
        } ).then( doer );
    }

    return doer();
});
