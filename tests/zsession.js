#!/usr/bin/env node

"use strict";

const test = require('tape');

const helper = require('./lib/testhelp');
global.Zmodem = require('./lib/zmodem');

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

test('Sender receives extra ZRPOS', (t) => {
    _init();

    var zrinit = Zmodem.Header.build("ZRINIT", ["CANFDX", "CANOVIO", "ESCCTL"]);
    var mysender = new Zmodem.Session.Send(zrinit);

    var zrpos = Zmodem.Header.build("ZRPOS", 12345);

    var err;

    try {
        mysender.consume(zrpos.to_hex());
    }
    catch(e) {
        err = e;
    }

    t.match(err.toString(), /header/, "error as expected");
    t.match(err.toString(), /ZRPOS/, "error as expected");

    return Promise.resolve();
} );

test('Offer events', (t) => {
    _init();

    var inputs = [];
    var completed = false;

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

        offer.on("input", (payload) => {
            inputs.push(
                {
                    offset: offer.get_offset(),
                    payload: payload,
                }
            );
        } );

        offer.on("complete", () => { completed = true });

        return offer.accept();
    } );

    var s_pms = sender.send_offer(
        { name: "my file", size: 32 }
    ).then( (sender_xfer) => {
        sender_xfer.send( [1, 2, 3] );
        sender_xfer.send( [4, 5, 6, 7] );
        sender_xfer.end( [8, 9] ).then( () => {
            return sender.close();
        } );
    } );

    return Promise.all( [ r_pms, s_pms ] ).then( () => {
        t.deepEquals(
            inputs,
            [
                {
                    payload: [1, 2, 3],
                    offset: 3,
                },
                {
                    payload: [4, 5, 6, 7],
                    offset: 7,
                },
                {
                    payload: [8, 9],
                    offset: 9,
                },
            ],
            'Offer “input” events',
        );

        t.ok( completed, 'Offer “complete” event' );
    } );
} );

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
        { name: "my file" }
    ).then(
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

test('abort mid-download', (t) => {
    _init();

    var transferred_bytes = [];

    var aborted;

    var r_pms = receiver.start().then( (offer) => {
        offer.on("input", (payload) => {
            [].push.apply(transferred_bytes, payload);

            if (aborted) throw "already aborted!";
            aborted = true;

            receiver.abort();
        });
        return offer.accept();
    } );

    var s_pms = sender.send_offer(
        { name: "my file" }
    ).then(
        (xfer) => {
            xfer.send( [1, 2, 3] );
            xfer.end( [99, 99, 99] );   //should never get here
        }
    );

    return Promise.all( [r_pms, s_pms] ).catch(
        (err) => {
            t.ok( err.message.match('abort'), 'error message is about abort' );
        }
    ).then( () => {
        t.deepEquals(
            transferred_bytes,
            [1, 2, 3],
            'abort() stopped us from sending more',
        );
    } );
} );
