# zmodem.js - ZMODEM for JavaScript

[![build status](https://api.travis-ci.org/FGasper/zmodemjs.svg?branch=master)](http://travis-ci.org/FGasper/zmodemjs)

# SYNOPSIS

    let zmsentry = new Zmodem.Sentry();

    let [terminal_octets, zsession] = zmsentry.parse(input_octets);

    if (zsession) {
        //Set up whatever receives future input_octets to pump into
        //zsession.

        //Tell zsession where to send its output.
        zsession.set_sender( (octets) => { ... } );

        if (zsession.type === "receive") {
            zsession.on("offer", (offer) => { ... });
                offer.skip();

                //...or:

                offer.on("input", (bytes) => { ... });
                offer.accept().then(() => { ... });
            });
            zsession.on("session_end", () => { ... });
            zsession.start();
        }
        else {
            zsession.send_offer( { ... } ).then( (xfer) => {
                if (!xfer) ...; //skipped

                xfer.send( chunk );
                xfer.end( chunk );
            } );
            zsession.close();
        }
    }

# DESCRIPTION

zmodem.js is a JavaScript implementation of the ZMODEM
file transfer protocol, which facilitates file transfers via a terminal.

# STATUS

This library is ALPHA quality. Bugs are not unlikely; also, interfaces
may change from time to time.

# HOW TO USE THIS LIBRARY

The basic workflow is:

1. Create a `Zmodem.Sentry` object that scans all input for
a ZMODEM initialization string.

2. Once that initialization is found, a `Zmodem.Session` is
created. Send all input to that object until it’s finished.

3. Now you do the actual file transfer(s):

    * If the session is a receive session, do something like this:

            zsession.on("offer", (offer) => { ... });
                let { name, size, mtime, mode, serial, files_remaining, bytes_remaining } = offer.get_details();

                offer.skip();

                //...or:

                offer.on("input", (octets) => { ... });

                //accept()’s return resolves when the transfer is complete.
                offer.accept().then(() => { ... });
            });
            zsession.on("session_end", () => { ... });
            zsession.start();

        The `offer` handler receives an Offer object. This object exposes the details
    about the transfer offer. The object also exposes controls for skipping or
    accepting the offer.

    * Otherwise, your session is a send session. Now the user chooses
zero or more files to send. For each of these you should do:

            zsession.send_offer( { ... } ).then( (xfer) => {
                if (!xfer) ... //skipped

                else {
                    xfer.send( chunk );
                    xfer.end( chunk ).then(after_end);
                }
            } );

        Note that `xfer.end()`’s return is a Promise. The resolution of this
Promise is the point at which either to send another offer or to do:

            zsession.close().then( () => { ... } );

        The `close()` Promise’s resolution is the point at which the session
has ended successfully.

That should be all you need. If you want to go deeper, though, each module
in this distribution has JSDoc and unit tests.

# RATIONALE

ZMODEM facilitates terminal-based file transfers.
This was an important capability in the 1980s and early 1990s because
most modem use was for terminal applications, especially
[BBS](https://en.wikipedia.org/wiki/Bulletin_board_system)es.
(This was how, for example,
popular shareware games like [Wolfenstein 3D](http://3d.wolfenstein.com)
were often distributed.) With the growth of the World Wide Web in the
mid-1990s remote terminals became a niche application, and the problem that
ZMODEM solved became a much less important one.

ZMODEM stuck around, though, as it remained a convenient solution
for terminal users who didn’t want open a separate session to transfer a
file. [Uwe Ohse](https://uwe.ohse.de/)’s
[lrzsz](https://ohse.de/uwe/software/lrzsz.html) package
provided a portable C implementation of the protocol (reworked from
the last public domain release of the original code) that is installed on
many systems today.

Where `lrzsz` can’t reach, though, is terminals that don’t have command-line
access—such as terminals that run in JavaScript. Now that
[WebSocket](https://en.wikipedia.org/wiki/WebSocket) makes JavaScript-based
terminals a reality, there is a use case for a JavaScript
implementation of ZMODEM to allow file transfers in this context.

# PROTOCOL NOTES AND ASSUMPTIONS

Here are some notes about this particular implementation.

Particular notes:

* We use a maximum data subpacket size of 8 KiB (8,192 bytes). While
the ZMODEM specification stipulates a maximum of 1 KiB, `lrzsz` accepts
the larger size, and it seems to have become a de facto standard extension
to the protocol.

* Remote command execution (i.e., ZCOMMAND) is unimplemented. Besides being
a glaring security hole, it probably wouldn’t work in web browsers.

* No file translations are done. (Unix/Windows line endings are a
future feature possibility.)

* It is assumed that no error correction will be needed. All connections
are assumed to be **“reliable”**; i.e.,
data is transmitted exactly as intended. We take this for granted today,
but ZMODEM’s original application was over raw modem connections that
often didn’t have reliable hardware error correction. TCP also wasn’t
in play to do software error correction as generally happens
today over remote connections. Because the forseeable use of zmodem.js
is either over TCP or a local socket—both of which are reliable—it seems
safe to assume that zmodem.js will not need to implement error correction.

* CRC-16 is the default, though the library does include CRC-32 logic.
The entire CRC apparatus is unneeded over TCP, but ZMODEM doesn’t allow us
to dispense with it, so we might as well do the simpler variant.

* There is no XMODEM/YMODEM fallback.

# IMPLEMENTATION NOTES

* I’ve had success integrating zmodem.js with
[xterm.js](https://xtermjs.org).

* ZMODEM is a _binary_ protocol. (There was an extension planned
to escape everything down to 7-bit ASCII, but it doesn’t seem to have
been implemented?) Hence, if you’re using WebSocket, you’ll need to
send and receive binary messages, not text.

* It is a generally-unavoidable byproduct of how ZMODEM works that
the first header in a ZMODEM session will echo to the terminal. This
explains the unsightly `**B0000…` stuff that you’ll see when you run
either `rz` or `sz`.

That header
will include some form of line break; from `lrzsz` that means bytes 0x0d
and 0x8a (not 0x0a). Your terminal might react oddly to that; if it does,
try stripping out one or the other line ending character.

# PROTOCOL CHOICE

Both XMODEM and YMODEM (including the latter’s many variants) require the
receiver to initiate the session by sending a “magic character” (ASCII SOH);
the problem is that there’s nothing in the protocol to prompt the receiver
to do so. ZMODEM is sender-driven, so the terminal can show a notice that
says, “Do you want to receive a file?”

This is a shame because these other two protocols are a good deal simpler
than ZMODEM. The YMODEM-g variant in particular would be better-suited to
our purpose because it doesn’t “litter” the transfer with CRCs.

There is also [Kermit](http://www.columbia.edu/kermit/kermit.html), which
seems to be more standardized than ZMODEM but **much** more complex.

# SOURCES

ZMODEM is not standardized in a nice, clean, official RFC like DNS or HTTP;
rather, it was one guy’s solution to a problem that
eventually just became a lot less important than it had been. There is
documentation, but it’s not as helpful as it might be; for example,
there’s only one example workflow given, and it’s a “happy-path”
transmission of a single file.

As part of writing zmodem.js I’ve culled together various resources
about the protocol. As far as I know these are the best sources for
information on ZMODEM.

Two documents that describe ZMODEM are included with this distribution.
The first is the closest there is to an official ZMODEM specification:
a description of the protocol from its author, Chuck Forsberg. The second
seems to be based on the first and comes from
[Jacques Mattheij](https://jacquesmattheij.com).

Here are some other available ZMODEM implementations:

* [lrzsz](https://ohse.de/uwe/software/lrzsz.html)

    A widely-deployed adaptation of Forsberg’s last public domain ZMODEM
    code. This is the de facto “reference” implementation, both by virtue
    of its wide availability and its derivation from Forsberg’s original.
    If your server has the `rz` and `sz` commands, they’re probably
    from this package.

    NB: I have not found Forsberg’s original “szrz” code. If you have this
or know where to find it, please contact me.

* [SyncTERM](http://syncterm.bbsdev.net)

    Based on Jacques Mattheij’s ZMODEM implementation, originally called
    zmtx/zmrx. This is a much more readable implementation than lrzsz
    but lamentably one that doesn’t seem to compile as readily.

* [Qodem](https://github.com/klamonte/qodem)

    This terminal emulator package appears to contain its own ZMODEM
    implementation.

* [PD Zmodem](http://pcmicro.com/netfoss/pdzmodem.html)

    I know nothing of this one.

* [zmodem (Rust)](https://github.com/lexxvir/zmodem)

    A pure [Rust](http://rust-lang.org) implementation of ZMODEM.

# REQUIREMENTS

There are no external requirements; however, zmodem.js needs some fairly modern
JavaScript APIs (or shims to emulate them):

* You’ll probably need the `download` attribute on `<a>` elements to receive files. (Or Flash, I guess … *\<shudder\>*)

* [TextEncoder](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder) and [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)

* [ES6 Classes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes)

I’ve tried to stay away from dependence on other ES6 patterns in the
production code.

# CONTRIBUTING

Contributions are welcome via the GitHub repository,
https://github.com/FGasper/zmodemjs.

# TODO

* Be more resilient against failures, including cancellation.

* Error classes, probably using ES6 `Error` subclassing. Add
documentation.

* More testing.

# COPYRIGHT

Copyright 2017 Gasper Software Consulting

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
