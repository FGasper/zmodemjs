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
        constructor() {
            this._terminal_bytes = [];
            this._cache = [];
        }

        /**
         * Parse an input stream and return a ZMODEM session object
         * if the input has indicated the beginning of such.
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
        parse(array_like) {
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
