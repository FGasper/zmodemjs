#!/usr/bin/env node

"use strict";

const tape = require('tape');

global.Zmodem = require('./lib/zmodem');

const zcrc = Zmodem.CRC;

var now = new Date();
var now_epoch = Math.floor( now.getTime() / 1000 );

var failures = [
    [
        'empty name',
        { name: "" },
        function(t, e) {
            t.ok( /name/.test(e.message), 'has “name”' );
        },
    ],
    [
        'non-string name',
        { name: 123 },
        function(t, e) {
            t.ok( /name/.test(e.message), 'has “name”' );
            t.ok( /string/.test(e.message), 'has “string”' );
        },
    ],
    [
        'non-empty serial',
        { name: "123", serial: 0 },
        function(t, e) {
            t.ok( /serial/.test(e.message), 'has “serial”' );
        },
    ],
    [
        'files_remaining === 0',
        { name: "123", files_remaining: 0 },
        function(t, e) {
            t.ok( /files_remaining/.test(e.message), 'has “files_remaining”' );
        },
    ],
    [
        'pre-epoch mtime',
        { name: "123", mtime: new Date("1969-12-30T01:02:03Z") },
        function(t, e) {
            t.ok( /mtime/.test(e.message), 'has “mtime”' );
            t.ok( /1969/.test(e.message), 'has “1969”' );
            t.ok( /1970/.test(e.message), 'has “1970”' );
        },
    ],
];

["size", "mode", "mtime", "files_remaining", "bytes_remaining"].forEach( (k) => {
    var input = { name: "the name" };
    input[k] = "123123";

    var key_regexp = new RegExp(k);
    var value_regexp = new RegExp(input[k]);

    failures.push( [
        `string “${k}”`,
        input,
        function(t, e) {
            t.ok( key_regexp.test(e.message), `has “${k}”` );
            t.ok( value_regexp.test(e.message), 'has value' );
            t.ok( /number/.test(e.message), 'has “number”' );
        },
    ] );

    input = Object.assign( {}, input );
    input[k] = -input[k];

    var negative_regexp = new RegExp(input[k]);

    failures.push( [
        `negative “${k}”`,
        input,
        function(t, e) {
            t.ok( key_regexp.test(e.message), `has “${k}”` );
            t.ok( negative_regexp.test(e.message), 'has value' );
        },
    ] );

    input = Object.assign( {}, input );
    input[k] = -input[k] - 0.1;

    var fraction_regexp = new RegExp( ("" + input[k]).replace(/\./, "\\.") );

    failures.push( [
        `fraction “${k}”`,
        input,
        function(t, e) {
            t.ok( key_regexp.test(e.message), `has “${k}”` );
            t.ok( fraction_regexp.test(e.message), 'has value' );
        },
    ] );
} );


var transformations = [
    [
        'name only',
        { name: "My name", },
        {
            name: "My name",
            size: null,
            mtime: null,
            mode: null,
            serial: null,
            files_remaining: null,
            bytes_remaining: null,
        },
    ],
    [
        'name is all numerals',
        { name: "0", },
        {
            name: "0",
            size: null,
            mtime: null,
            mode: null,
            serial: null,
            files_remaining: null,
            bytes_remaining: null,
        },
    ],
    [
        'name only (undefined rather than null)',
        {
            name: "My name",
            size: undefined,
            mtime: undefined,
            mode: undefined,
            serial: undefined,
            files_remaining: undefined,
            bytes_remaining: undefined,
        },
        {
            name: "My name",
            size: null,
            mtime: null,
            mode: null,
            serial: null,
            files_remaining: null,
            bytes_remaining: null,
        },
    ],
    [
        'name and all numbers',
        {
            name: "My name",
            size: 0,
            mtime: 0,
            mode: parseInt("0644", 8),
            serial: null,
            files_remaining: 1,
            bytes_remaining: 0,
        },
        {
            name: "My name",
            size: 0,
            mtime: 0,
            mode: parseInt("100644", 8),
            serial: null,
            files_remaining: 1,
            bytes_remaining: 0,
        },
    ],
    [
        'name, zero size',
        { name: "My name", mtime: now },
        {
            name: "My name",
            size: null,
            mtime: now_epoch,
            mode: null,
            serial: null,
            files_remaining: null,
            bytes_remaining: null,
        },
    ],
    [
        'name, mtime as Date',
        { name: "My name", size: 0 },
        {
            name: "My name",
            size: 0,
            mtime: null,
            mode: null,
            serial: null,
            files_remaining: null,
            bytes_remaining: null,
        },
    ],
];

tape('offer_parameters - failures', function(t) {

    for (const [label, input, todo] of failures) {
        let err;
        try {
            Zmodem.Validation.offer_parameters(input);
        }
        catch(e) { err = e }

        t.ok( err instanceof Zmodem.Error, `throws ok: ${label}` );

        todo(t, err);
    }

    t.end();
});

tape('offer_parameters - happy path', function(t) {

    for (const [label, input, output] of transformations) {
        t.deepEquals(
            Zmodem.Validation.offer_parameters(input),
            output,
            label,
        );
    }

    t.end();
});
