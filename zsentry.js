( function() {
    "use strict";

    const
        MIN_ZM_HEX_START_LENGTH = 20,
        MAX_ZM_HEX_START_LENGTH = 21,

        // **, ZDLE, 'B0'
        //ZRQINIT’s next byte will be '0'; ZRINIT’s will be '1'.
        COMMON_ZM_HEX_START = [ 42, 42, 24, 66, 48 ],

        SENTRY_CONSTRUCTOR_REQUIRED_ARGS = [
            "to_terminal",
            "on_detect",
            "on_retract",
            "sender",
        ],

        ASTERISK = 42
    ;

    class Detection {
        constructor(session_type, accepter, checker) {
            this.accept = accepter;
            this.is_valid = checker;
            this._session_type = session_type;
        }

        get_session_type() { return this._session_type }
    }

    /**
     * Class that parses an input stream for the beginning of a
     * ZMODEM session.
     */
    Zmodem.Sentry = class ZmodemSentry {
        constructor(options) {
            if (!options) throw "Need options!";

            var sentry = this;
            SENTRY_CONSTRUCTOR_REQUIRED_ARGS.forEach( function(arg) {
                if (!options[arg]) {
                    throw "Need “" + arg + "”!";
                }
                sentry["_" + arg] = options[arg];
            } );

            this._cache = [];
        }

        /**
         * “Consumes” a piece of input:
         *
         *  - If there is no active or pending ZMODEM session, the text is
         *      all output. (This is regardless of whether we’ve got a new
         *      Session.)
         *
         *  - If there is no active ZMODEM session and the input *ends* with
         *      a ZRINIT or ZRQINIT, then a new Session object is created,
         *      and its accepter is passed to the “on_detect” function.
         *      If there was another pending Session object, it is expired.
         *
         *  - If there is no active ZMODEM session and the input does NOT end
         *      with a ZRINIT or ZRQINIT, then any pending Session object is
         *      expired, and “on_retract” is called.
         *
         *  - If there is an active ZMODEM session, the input is passed to it.
         *      Any non-ZMODEM data parsed from the input is sent to output.
         *      If the ZMODEM session ends, any post-ZMODEM part of the input
         *      is sent to output.
         */

        consume(input) {
            if (!(input instanceof Array)) {
                input = Array.prototype.slice.call( new Uint8Array(input) );
            }

            if (this._zsession) {
                this._zsession.consume(input);

                if (this._zsession.has_ended()) {
                    if (this._zsession.type === "receive") {
                        input = this._zsession.get_trailing_bytes();
                    }
                    else {
                        input = [];
                    }

                    this._zsession = null;
                }
                else return;
            }

            var parse_out = this._parse(input);
            input = parse_out[0];
            var new_session = parse_out[1];

            if (new_session) {
                if (this._parsed_session) {
                    this._on_retract();
                }

                this._parsed_session = new_session;

                var sentry = this;

                function checker() {
                    return sentry._parsed_session === new_session;
                }

                //This runs with the Sentry object as the context.
                function accepter() {
                    if (!this.is_valid()) {
                        throw "Stale ZMODEM session!";
                    }

                    new_session.on("garbage", sentry._to_terminal);
                    new_session.set_sender(sentry._sender);

                    delete sentry._parsed_session;

                    return sentry._zsession = new_session;
                };

                this._on_detect( new Detection(
                    new_session.type,
                    accepter,
                    checker
                ) );
            }
            else {
                /*
                if (this._parsed_session) {
                    this._session_stale_because = 'Non-ZMODEM output received after ZMODEM initialization.';
                }
                */

                var expired_session = this._parsed_session;

                this._parsed_session = null;

                if (expired_session) {

                    //If we got a single “C” after parsing a session,
                    //that means our peer is trying to downgrade to YMODEM.
                    //That won’t work, so we just send the ABORT_SEQUENCE
                    //right away.
                    if (input.length === 1 && input[0] === 67) {    //67 = 'C'
                        this._sender( Zmodem.ZMLIB.ABORT_SEQUENCE );
                    }

                    this._on_retract();
                }
            }

            this._to_terminal(input);
        }

        /**
         * Parse an input stream and decide how much of it goes to the
         * terminal or to a new Session object.
         *
         * This will accommodate input strings that are fragmented
         * across calls to this function; e.g., if you send the first
         * two bytes at the end of one parse() call then send the rest
         * at the beginning of the next, parse() will recognize it as
         * the beginning of a ZMODEM session.
         *
         * In order to keep from blocking any actual useful data to the
         * terminal in real-time, this will send on the initial
         * ZRINIT/ZRQINIT bytes to the terminal. They’re meant to go to the
         * terminal anyway, so that should be fine.
         *
         * @param {Array|Uint8Array} array_like - The input bytes.
         *      Each member should be a number between 0 and 255 (inclusive).
         *
         * @return {Array} A two-member list:
         *      0) the bytes that should be printed on the terminal
         *      1) the created Session object (if any)
         */
        _parse(array_like) {
            var cache = this._cache;

            cache.push.apply( cache, array_like );

            while (true) {
                let common_hex_at = Zmodem.ZMLIB.find_subarray( cache, COMMON_ZM_HEX_START );
                if (-1 === common_hex_at) break;

                let before_common_hex = cache.splice(0, common_hex_at);
                let zsession;
                try {
                    zsession = Zmodem.Session.parse(cache);
                } catch(err) {     //ignore errors
                    //console.log(err);
                }

                if (!zsession) break;

                //Don’t need to parse the trailing XON.
                if ((cache.length === 1) && (cache[0] === Zmodem.ZMLIB.XON)) {
                    cache.shift();
                }

                if (cache.length) {
                    return [array_like];
                }

                return [
                    array_like.slice( 0, array_like.length - cache.length ),
                    zsession,

                    //Is there any possibility of “consumable” ZMODEM
                    //bytes left in this._cache?
                    this._cache.splice(0),
                ];
            }

            cache.splice( MAX_ZM_HEX_START_LENGTH );

            return [array_like];
        }
    }
}());
