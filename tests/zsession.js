#!/usr/bin/env node

"use strict";

const test = require('blue-tape');

/*
const tape = require('tape')
const _test = require('tape-promise').default // <---- notice 'default' 
const test = _test(tape) // decorate tape 
*/


var helper = require('./lib/testhelp');

global.Zmodem = require('../zmodem');

require('../encode');
require('../zmlib');
require('../zcrc');
require('../zdle');
require('../zheader');
require('../zsubpacket');
require('../zvalidation');
require('../zsession');

global.TextEncoder = require('text-encoding').TextEncoder;
global.TextDecoder = require('text-encoding').TextDecoder;

var ZSession = Zmodem.Session;

var receiver, sender, sender_promise, received_file;

var offer;

function wait(seconds) {
    return new Promise( resolve => setTimeout(_ => resolve("theValue"), 1000 * seconds) );
}

function _init(async) {
    sender = null;
    receiver = new Zmodem.Session.Receive();

    /*
    receiver.on("receive", function(hdr) {
        console.log("Receiver input", hdr);
    } );
    receiver.on("offer", function(my_offer) {
        //console.log("RECEIVED OFFER (window.offer)", my_offer);
        offer = my_offer;
    });
    */

    var resolver;
    sender_promise = new Promise( (res, rej) => { resolver = res; } );

    function receiver_sender(bytes_arr) {
        //console.log("receiver sending", String.fromCharCode.apply(String, bytes_arr), bytes_arr);

        if (sender) {
            var consumer = () => {
                sender.consume(bytes_arr);
            };

            if (async) {
                wait(0.5).then(consumer);
            }
            else consumer();
        }
        else {
            var hdr = Zmodem.Header.parse(bytes_arr)[0];
            sender = new Zmodem.Session.Send(hdr);
            resolver(sender);

            sender.set_sender( function(bytes_arr) {
                var consumer = () => {
                    receiver.consume(bytes_arr);
                };

                if (async) {
                    wait(0.5).then(consumer);
                }
                else consumer();
            } );

            /*
            sender.on("receive", function(hdr) {
                console.log("Sender input", hdr);
            } );
            */
        }
    }

    receiver.set_sender(receiver_sender);
}

test('receive one, promises', (t) => {
    _init();

    var r_pms = receiver.start().then( (offer) => {
        t.deepEquals(
            offer.get_details(),
            {
                name: "my file",
                size: 32,
                mode: null,
                mtime: null,
                serial: null,
                files_remaining: null,
                bytes_remaining: null,
            },
            'get_details() returns expected values'
        );

        return offer.accept();
    } );

    //r_pms.then( () => { console.log("RECEIVER DONE") } );

    var s_pms = sender.send_offer(
        { name: "my file", size: 32 }
    ).then( (sender_xfer) => {
        sender_xfer.end( [12, 23, 34] ).then( () => {
            return sender.close();
        } );
    } );

    return Promise.all( [ r_pms, s_pms ] );
} );

test('receive one, events', (t) => {
    _init();

    var content = [ 1,2,3,4,5,6,7,8,9,2,3,5,1,5,33,2,23,7 ];

    var now_epoch = Math.floor(Date.now() / 1000);

    receiver.on("offer", (offer) => {
        t.deepEquals(
            offer.get_details(),
            {
                name: "my file",
                size: content.length,
                mode: parseInt("100644", 8),
                mtime: new Date( now_epoch * 1000 ),
                serial: null,
                files_remaining: null,
                bytes_remaining: null,
            },
            'get_details() returns expected values'
        );

        offer.accept();
    } );
    receiver.start();

    return sender.send_offer( {
        name: "my file",
        size: content.length,
        mtime: now_epoch,
        mode: parseInt("0644", 8),
    } ).then(
        (sender_xfer) => {
            sender_xfer.end(content).then( sender.close.bind(sender) );
        }
    );
} );

test('skip one, receive the next', (t) => {
    _init();

    var r_pms = receiver.start().then( (offer) => {
        //console.log("first offer", offer);

        t.equals( offer.get_details().name, "my file", "first file’s name" );
        var next_pms = offer.skip();
        //console.log("next", next_pms);
        return next_pms;
    } ).then( (offer) => {
        t.equals( offer.get_details().name, "file 2", "second file’s name" );
        return offer.skip();
    } );

    var s_pms = sender.send_offer(
        { name: "my file",
    } ).then(
        (sender_xfer) => {
            t.ok( !sender_xfer, "skip() -> sender sees no transfer object" );
            return sender.send_offer( { name: "file 2" } );
        }
    ).then(
        (xfer) => {
            t.ok( !xfer, "2nd skip() -> sender sees no transfer object" );
            return sender.close();
        }
    );

    return Promise.all( [ r_pms, s_pms ] );
} );
