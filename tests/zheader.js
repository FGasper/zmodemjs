#!/usr/bin/env node

var tape = require('tape');

var testhelp = require('./lib/testhelp');

global.Zmodem = require('../zmodem');

require('../encode');
require('../zcrc');
require('../zmlib');
require('../zdle');

require('../zheader');

var zdle = new Zmodem.ZDLE( { escape_ctrl_chars: true } );

tape('trim_leading_garbage', function(t) {
    var header = Zmodem.Header.build('ZACK');

    var header_octets = new Map( [
        [ "hex", header.to_hex(), ],
        [ "b16", header.to_binary16(zdle), ],
        [ "b32", header.to_binary32(zdle), ],
    ] );

    var leading_garbage = [
        "",
        " ",
        "\n\n",
        "\r\n\r\n",
        "*",
        "**",
        "*\x18",
        "*\x18D",
        "**\x18",
    ];

    leading_garbage.forEach( (garbage) => {
        let garbage_json = JSON.stringify(garbage);
        let garbage_octets = testhelp.string_to_octets( garbage );

        for ( let [label, hdr_octets] of header_octets ) {
            var input = garbage_octets.slice(0).concat( hdr_octets );
            var trimmed = Zmodem.Header.trim_leading_garbage(input);

            t.deepEquals(trimmed, garbage_octets, `${garbage_json} + ${label}: garbage trimmed`);
            t.deepEquals(input, hdr_octets, `… leaving the header`);
        }
    } );

    //----------------------------------------------------------------------

    //input, number of bytes trimmed
    var partial_trims = [
        [ "*", 0 ],
        [ "**", 0 ],
        [ "***", 1 ],
        [ "*\x18**", 2 ],
        [ "*\x18*\x18", 2 ],
        [ "*\x18*\x18**", 4 ],
        [ "*\x18*\x18*\x18", 4 ],
    ];

    partial_trims.forEach( (cur) => {
        let [ input, trimmed_count ] = cur;

        let input_json = JSON.stringify(input);

        let input_octets = testhelp.string_to_octets(input);

        let garbage = Zmodem.Header.trim_leading_garbage(input_octets.slice(0));

        t.deepEquals(
            garbage,
            input_octets.slice(0, trimmed_count),
            `${input_json}: trim first ${trimmed_count} byte(s)`
        );
    } );

    t.end();
});

//Test that we parse a trailing 0x8a, since we ourselves follow the
//documentation and put a plain LF (0x0a).
tape('parse_hex', function(t) {
    var octets = testhelp.string_to_octets( "**\x18B0901020304a57f\x0d\x8a" );

    var parsed = Zmodem.Header.parse( octets );

    t.is( parsed[1], 16, 'CRC size' );

    t.is(
        parsed[0].NAME,
        'ZRPOS',
        'parsed NAME'
    );

    t.is(
        parsed[0].TYPENUM,
        9,
        'parsed TYPENUM'
    );

    t.is(
        parsed[0].get_offset(),
        0x04030201,             //it’s little-endian
        'parsed offset'
    );

    t.end();
} );

tape('round-trip, empty headers', function(t) {
    ["ZRQINIT", "ZSKIP", "ZABORT", "ZFIN", "ZFERR"].forEach( (n) => {
        var orig = Zmodem.Header.build(n);

        var hex = orig.to_hex();
        var b16 = orig.to_binary16(zdle);
        var b32 = orig.to_binary32(zdle);

        var rounds = new Map( [
            [ "to_hex", hex ],
            [ "to_binary16", b16 ],
            [ "to_binary32", b32 ],
        ] );

        for ( const [ enc, h ] of rounds ) {
            let [ parsed, crclen ] = Zmodem.Header.parse(h);

            t.is( parsed.NAME, orig.NAME, `${n}, ${enc}: NAME` );
            t.is( parsed.TYPENUM, orig.TYPENUM, `${n}, ${enc}: TYPENUM` );

            //Here’s where we test the CRC length in the response.
            t.is(
                crclen,
                /32/.test(enc) ? 32 : 16,
                `${n}, ${enc}: CRC length`,
            );
        }
    } );

    t.end();
} );

tape('round-trip, offset headers', function(t) {
    ["ZRPOS", "ZDATA", "ZEOF"].forEach( (n) => {
        var orig = Zmodem.Header.build(n, 12345);

        var hex = orig.to_hex();
        var b16 = orig.to_binary16(zdle);
        var b32 = orig.to_binary32(zdle);

        var rounds = new Map( [
            [ "to_hex", hex ],
            [ "to_binary16", b16 ],
            [ "to_binary32", b32 ],
        ] );

        for ( const [ enc, h ] of rounds ) {
            //Here’s where we test that parse() leaves in trailing bytes.
            let extra = [99, 99, 99];
            let bytes_with_extra = h.slice().concat(extra);

            let parsed = Zmodem.Header.parse(bytes_with_extra)[0];

            t.is( parsed.NAME, orig.NAME, `${n}, ${enc}: NAME` );
            t.is( parsed.TYPENUM, orig.TYPENUM, `${n}, ${enc}: TYPENUM` );
            t.is( parsed.get_offset(), orig.get_offset(), `${n}, ${enc}: get_offset()` );

            let expected = extra.slice(0);
            if (enc === "to_hex") {
                expected.splice( 0, 0, Zmodem.ZMLIB.XON );
            }

            t.deepEquals(
                bytes_with_extra,
                expected,
                `${enc}: parse() leaves in trailing bytes`,
            );
        }
    } );

    t.end();
} );

tape('round-trip, ZSINIT', function(t) {
    var opts = [
        [],
        ["ESCCTL"],
    ];

    opts.forEach( (args) => {
        var orig = Zmodem.Header.build("ZSINIT", args);

        var hex = orig.to_hex();
        var b16 = orig.to_binary16(zdle);
        var b32 = orig.to_binary32(zdle);

        var rounds = new Map( [
            [ "to_hex", hex ],
            [ "to_binary16", b16 ],
            [ "to_binary32", b32 ],
        ] );

        var args_str = JSON.stringify(args);

        for ( const [ enc, h ] of rounds ) {
            let parsed = Zmodem.Header.parse(h)[0];

            t.is( parsed.NAME, orig.NAME, `opts ${args_str}: ${enc}: NAME` );
            t.is( parsed.TYPENUM, orig.TYPENUM, `opts ${args_str}: ${enc}: TYPENUM` );

            t.is( parsed.escape_ctrl_chars(), orig.escape_ctrl_chars(), `opts ${args_str}: ${enc}: escape_ctrl_chars()` );
            t.is( parsed.escape_8th_bit(), orig.escape_8th_bit(), `opts ${args_str}: ${enc}: escape_8th_bit()` );
        }
    } );

    t.end();
} );

tape('round-trip, ZRINIT', function(t) {
    var opts = [];

    [ [], ["CANFDX"] ].forEach( (canfdx) => {
        [ [], ["CANOVIO"] ].forEach( (canovio) => {
            [ [], ["CANBRK"] ].forEach( (canbrk) => {
                [ [], ["CANFC32"] ].forEach( (canfc32) => {
                    [ [], ["ESCCTL"] ].forEach( (escctl) => {
                        opts.push( [
                            ...canfdx,
                            ...canovio,
                            ...canbrk,
                            ...canfc32,
                            ...escctl,
                        ] );
                    } );
                } );
            } );
        } );
    } );

    opts.forEach( (args) => {
        var orig = Zmodem.Header.build("ZRINIT", args);

        var hex = orig.to_hex();
        var b16 = orig.to_binary16(zdle);
        var b32 = orig.to_binary32(zdle);

        var rounds = new Map( [
            [ "to_hex", hex ],
            [ "to_binary16", b16 ],
            [ "to_binary32", b32 ],
        ] );

        var args_str = JSON.stringify(args);

        for ( const [ enc, h ] of rounds ) {
            let parsed = Zmodem.Header.parse(h)[0];

            t.is( parsed.NAME, orig.NAME, `opts ${args_str}: ${enc}: NAME` );
            t.is( parsed.TYPENUM, orig.TYPENUM, `opts ${args_str}: ${enc}: TYPENUM` );

            t.is( parsed.can_full_duplex(), orig.can_full_duplex(), `opts ${args_str}: ${enc}: can_full_duplex()` );
            t.is( parsed.can_overlap_io(), orig.can_overlap_io(), `opts ${args_str}: ${enc}: can_overlap_io()` );
            t.is( parsed.can_break(), orig.can_break(), `opts ${args_str}: ${enc}: can_break()` );
            t.is( parsed.can_fcs_32(), orig.can_fcs_32(), `opts ${args_str}: ${enc}: can_fcs_32()` );
            t.is( parsed.escape_ctrl_chars(), orig.escape_ctrl_chars(), `opts ${args_str}: ${enc}: escape_ctrl_chars()` );
            t.is( parsed.escape_8th_bit(), orig.escape_8th_bit(), `opts ${args_str}: ${enc}: escape_8th_bit()` );
        }
    } );

    t.end();
} );

tape('hex_final_XON', function(t) {
    var hex_ZFIN = Zmodem.Header.build("ZFIN").to_hex();

    t.notEquals(
        hex_ZFIN.slice(-1)[0],
        Zmodem.ZMLIB.XON,
        'ZFIN hex does NOT end with XON',
    );

    var hex_ZACK = Zmodem.Header.build("ZACK").to_hex();

    t.notEquals(
        hex_ZACK.slice(-1)[0],
        Zmodem.ZMLIB.XON,
        'ZACK hex does NOT end with XON',
    );

    var headers = [
        "ZRQINIT",
        Zmodem.Header.build("ZRINIT", []),
        Zmodem.Header.build("ZSINIT", []),
        "ZRPOS",
        "ZABORT",
        "ZFERR",
    ];

    //These are the only headers we expect to send as hex … right?
    headers.forEach( hdr => {
        if (typeof hdr === "string") hdr = Zmodem.Header.build(hdr);

        t.is(
            hdr.to_hex().slice(-1)[0],
            Zmodem.ZMLIB.XON,
            `${hdr.NAME} hex ends with XON`
        );
    } );

    t.end();
} );
