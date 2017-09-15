( function() {
"use strict";

const
    //pertinent to this module
    KEEPALIVE_INTERVAL = 5000,
    ZRINIT_FLAGS = [ "CANFDX", "CANOVIO" ],

    //We do this because some WebSocket shell servers
    //(e.g., xterm.js’s demo server) enable the IEXTEN termios flag,
    //which bars 0x0f and 0x16 from reaching the shell process,
    //which results in transmission errors.
    FORCE_ESCAPE_CTRL_CHARS = true,

    //pertinent to ZMODEM
    MAX_CHUNK_LENGTH = 8192,    //1 KiB officially, but lrzsz allows 8192
    BS = 0x8,
    OVER_AND_OUT = [ 79, 79 ],
    ABORT_SEQUENCE = Zmodem.ZMLIB.ABORT_SEQUENCE
;

class _Eventer {
    constructor() {
        this._on_evt = {};
        this._evt_once_index = {};
    }

    _Add_event(evt_name) {
        this._on_evt[evt_name] = [];
        this._evt_once_index[evt_name] = [];
    }

    _get_evt_queue(evt_name) {
        if (!this._on_evt[evt_name]) {
            throw( "Bad event: " + evt_name );
        }

        return this._on_evt[evt_name];
    }

    on(evt_name, todo) {
        var queue = this._get_evt_queue(evt_name);

        queue.push(todo);

        return this;
    }

    off(evt_name, todo) {
        var queue = this._get_evt_queue(evt_name);

        if (todo) {
            var at = queue.indexOf(todo);
            if (at === -1) {
                throw("“" + todo + "” is not in the “" + evt_name + "” queue.");
            }
            queue.splice(at, 1);
        }
        else {
            queue.pop();
        }

        return this;
    }

    _Happen(evt_name /*, arg0, arg1, .. */) {
        var queue = this._get_evt_queue(evt_name);   //might as well validate

        //console.info("EVENT", this, arguments);

        var args = Array.apply(null, arguments);
        args.shift();

        var sess = this;

        queue.forEach( function(cb) { cb.apply(sess, args) } );

        return queue.length;
    }
}

/**
The Session classes handle the protocol-level logic.
These shield the user from dealing with headers and subpackets.
*/
Zmodem.Session = class ZmodemSession extends _Eventer {

    /**
     * Parse out a hex header from the given array.
     * If there’s a ZRQINIT or ZRINIT at the beginning,
     * we’ll return it. If the input isn’t a header,
     * for whatever reason, we return undefined.
     *
     * @param {Array} octets - The bytes to parse.
     *
     * @return {Array|undefined} A Session object if the beginning
     *      of a session was parsable in “octets”; otherwise undefined.
     */
    static parse( octets ) {

        //Will need to trap errors.
        var hdr;
        try {
            hdr = Zmodem.Header.parse_hex(octets);
        }
        catch(e) {     //Don’t report since we aren’t in session

            //debug
            //console.warn("No hex header: ", e);

            return;
        }

        if (!hdr) return;

        switch (hdr.NAME) {
            case "ZRQINIT":
                //throw if ZCOMMAND
                return new Zmodem.Session.Receive();
            case "ZRINIT":
                return new Zmodem.Session.Send(hdr);
        }

        //console.warn("Invalid first Zmodem header", hdr);
    }

    /**
     * Sets the sender function that a Session object will use.
     *
     * @param {Function} sender_func - The function to call.
     *      It will receive an Array with the relevant octets.
     *
     * @return {Session} The session object (for chaining).
     */
    set_sender(sender_func) {
        this._sender = sender_func;
        return this;
    }

    /**
     * Consumes an array of octets as ZMODEM session input.
     *
     * @param {Function} array_buf - The input octets.
     */
    consume(array_buf) {
        if (!array_buf.length) return;

        this._strip_and_enqueue_input(array_buf);

        if (!this._check_for_abort_sequence(array_buf)) {
            this._consume_first();
        }

        //console.log("after consume", this, this._input_buffer);

        return;
    }

    constructor() {
        super();
        //if (!sender_func) throw "Need sender!";

        //this._first_header = first_header;
        //this._sender = sender_func;
        this._config = {};

        //this._input = new ZInput();

        this._input_buffer = [];

        //This is mostly for debugging.
        this._Add_event("receive");
        this._Add_event("garbage");
        this._Add_event("session_end");
    }

    _trim_leading_garbage_until_header() {
        var garbage = Zmodem.Header.trim_leading_garbage(this._input_buffer);

        if (garbage.length) {
            if (this._Happen("garbage", garbage) === 0) {
                console.debug(
                    "Garbage: ",
                    String.fromCharCode.apply(String, garbage),
                    garbage
                );
            }
        }
    }

    _parse_and_consume_header() {
        this._trim_leading_garbage_until_header();

        var new_header_and_crc = Zmodem.Header.parse(this._input_buffer);
        if (!new_header_and_crc) return;

        this._consume_header(new_header_and_crc[0]);

        this._last_header_name = new_header_and_crc[0].NAME;
        this._last_header_crc = new_header_and_crc[1];

        //console.log("RECEIVED HEADER", new_header_and_crc[0]);

        return new_header_and_crc[0];
    }

    _consume_header(new_header) {
        this._on_receive(new_header);

        var handler = this._next_header_handler[ new_header.NAME ];
        if (!handler) {
            console.error("Unhandled header!", new_header);
            throw( "Unhandled header: " + new_header.NAME );
        }

        this._next_header_handler = null;

        handler.call(this, new_header);
    }

    //TODO: strip out the abort sequence
    _check_for_abort_sequence() {
        var abort_at = Zmodem.ZMLIB.find_subarray( this._input_buffer, ABORT_SEQUENCE );

        if (abort_at !== -1) {

            //TODO: expose this to caller
            this._input_buffer.splice( 0, abort_at + ABORT_SEQUENCE.length );

            //TODO compare response here to lrzsz.
            this._on_session_end();

            if (this._expect_abort) {
                return true;
            }

            throw("Received abort signal!");
        }
    }

    _send_header(name /*, args */) {
        if (!this._sender) throw "Need sender!";

        var args = Array.apply( null, arguments );

        var hdr = Zmodem.Header.build.apply( Zmodem.Header, args );

        //console.log( this.type, "SENDING HEADER", hdr );

        var formatter = this._get_header_formatter(name);

        this._sender( hdr[formatter](this._zencoder) );

        this._last_sent_header = hdr;
    }

    _strip_and_enqueue_input(input) {
        Zmodem.ZMLIB.strip_ignored_bytes(input);

        //It’s possible that “input” is empty at this point.
        //It doesn’t seem to hurt anything to keep processing, though.

        this._input_buffer.push.apply( this._input_buffer, input );
    }

    //Forsberg is a bit murky (IMO) about the mechanics of session aborts.
    //TODO: Test this against lrzsz.
    abort() {

        this._expect_abort = true;

        //From Forsberg:
        //
        //The Cancel sequence consists of eight CAN characters
        //and ten backspace characters. ZMODEM only requires five
        //Cancel characters; the other three are "insurance".
        //The trailing backspace characters attempt to erase
        //the effects of the CAN characters if they are
        //received by a command interpreter.
        //
        //FG: Since we assume our connection is reliable, there’s
        //no reason to send more than 5 CANs.
        this._sender(
            ABORT_SEQUENCE.concat([
                BS, BS, BS, BS, BS,
            ])
        );

        //throw "What now? Reject outstanding promises ...";

        return;
    }

    //----------------------------------------------------------------------



    //----------------------------------------------------------------------
    _on_session_end() {
        this._Happen("session_end");
    }

    _on_receive(hdr_or_pkt) {
        this._Happen("receive", hdr_or_pkt);
    }
}

function _trim_OO(array) {
    if (0 === Zmodem.ZMLIB.find_subarray(array, OVER_AND_OUT)) {
        array.splice(0, OVER_AND_OUT.length);
    }

    //TODO: This assumes OVER_AND_OUT is 2 bytes long. No biggie, but.
    else if ( array[0] === OVER_AND_OUT[ OVER_AND_OUT.length - 1 ] ) {
        array.splice(0, 1);
    }

    return array;
}

//----------------------------------------------------------------------
// Workflow:
//  1) session = ZmodemSession.check_for_start(input_chunk);
//      ^^ until we get a “session” object
//  2) Add sender and event handlers:
//      on("offer") - should either accept() or skip()
//      on("file_end")  (“transfer_complete”?)
//      on("session_end")
//  3) start()
//  4) Every time a file request comes in, either accept() or skip()
//  5) After the session is done, be sure to check get_trailing_bytes()
//      and send those to the terminal.
//
//This guy will send all headers as hex.
//(… which I guess is why there’s no TCANFC32?)
//But then why need ZDLE encoding?
Zmodem.Session.Receive = class ZmodemReceiveSession extends Zmodem.Session {
    //We only get 1 file at a time, so on each consume() either
    //continue state for the current file or start a new one.

    constructor() {
        super();

        this._Add_event("offer");
        this._Add_event("data_in");
        this._Add_event("file_end");
    }

    consume(array_buf) {
        if (this._bytes_after_OO) {
            throw "PROTOCOL: Session is completed!";
        }

        //Put this here so that our logic later on has access to the
        //input string and can populate _bytes_after_OO when the
        //session ends.
        this._bytes_being_consumed = array_buf;

        super.consume(array_buf);
    }

    get_trailing_bytes() {
        if (!this._bytes_after_OO) {
            throw "PROTOCOL: Session is not completed!";
        }

        return this._bytes_after_OO.slice(0);
    }

    has_ended() { return !!this._bytes_after_OO }

    //Receiver always sends hex headers.
    _get_header_formatter() { return "to_hex" }

    _parse_and_consume_subpacket() {
        var parse_func;
        if (this._last_header_crc === 16) {
            parse_func = "parse16";
        }
        else {
            parse_func = "parse32";
        }

        var subpacket = Zmodem.Subpacket[parse_func](this._input_buffer);

        //console.log("RECEIVED SUBPACKET", subpacket);

        if (subpacket) {

            //What state are we in if the subpacket indicates frame end
            //but we haven’t gotten ZEOF yet? Can anything other than ZEOF
            //follow after a ZDATA?
            this._expect_data = !subpacket.frame_end();
            this._consume_data(subpacket);
        }

        return subpacket;
    }

    _consume_first() {
        if (this._got_ZFIN) {
            if (this._input_buffer.length < 2) return;

            //if it’s OO, then set this._bytes_after_OO
            if (Zmodem.ZMLIB.find_subarray(this._input_buffer, OVER_AND_OUT) === 0) {

                //This doubles as an indication that the session has ended.
                //We need to set this right away so that handlers like
                //"session_end" will have access to it.
                this._bytes_after_OO = _trim_OO(this._bytes_being_consumed.slice(0));
                this._on_session_end();

                return;
            }
            else {
                throw( "PROTOCOL: Only thing after ZFIN should be “OO” (79,79), not: " + array_buf.join() );
            }
        }

        var parsed;
        do {
            if (this._expect_data) {
                parsed = this._parse_and_consume_subpacket();
            }
            else {
                parsed = this._parse_and_consume_header();
            }
        } while (parsed && this._input_buffer.length);
    }

    _consume_data(subpacket) {
        this._on_receive(subpacket);

        if (!this._next_subpacket_handler) {
            throw( "PROTOCOL: Received unexpected data packet after " + this._last_header_name + " header" );
        }

        this._next_subpacket_handler.call(this, subpacket);
    }

    _octets_to_string(octets) {
        if (!this._textdecoder) {
            this._textdecoder = new TextDecoder();
        }

        return this._textdecoder.decode( new Uint8Array(octets) );
    }

    _consume_ZFILE_data(subpacket) {
        if (this._file_info) {
            throw "PROTOCOL: second ZFILE data subpacket received";
        }

        var packet_payload = subpacket.get_payload();
        var nul_at = packet_payload.indexOf(0);

        //
        var fname = this._octets_to_string( packet_payload.slice(0, nul_at) );
        var the_rest = this._octets_to_string( packet_payload.slice( 1 + nul_at ) ).split(" ");

        var mtime = the_rest[1] && parseInt( the_rest[1], 8 ) || undefined;
        if (mtime) {
            mtime = new Date(mtime * 1000);
        }

        this._file_info = {
            name: fname,
            size: the_rest[0] && parseInt( the_rest[0], 10 ),
            mtime: mtime,
            mode: the_rest[2] && parseInt( the_rest[2], 8 ) || undefined,
            serial: the_rest[3] && parseInt( the_rest[3], 10 ) || undefined,

            files_remaining: the_rest[4] && parseInt( the_rest[4], 10 ),
            bytes_remaining: the_rest[5] && parseInt( the_rest[5], 10 ),
        };

        var xfer = new ZmodemOffer(
            this._file_info,
            this._accept.bind(this),
            this._skip.bind(this)
        );
        this._current_transfer = xfer;

        //this._Happen("offer", xfer);
    }

    /*
    get_file_info() {
        return JSON.parse( JSON.stringify( this._file_info ) );
    }
    */

    _consume_ZDATA_data(subpacket) {
        if (!this._accepted_offer) {
            throw "PROTOCOL: Received data without accepting!";
        }

        //TODO: Probably should include some sort of preventive against
        //infinite loop here: if the peer hasn’t sent us what we want after,
        //say, 10 ZRPOS headers then we should send ZABORT and just end.
        if (!this._offset_ok) {
            console.warn("offset not ok!");
            _send_ZRPOS();
            return;
        }

        try {
            this._on_data_in(subpacket);
            this._file_offset += subpacket.get_payload().length;
        }
        catch(e) {
            console.warn("received error from data_in callback; retrying", e);
            throw "unimplemented";
        }

        if (subpacket.ack_expected() && !subpacket.frame_end()) {
            this._send_header( "ZACK", Zmodem.ENCODELIB.pack_u32_le(this._file_offset) );
        }
    }

    get_file_offset() { return this._file_offset }

    _make_promise_for_between_files() {
        var sess = this;

        return new Promise( function(res) {
            sess._next_header_handler = {
                ZFILE: function(hdr) {
                    this._consume_ZFILE(hdr);
                    this._expect_data = true;
                    this._next_subpacket_handler = function(subpacket) {
                        this._expect_data = false;
                        this._consume_ZFILE_data(subpacket);
                        this._Happen("offer", this._current_transfer);
                        res(this._current_transfer);
                    };
                },

                ZFIN: function() {
                    this._consume_ZFIN();
                    res();
                },
            };
        } );
    }

    //This returns a promise that’s fulfilled on an offer or close.
    //Once this promise resolves, we should either accept() or skip()
    //on the passed transfer/offer object. (If it’s a close, there is
    //nothing passed to the resolver.)
    start() {
        if (this._started) throw "Already started!";
        this._started = true;

        var ret = this._make_promise_for_between_files();

        this._send_ZRINIT();

        return ret;
    }

    //Returns a promise that’s fulfilled when the file
    //transfer is done.
    //
    //  That ZEOF promise return is another promise that’s
    //  fulfilled when we get either ZFIN or another ZFILE.
    _accept(offset) {
        this._accepted_offer = true;
        this._file_offset = offset || 0;

        var sess = this;

        var ret = new Promise( function(resolve_accept) {
            var last_ZDATA;

            sess._next_header_handler = {
                ZDATA: function on_ZDATA(hdr) {
                    this._expect_data = true;
                    this._consume_ZDATA(hdr);

                    this._next_subpacket_handler = this._consume_ZDATA_data;

                    this._next_header_handler = {
                        ZEOF: function on_ZEOF(hdr) {
                            this._expect_data = false;
                            this._next_subpacket_handler = null;
                            this._consume_ZEOF(hdr);

                            var next_promise = this._make_promise_for_between_files();
                            resolve_accept(next_promise);
                        },
                    };
                },
            };
        } );

        this._send_ZRPOS();

        return ret;
    }
    _skip() {
        this._accepted_offer = false;
        //this._expect_data = false;

        this._file_info = null;

        var ret = this._make_promise_for_between_files();

        this._send_header( "ZSKIP" );

        return ret;
    }

    _send_ZRINIT() {
        this._send_header( "ZRINIT", ZRINIT_FLAGS );
    }

    _consume_ZFIN() {
        this._got_ZFIN = true;
        this._send_header( "ZFIN" );
    }

    _consume_ZEOF(header) {
        if (this._file_offset !== header.get_offset()) {
            throw( "ZEOF offset mismatch; unimplemented (local: " + this._file_offset + "; ZEOF: " + header.get_offset() + ")" );
        }

        this._send_ZRINIT();

        this._on_file_end();

        //Preserve these two so that file_end callbacks
        //will have the right information.
        this._file_info = null;
        this._current_transfer = null;
    }

    _consume_ZFILE(header) {
        this._expect_data = true;

        //TODO: See about accepting any of the special ZFILE flags
        //like line-end transformations and file replacement requests.
    }

    _consume_ZDATA(header) {
        if ( this._file_offset === header.get_offset() ) {
            this._offset_ok = true;
            this._expect_data = true;
        }
        else {
            throw "Error correction is unimplemented.";
        }
    }

    _send_ZRPOS() {
        this._send_header( "ZRPOS", this._file_offset );
    }

    //----------------------------------------------------------------------
    //events

    _on_file_end(subpacket) {
        this._Happen("file_end");

        if (this._current_transfer) {
            this._current_transfer._Happen("complete", subpacket);
            this._current_transfer = null;
        }
    }

    _on_data_in(subpacket) {
        this._Happen("data_in", subpacket);

        if (this._current_transfer) {
            this._current_transfer._Happen("input", subpacket.get_payload());
        }
    }
}

Object.assign(
    Zmodem.Session.Receive.prototype,
    {
        type: "receive",
    }
);

var Transfer_Offer_Mixin = {
    get_details() {
        return JSON.parse( JSON.stringify( this._file_info ) );
    },

    get_offset() { return this._file_offset }
};

class ZmodemTransfer {
    constructor(file_info, offset, send_func, end_func) {
        this._file_info = file_info;
        this._file_offset = offset || 0;

        this._send = send_func;
        this._end = end_func;
    }

    send(array_like) {
        var ret = this._send(array_like);
        this._file_offset += array_like.length;
        return ret;
    }

    //Argument is optional.
    end(array_like) {
        var ret = this._end(array_like || []);
        if (array_like) this._file_offset += array_like.length;
        return ret;
    }
}
Object.assign( ZmodemTransfer.prototype, Transfer_Offer_Mixin );

class ZmodemOffer extends _Eventer {
    constructor(file_info, accept_func, skip_func) {
        super();

        this._file_info = file_info;

        this._accept_func = accept_func;
        this.skip = skip_func;

        this._Add_event("input");
        this._Add_event("complete");

        var xfer = this;
        this.on("input", function(payload) {
            this._file_offset += payload.length;
        } );
    }

    accept(offset) {
        this._file_offset = offset || 0;
        return this._accept_func(offset);
    }
}
Object.assign( ZmodemOffer.prototype, Transfer_Offer_Mixin );

/*
function _throw_if_not_number(value, name) {
    if (typeof value !== "number") {
        if (name) {
            throw( "“" + name + "” must be a number!" );
        }

        throw "must be a number!";
    }
}
*/

//Curious that ZSINIT isn’t here … but, lsz sends it as hex.
const SENDER_BINARY_HEADER = {
    ZFILE: true,
    ZDATA: true,
};

Zmodem.Session.Send = class ZmodemSendSession extends Zmodem.Session {
    constructor(zrinit_hdr) {
        super();

        if (!zrinit_hdr) {
            throw "Need first header!";
        }
        else if (zrinit_hdr.NAME !== "ZRINIT") {
            throw("First header should be ZRINIT, not " + zrinit_hdr.NAME);
        }

        this._last_header_name = 'ZRINIT';

        //We don’t need to send crc32. Even if the other side can grok it,
        //there’s no point to sending it since, for now, we assume we’re
        //on a reliable connection, e.g., TCP. Ideally we’d just forgo
        //CRC checks completely, but ZMODEM doesn’t allow that.
        //
        //If we *were* to start using crc32, we’d update this every time
        //we send a header.
        this._subpacket_encode_func = 'encode16';

        this._zencoder = new Zmodem.ZDLE();

        this._consume_ZRINIT(zrinit_hdr);

        this._file_offset = 0;

        var zrqinit_count = 0;

        this._start_keepalive_on_set_sender = true;

        //lrzsz will send ZRINIT until it gets an offer. (keep-alive?)
        //It sends 4 additional ones after the initial ZRINIT and, if
        //no response is received, starts sending “C” (0x43, 67) as if to
        //try to downgrade to XMODEM or YMODEM.
        //var sess = this;
        //this._prepare_to_receive_ZRINIT( function keep_alive() {
        //    sess._prepare_to_receive_ZRINIT(keep_alive);
        //} );

        //queue up the ZSINIT flag to send -- but seems useless??

        /*
        Object.assign(
            this._on_evt,
            {
                file_received: [],
            },
        };
        */
    }

    set_sender(func) {
        super.set_sender(func);

        if (this._start_keepalive_on_set_sender) {
            this._start_keepalive_on_set_sender = false;
            this._start_keepalive();
        }
    }

    //7.3.3 .. The sender also uses hex headers when they are
    //not followed by binary data subpackets.
    //
    //FG: … or when the header is ZSINIT? That’s what lrzsz does, anyway.
    //Then it sends a single NUL byte as the payload to an end_ack subpacket.
    _get_header_formatter(name) {
        return SENDER_BINARY_HEADER[name] ? "to_binary16" : "to_hex";
    }

    //In order to keep lrzsz from timing out, we send ZSINIT every 5 seconds.
    //Maybe make this configurable?
    _start_keepalive() {
        //if (this._keepalive_promise) throw "Keep-alive already started!";
        if (!this._keepalive_promise) {
            var sess = this;

            this._keepalive_promise = new Promise(function(resolve) {
                //console.log("SETTING KEEPALIVE TIMEOUT");
                sess._keepalive_timeout = setTimeout(resolve, KEEPALIVE_INTERVAL);
            }).then( function() {
                sess._next_header_handler = {
                    ZACK: function() {

                        //We’re going to need to ensure that the
                        //receiver is ready for all control characters
                        //to be escaped. If we’ve already sent a ZSINIT
                        //and gotten a response, then we know that that
                        //work is already done later on when we actually
                        //send an offer.
                        sess._got_ZSINIT_ZACK = true;
                    },
                };
                sess._send_ZSINIT();

                sess._keepalive_promise = null;
                sess._start_keepalive();
            });
        }
    }

    _stop_keepalive() {
        if (this._keepalive_promise) {
            //console.log("STOPPING KEEPALIVE");
            clearTimeout(this._keepalive_timeout);
            this._keep_alive_promise = null;
        }
    }

    _send_ZSINIT() {
        //See note at _ensure_receiver_escapes_ctrl_chars()
        //for why we have to pass ESCCTL.

        var zsinit_flags = [];
        if (this._zencoder.escapes_ctrl_chars()) {
            zsinit_flags.push("ESCCTL");
        }

        this._send_header("ZSINIT", zsinit_flags);

        //this._send_data( this._get_attn(), "end_ack" );
        this._build_and_send_subpacket( [0], "end_ack" );
    }

    _get_attn() {
        if (!this._attn) {
            //var octets = Zmodem.ZMLIB.get_random_octets( 31 );
            var octets = new Array(31);
            octets.fill( 42, 0, octets.length );
            this._attn = octets.concat( [0] );
        }
        return this._attn;
    }

    _consume_ZRINIT(hdr) {
        this._last_ZRINIT = hdr;

        if (hdr.get_buffer_size()) {
            throw( "Buffer size (" + hdr.get_buffer_size() + ") is unsupported!" );
        }

        if (!hdr.can_full_duplex()) {
            throw( "Half-duplex I/O is unsupported!" );
        }

        if (!hdr.can_overlap_io()) {
            throw( "Non-overlap I/O is unsupported!" );
        }

        if (hdr.escape_8th_bit()) {
            throw( "8-bit escaping is unsupported!" );
        }

        if (FORCE_ESCAPE_CTRL_CHARS) {
            this._zencoder.set_escape_ctrl_chars(true);
            if (!hdr.escape_ctrl_chars()) {
                console.debug("Peer didn’t request escape of all control characters. Will send ZSINIT to force recognition of escaped control characters.");
            }
        }
        else {
            this._zencoder.set_escape_ctrl_chars(hdr.escape_ctrl_chars());
        }
    }

    //https://stackoverflow.com/questions/23155939/missing-0xf-and-0x16-when-binary-data-through-virtual-serial-port-pair-created-b
    //^^ Because of that, we always have to escape control characters.
    //It’s arguably a bug in lrzsz, but at this point lrzsz is basically
    //both unmaintained and the de facto standard. :-(
    _ensure_receiver_escapes_ctrl_chars() {
        var promise;

        var needs_ZSINIT = !this._last_ZRINIT.escape_ctrl_chars() && !this._got_ZSINIT_ZACK;

        if (needs_ZSINIT) {
            var sess = this;
            promise = new Promise( function(res) {
                sess._next_header_handler = {
                    ZACK: res,
                };
                sess._send_ZSINIT();
            } );
        }
        else {
            promise = Promise.resolve();
        }

        return promise;
    }

    send_offer(params) {
        if (!params) throw "need file params!";
        if (!params.name) throw "need “name”!";

        if (this._sending_file) throw "Already sending file!";

        this._stop_keepalive();

        var subpacket_payload = params.name + "\x00";

        var subpacket_space_pieces = [
            (params.size || 0).toString(10),
            params.mtime ? params.mtime.toString(8) : "0",
            params.mode ? (0x8000 | params.mode).toString(8) : "0",
            "0",    //serial
        ];

        if (params.files_remaining) {
            subpacket_space_pieces.push( params.files_remaining );

            if (params.bytes_remaining) {
                subpacket_space_pieces.push( params.bytes_remaining );
            }
        }

        subpacket_payload += subpacket_space_pieces.join(" ");
        var payload_array = this._string_to_octets(subpacket_payload);
        payload_array = Array.prototype.slice.call(payload_array);

        var sess = this;

        var first_promise = FORCE_ESCAPE_CTRL_CHARS ? this._ensure_receiver_escapes_ctrl_chars() : Promise.resolve();

        return first_promise.then( function() {

            //TODO: Might as well combine these together?
            sess._send_header( "ZFILE" );
            sess._build_and_send_subpacket( payload_array, "end_ack" );

            delete sess._sent_ZDATA;

            //return Promise object that is fulfilled when the ZRPOS or ZSKIP arrives.
            //The promise value is the byte offset, or undefined for ZSKIP.
            //If ZRPOS arrives, then send ZDATA(0) and set this._sending_file.
            return new Promise( function(res) {
                sess._next_header_handler = {
                    ZSKIP: function() {
                        sess._start_keepalive();
                        res();
                    },
                    ZRPOS: function(hdr) {
                        sess._sending_file = true;
                        res(
                            new ZmodemTransfer(
                                params,
                                hdr.get_offset(),
                                sess._send_interim_file_piece.bind(sess),
                                sess._end_file.bind(sess)
                            )
                        );
                    },
                };
            } );
        } );
    }

    _build_and_send_subpacket( bytes_arr, frameend ) {
        var subpacket = Zmodem.Subpacket.build(bytes_arr, frameend);

        this._sender( subpacket[this._subpacket_encode_func]( this._zencoder ) );
    }

    _string_to_octets(string) {
        if (!this._textencoder) {
            this._textencoder = new TextEncoder();
        }

        return this._textencoder.encode(string);
    }

    /*
    Potential future support for responding to ZRPOS:
    send_file_offset(offset) {
    }
    */

    /*
        Sending logic works thus:
            - ASSUME the receiver can overlap I/O (CANOVIO)
                (so fail if !CANFDX || !CANOVIO)
            - Sender opens the firehose … all ZCRCG (!end/!ack)
                until the end, when we send a ZCRCW (end/ack)
                NB: try 8k/32k/64k chunk sizes? Looks like there’s
                no need to change the packet otherwise.
    */
    //TODO: Put this on a Transfer object similar to what Receive uses?
    _send_interim_file_piece(bytes_obj) {

        //We don’t ask the receiver to confirm because there’s no need.
        this._send_file_part(bytes_obj, "no_end_no_ack");

        //This pattern will allow
        //error-correction without buffering the entire stream in JS.
        //For now the promise is always resolved, but in the future we
        //can make it only resolve once we’ve gotten acknowledgement.
        return Promise.resolve();
    }

    _ensure_we_are_sending() {
        if (!this._sending_file) throw "Not sending a file currently!";
    }

    //This resolves once we receive ZEOF.
    _end_file(bytes_obj) {
        this._ensure_we_are_sending();

        //Is the frame-end-ness of this last packet redundant
        //with the ZEOF packet??

        //no-ack, following lrzsz’s example
        this._send_file_part(bytes_obj, "end_no_ack");

        var sess = this;

        //Register this before we send ZEOF in case of local round-trip.
        //(Basically just for synchronous testing, but.)
        var ret = new Promise( function(res) {
            //console.log("UNSETTING SENDING FLAG");
            sess._sending_file = false;
            sess._prepare_to_receive_ZRINIT(res);
        } );

        this._send_header( "ZEOF", this._file_offset );

        this._file_offset = 0;

        return ret;
    }

    //Called at the beginning of our session
    //and also when we’re done sending a file.
    _prepare_to_receive_ZRINIT(after_consume) {
        this._next_header_handler = {
            ZRINIT: function(hdr) {
                this._consume_ZRINIT(hdr);
                if (after_consume) after_consume();
            },
        };
    }

    close() {
        var ok_to_close = (this._last_header_name === "ZRINIT")
        if (!ok_to_close) {
            ok_to_close = (this._last_header_name === "ZSKIP");
        }
        if (!ok_to_close) {
            ok_to_close = (this._last_sent_header.name === "ZSINIT") &&  (this._last_header_name === "ZACK");
        }

        if (!ok_to_close) {
            throw( "Can’t close; last received header was “" + this._last_header_name + "”" );
        }

        var sess = this;

        var ret = new Promise( function(res, rej) {
            sess._next_header_handler = {
                ZFIN: function() {
                    sess._sender( OVER_AND_OUT );
                    sess._sent_OO = true;
                    sess._on_session_end();
                    res();
                },
            };
        } );

        this._send_header("ZFIN");

        return ret;
    }

    has_ended() {
        return !!this._sent_OO;
    }

    _send_file_part(bytes_obj, final_packetend) {
        if (!this._sent_ZDATA) {
            this._send_header( "ZDATA", this._file_offset );
            this._sent_ZDATA = true;
        }

        var obj_offset = 0;

        var bytes_count = bytes_obj.length;

        //We have to go through at least once in event of an
        //empty buffer, e.g., an empty end_file.
        while (true) {
            var chunk_size = Math.min(obj_offset + MAX_CHUNK_LENGTH, bytes_count) - obj_offset;

            var at_end = (chunk_size + obj_offset) >= bytes_count;

            var chunk = bytes_obj.slice( obj_offset, obj_offset + chunk_size );
            if (!(chunk instanceof Array)) {
                chunk = Array.prototype.slice.call(chunk);
            }

            this._build_and_send_subpacket(
                chunk,
                at_end ? final_packetend : "no_end_no_ack"
            );

            this._file_offset += chunk_size;
            obj_offset += chunk_size;

            if (obj_offset >= bytes_count) break;
        }
    }

    _consume_first() {
        if (!this._parse_and_consume_header()) {

            //When the ZMODEM receive program starts, it immediately sends
            //a ZRINIT header to initiate ZMODEM file transfers, or a
            //ZCHALLENGE header to verify the sending program. The receive
            //program resends its header at response time (default 10 second)
            //intervals for a suitable period of time (40 seconds total)
            //before falling back to YMODEM protocol.
            if (this._input_buffer.join() === "67") {
                throw "Receiver has fallen back to YMODEM.";
            }
        }
    }

    _on_session_end() {
        this._stop_keepalive();
        super._on_session_end();
    }
}

Object.assign(
    Zmodem.Session.Send.prototype,
    {
        type: "send",
    }
);

}());
