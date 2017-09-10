#!/usr/bin/env node

var tape = require('tape');

var helper = require('./lib/testhelp');

global.Zmodem = require('../zmodem');

require('../encode');
require('../zmlib');
require('../zcrc');
require('../zdle');
require('../zheader');
require('../zsession');
require('../zsentry');

var ZSentry = Zmodem.Sentry;

tape('parse passthrough', (t) => {
    var sentry = new ZSentry();

    var strings = new Map( [
        [ "plain", "heyhey", ],
        [ "one_asterisk", "hey*hey", ],
        [ "two_asterisks", "hey**hey", ],
        [ "wrong_header", "hey**\x18B09010203040506\x0d\x0a", ],

        //Use \x2a here to avoid tripping up ZMODEM-detection in
        //text editors when working on this code.
        [ "no_ZDLE", "hey\x2a*B00000000000000\x0d\x0a", ],
    ] );

    for (let [name, string] of strings) {
        var octets = helper.string_to_octets(string);

        var before = octets.slice(0);

        let [termbytes, zsession] = sentry.parse(octets.slice(0));

        t.deepEquals(
            termbytes,
            octets,
            `regular text goes through: ${name}`
        );

        t.is( zsession, undefined, '... and there is no session' );
        t.deepEquals( octets, before, '... and the array is unchanged' );
    }

    t.end();
} );

tape('parse', (t) => {
    var hdrs = new Map( [
        [ "receive", Zmodem.Header.build("ZRQINIT"), ],
        [ "send", Zmodem.Header.build("ZRINIT", ["CANFDX", "CANOVIO", "ESCCTL"]), ],
    ] );

    for ( let [sesstype, hdr] of hdrs ) {
        var full_input = helper.string_to_octets("before").concat(
            hdr.to_hex()
        );

        for (var start=1; start<full_input.length - 1; start++) {
            let octets1 = full_input.slice(0, start);
            let octets2 = full_input.slice(start);

            let sentry = new ZSentry();
            let [termbytes, zsession] = sentry.parse(octets1);

            t.deepEquals(
                termbytes,
                octets1,
                `${sesstype}: Parse first ${start} byte(s) of text (${full_input.length} total)`
            );
            t.is( zsession, undefined, '... and there is no session' );

            [termbytes, zsession] = sentry.parse(octets2);
            t.deepEquals(
                termbytes,
                octets2,
                `Rest of text goes through`
            );
            t.is( typeof zsession, "object", '... and now there is a session' );
            t.is( zsession.type, sesstype, '... of the right type' );
        }
    };

    t.end();
} );
