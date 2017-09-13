( function() {
    "use strict";

    const
        MIN_ZM_HEX_START_LENGTH = 20,
        MAX_ZM_HEX_START_LENGTH = 21,

        // **, ZDLE, 'B0'
        //ZRQINIT’s next byte will be '0'; ZRINIT’s will be '1'.
        COMMON_ZM_HEX_START = [ 42, 42, 24, 66, 48 ],

        ASTERISK = 42
    ;

    /**
     * Class that parses an input stream for the beginning of a
     * ZMODEM session.
     */
    Zmodem.Sentry = class ZmodemSentry {
        constructor(options) {
            if (!options) throw "Need options!";

            if (!options.to_terminal) throw "Need “to_terminal”!";
            if (!options.on_session) throw "Need “on_session”!";
            if (!options.sender) throw "Need “sender”!";

            this._to_terminal = options.to_terminal;
            this._on_session = options.on_session;
            this._sender = options.sender;

            this._cache = [];
        }

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

            let new_session
            [input, new_session] = this._parse(input);

            if (new_session) {
                this._parsed_session = new_session;

                let sentry = this;
                function accepter() {
                    if (sentry._zsession) {
                        throw "Stale ZMODEM session!";
                    }

                    new_session.on("garbage", sentry._to_terminal);
                    new_session.set_sender(sentry._sender);

                    return sentry._zsession = new_session;
                };

                this._on_session(accepter);
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
            this._cache.push.apply( this._cache, array_like );

            while (true) {
                let common_hex_at = Zmodem.ZMLIB.find_subarray( this._cache, COMMON_ZM_HEX_START );
                if (-1 === common_hex_at) break;

                let before_common_hex = this._cache.splice(0, common_hex_at);
                let zsession;
                try {
                    zsession = Zmodem.Session.parse(this._cache);
                } catch(err) {     //ignore errors
                    //console.log(err);
                }

                if (!zsession) break;

                //Don’t need to parse the trailing XON.
                if (this._cache[0] === Zmodem.ZMLIB.XON) {
                    this._cache.shift();
                }

                return [
                    array_like.slice( 0, array_like.length - this._cache.length ),
                    zsession,

                    //Is there any possibility of “consumable” ZMODEM
                    //bytes left in this._cache?
                    this._cache.splice(0),
                ];
            }

            this._cache.splice( MAX_ZM_HEX_START_LENGTH );

            return [array_like];
        }
    }
}());
