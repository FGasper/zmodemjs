#!/usr/bin/env node

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
    receiver.on("receive", function(hdr) {
        console.log("Receiver input", hdr);
    } );
    receiver.on("offer", function(my_offer) {
        console.log("RECEIVED OFFER (window.offer)", my_offer);
        offer = my_offer;
    });

    var resolver;
    sender_promise = new Promise( (res, rej) => { resolver = res; } );

    function receiver_sender(bytes_arr) {
        //console.log("receiver sending", String.fromCharCode.apply(String, bytes_arr), bytes_arr);

        if (sender) {
            var consumer = () => {
                console.log("SENDER CONSUMING");
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

            sender.on("receive", function(hdr) {
                console.log("Sender input", hdr);
            } );
        }
    }

    receiver.set_sender(receiver_sender);
}

test('receive one - synchronous', (t) => {
    _init();

    receiver.start();

    return sender.send_offer( { name: "my file", size: 32 } ).then( (sender_xfer) => {
        t.deepEquals(
            offer.get_details(),
            {
                name: "my file",
                size: 32,
                mode: undefined,
                mtime: undefined,
                serial: 0,
                files_remaining: undefined,
                bytes_remaining: undefined,
            },
        );

        offer.accept();
        sender_xfer.end_file( [12, 23, 34] );
        sender.close();
    } );
} );

test('empty', (t) => {
    return Promise.resolve().then( () => t.is( 1, 1, 'yeah' ) );
} );

function _setup_async_receiver() {
    function offer_handler(offer) {
        if (!offer) {
            console.log("Receiver got NO OFFER");
            return;
        }

        var promise;

        if (offer.get_details().name === "BAD") {
            promise = offer.skip();
        }
        else {
            var received_file = [];
            offer.on("input", (payload) => {
console.log("PAYLOAD CHUNK", payload);
               received_file.push.apply(received_file, payload);
            });
            promise = offer.accept().then( function(xfer) {
                console.log("FILE TRANSFERRED - bytes:", received_file);
                return xfer;
            } );
        }

        //Here is our recursion.
        return promise.then(offer_handler);
    }

    receiver.start().then(offer_handler);
}

function test_receive_one() {
    _init("async");

    /*
    receiver.on("offer", xfer => {
        console.log("RECEIVED OFFER", xfer.get_details());
        xfer.accept().then( () => console.log("RECEIVER COMPLETED FILE") );
    } );

    receiver.on("session_end", () => console.log("RECEIVER SESSION ENDED"));
    */

    _setup_async_receiver();

    sender_promise.then(sender => {
        sender.send_offer( { name: "my file" } ).then(
            () => sender.end_file( [12, 23, 34] )
        ).then(
            () => sender.close()
        ).then(
            () => console.log("The End")
        ).catch( err => console.error(err) );
    });
}

function test_receive_multiple() {
    _init("async");

    /*
    receiver.on("offer", xfer => {
        console.log("RECEIVED OFFER", xfer.get_details());

        if (xfer.get_details().name === "BAD") {
            xfer.skip();
        }
        else {
            xfer.accept().then( () => {
                console.log("RECEIVER ACCEPTED AND COMPLETED FILE");
                console.trace();
            } );
        }
    } );

    receiver.on("session_end", () => console.log("RECEIVER SESSION ENDED"));

    receiver.start();
    */

    _setup_async_receiver();

    sender_promise.then(sender => {
        sender.send_offer( { name: "my file" } ).then(
            () => sender.end_file( [12, 23, 34] )
        ).then(
            () => sender.send_offer( { name: "my bigger file" } )
        ).then(
            () => {
                var biggie = Array(65536).fill(42);
                return sender.send_file_piece(biggie);
            }
        ).then(
            () => sender.end_file( [84, 84] )
        ).then(
            () => sender.send_offer( { name: "BAD" } )
        ).then(
            () => sender.close()
        ).then(
            () => console.log("The End")
        ).catch( err => console.error(err) );
    });

    console.log("All in motion!");
}

function test_receive_multiple__sync() {
    _init();

    receiver.start();

    sender.send_offer( { name: "my file" } );
    offer.accept();
    var file1 = [];
    offer.on("input", function(chunk) { file1.push.apply(file1, chunk) });
    offer.on("complete", function() { console.log("FILE COMPLETE", file1) });
    sender.send_file_piece( [12, 23, 34] );
    sender.end_file( [12, 23, 34] );

    sender.send_offer( { name: "my second file" } );
    offer.accept();
    sender.end_file( [200, 201, 202, 1, 1, 1, 1, 1, 1, 1] );

    sender.close();
}
