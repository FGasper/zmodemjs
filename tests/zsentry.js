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

function _generate_tester() {
    var tester = {
        reset() {
            this.to_terminal = [];
            this.to_server = [];
            this.retracted = 0;
        }
    };

    tester.sentry = new ZSentry( {
        to_terminal(octets) { tester.to_terminal.push.apply( tester.to_terminal, octets ) },
        on_detect(z) { tester.detected = z; },
        on_retract(z) { tester.retracted++; },
        sender(octets) { tester.to_server.push.apply( tester.to_server, octets ) },
    } );

    tester.reset();

    return tester;
}

tape('retraction', (t) => {
    var tester = _generate_tester();

    var makes_offer = helper.string_to_octets("hey**\x18B00000000000000\x0d\x0a\x11");
    tester.sentry.consume(makes_offer);

    t.is( typeof tester.detected, "object", 'There is a session after ZRQINIT' );

    tester.sentry.consume([ 0x20, 0x21, 0x22 ]);

    t.is( tester.retracted, 1, 'retraction since we got non-ZMODEM input' );

    t.end();
} );

tape('parse passthrough', (t) => {
    var tester = _generate_tester();

    var strings = new Map( [
        [ "plain", "heyhey", ],
        [ "one_asterisk", "hey*hey", ],
        [ "two_asterisks", "hey**hey", ],
        [ "wrong_header", "hey**\x18B09010203040506\x0d\x0a", ],
        [ "ZRQINIT but not at end", "hey**\x18B00000000000000\x0d\x0ahahahaha", ],
        [ "ZRINIT but not at end", "hey**\x18B01010203040506\x0d\x0ahahahaha", ],

        //Use \x2a here to avoid tripping up ZMODEM-detection in
        //text editors when working on this code.
        [ "no_ZDLE", "hey\x2a*B00000000000000\x0d\x0a", ],
    ] );

    for (let [name, string] of strings) {
        tester.reset();

        var octets = helper.string_to_octets(string);

        var before = octets.slice(0);

        tester.sentry.consume(octets);

        t.deepEquals(
            tester.to_terminal,
            before,
            `regular text goes through: ${name}`
        );

        t.is( tester.detected, undefined, '... and there is no session' );
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

            var tester = _generate_tester();
            tester.sentry.consume(octets1);

            t.deepEquals(
                tester.to_terminal,
                octets1,
                `${sesstype}: Parse first ${start} byte(s) of text (${full_input.length} total)`
            );
            t.is( tester.detected, undefined, '... and there is no session' );

            tester.reset();

            tester.sentry.consume(octets2);
            t.deepEquals(
                tester.to_terminal,
                octets2,
                `Rest of text goes through`
            );
            t.is( typeof tester.detected, "object", '... and now there is a session' );
            t.is( tester.detected.get_session_type(), sesstype, '... of the right type' );
        }
    };

    t.end();
} );
