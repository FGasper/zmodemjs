"use strict";

// A proof-of-concept CLI implementation of “sz” using zmodem.js.
// This is not tested extensively and isn’t really meant for production use.

const process = require('process');
const fs = require('fs');
const Zmodem = require('../src/zmodem');

var paths = process.argv.slice(1);

// Accommodate “node $script …”
if (paths[0] === __filename) {
    paths = paths.slice(1);
}

if (!paths.length) {
    console.error("Need at least one path!");
    process.exit(1);
}

// Can’t be to the same terminal as STDOUT.
// npm’s “ttyname” can tell us, but it’s annoying to require
// a module for this.
const DEBUG = false;

if (DEBUG) {
    var outtype = fs.fstatSync(1).mode & fs.constants.S_IFMT;
    var errtype = fs.fstatSync(1).mode & fs.constants.S_IFMT;

    if (outtype === errtype && outtype === fs.constants.S_IFCHR) {
        console.error("STDOUT and STDERR can’t both be to a terminal when debugging is on.");
        process.exit(1);
    }
}

function _debug() {
    DEBUG && console.warn.apply( console, arguments );
}

_debug("PID:", process.pid);
_debug("Paths to send:", paths);

//----------------------------------------------------------------------

var path_fd = {};
paths.forEach( (path) => path_fd[path] = fs.openSync(path, 'r') );

// TODO: This should maybe be in its own module?
// The notion of starting a session in JS wasn’t envisioned when
// this module was written.
const initial_bytes = Zmodem.Header.build("ZRQINIT").to_hex();

process.stdout.write(Buffer.from(initial_bytes));
_debug('Sent ZRQINIT');

// We need a binary stdin.
var stdin = fs.createReadStream( "", { fd: 0 } );

function send_files(zsession, paths) {
    function send_next() {
        var path = paths.shift();

        if (path) {
            _debug("Sending offer: ", path);

            var fd = path_fd[path];
            var fstat = fs.fstatSync(fd);

            var filename = path.match(/.+\/(.+)/);
            filename = filename ? filename[0] : path;

            return zsession.send_offer( {
                name: filename,
                size: fstat.size,
                mtime: Math.round( fstat.mtimeMs / 1000 ),
            } ).then( (xfer) => {
                if (!xfer) {
                    _debug("Offer was rejected.");
                    return send_next();
                }

                _debug("Offer was accepted.");

                var stream = fs.createReadStream( "", {
                    fd: fd,
                } );

                stream.on('data', (chunk) => {
                    _debug("Sending chunk.");
                    xfer.send(chunk);
                } );

                return new Promise( (res, rej) => {
                    stream.on('end', () => {
                        _debug("Reached EOF; sending end.");
                        xfer.end().then( () => {;
                            res( send_next() );
                        } );
                    } );
                } );
            } );
        }
        else {
            _debug("Reached end of files batch.");
        }
    }

    return send_next();
}

var zsession;

stdin.on('data', (chunk) => {
    var octets = Array.from(chunk)

    if (zsession) {
        zsession.consume(octets);
    }
    else {
        _debug("Received on STDIN; checking for session.", octets);

        zsession = Zmodem.Session.parse(octets);

        if (zsession) {
            _debug("Got session.");

            // It seems like .parse() should strip out the header bytes,
            // but that’s not how it works.
            // zsession.consume(octets);

            zsession.set_sender( (octets) => process.stdout.write( Buffer.from(octets) ) );

            send_files(zsession, paths).then( () => zsession.close() );
        }
        else {
            _debug("No session yet …");
        }
    }
});
