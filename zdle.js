//needs:
//  ZMLIB
( function() {
"use strict";

//encode() variables - declare them here so we don’t
//create them in the function.
var encode_cur, encode_todo;

const ZDLE = Zmodem.ZMLIB.ZDLE;

/**
 * Class that handles ZDLE encoding and decoding.
 * Encoding is subject to a given configuration--specifically, whether
 * we want to escape all control characters. Decoding is static; however
 * a given string is encoded we can always decode it.
 */
Zmodem.ZDLE = class ZmodemZDLE {
    /**
     * Create a ZDLE encoder.
     *
     * @param {object} [config] - The initial configuration.
     *      The only recognized option is “escape_ctrl_chars”,
     *      whose value is the same as is given to set_escape_ctrl_chars().
     */
    constructor(config) {
        this._config = {};
        if (config) {
            this.set_escape_ctrl_chars(!!config.escape_ctrl_chars);
        }
    }

    /**
     * Enable or disable control-character escaping.
     * You should probably enable this for sender sessions.
     *
     * @param {boolean} value - Whether to enable (true) or disable (false).
     */
    set_escape_ctrl_chars(value) {
        if (typeof value !== "boolean") throw "need boolean!";

        if (value !== this._config.escape_ctrl_chars) {
            this._config.escape_ctrl_chars = value;
            this._setup_zdle_table();
        }
    }

    /**
     * Whether or not control-character escaping is enabled.
     *
     * @return {boolean} Whether the escaping is on (true) or off (false).
     */
    escapes_ctrl_chars() {
        return !!this._config.escape_ctrl_chars;
    }

    //I don’t know of any Zmodem implementations that use ZESC8
    //(“escape_8th_bit”)??

    /*
    ZMODEM software escapes ZDLE, 020, 0220, 021, 0221, 023, and 0223.  If
    preceded by 0100 or 0300 (@), 015 and 0215 are also escaped to protect the
    Telenet command escape CR-@-CR.
    */

    /**
     * Encode an array of octet values and return it.
     * This will mutate the given array.
     *
     * @param {Array} octets - The octet values to transform.
     *      Each array member should be an 8-bit unsigned integer (0-255).
     *      This object is mutated in the function.
     *
     * @returns {Array} The passed-in array. This is the same object that is
     *      passed in.
     */
    encode(octets) {
        if (!this._zdle_table) throw "No ZDLE encode table configured!";

        for (encode_cur=0; encode_cur<octets.length; encode_cur++) {

            encode_todo = this._zdle_table[octets[encode_cur]];
            if (!encode_todo) {
                console.trace();
                console.error("bad encode() call:", JSON.stringify(octets));
                throw( "Invalid octet: " + octets[encode_cur] );
            }

            this._lastcode = octets[encode_cur];

            if (encode_todo === 1) continue;

            //0x40 = '@'; i.e., only escape if the last
            //octet was '@'.
            if (encode_todo === 3 && ((this._lastcode & 0x7f) != 0x40)) {
                continue;
            }

            this._lastcode ^= 0x40;   //0100
            octets.splice(encode_cur, 1, ZDLE, this._lastcode);
        }

        return octets;
    }

    /**
     * Decode an array of octet values and return it.
     * This will mutate the given array.
     *
     * @param {Array} octets - The octet values to transform.
     *      Each array member should be an 8-bit unsigned integer (0-255).
     *      This object is mutated in the function.
     *
     * @returns {Array} The passed-in array. This is the same object that is
     *      passed in.
     */
    static decode(octets) {
        for (var o=octets.length-1; o>=0; o--) {
            if (octets[o] === ZDLE) {
                octets.splice( o, 2, octets[o+1] - 64 );
            }
        }

        return octets;
    }

    /**
     * Return a given number of ZDLE-decoded bytes from the passed-in array.
     * If the requested number of bytes isn’t available, then the passed-in
     * array is unmodified; otherwise, this will remove the decoded bytes
     * from the array.
     *
     * @param {Array} octets - The octet values to transform.
     *      Each array member should be an 8-bit unsigned integer (0-255).
     *      This object is mutated in the function.
     *
     * @param {number} offset - The number of (undecoded) bytes to skip
     *      at the beginning of the “octets” array.
     *
     * @param {number} count - The number of bytes (octet values) to return.
     *
     * @returns {Array|undefined} An array with the requested number of
     *      decoded octet values, or undefined if that number of decoded
     *      octets isn’t available (given the passed-in offset).
     */
    static splice(octets, offset, count) {
        var so_far = 0;

        if (!offset) offset = 0;

        for (var i = offset; i<octets.length && so_far<count; i++) {
            so_far++;

            if (octets[i] === ZDLE) i++;
        }

        if (so_far === count) {

            //Don’t accept trailing ZDLE. This check works
            //because of the i++ logic above.
            if (octets.length === (i - 1)) return;

            octets.splice(0, offset);
            return ZmodemZDLE.decode( octets.splice(0, i - offset) );
        }

        return;
    }

    _setup_zdle_table() {
        var zsendline_tab = new Array(256);
        for (var i=0; i<zsendline_tab.length; i++) {

            //1 = never escape
            //2 = always escape
            //3 = escape only if the previous byte was '@'

            //Never escape characters from 0x20 (32) to 0x7f (127).
            //This is the range of printable characters, plus DEL.
            //I guess ZMODEM doesn’t consider DEL to be a control character?
            if ( i & 0x60 ) {
                zsendline_tab[i] = 1;
            }
            else {
                switch(i) {
                    case ZDLE:  //NB: no (ZDLE | 0x80)
                    case Zmodem.ZMLIB.XOFF:
                    case Zmodem.ZMLIB.XON:
                    case (Zmodem.ZMLIB.XOFF | 0x80):
                    case (Zmodem.ZMLIB.XON | 0x80):
                        zsendline_tab[i] = 2;
                        break;

                    case 0x10:  // 020
                    case 0x90:  // 0220
                        zsendline_tab[i] = this._config.turbo_escape ? 1 : 2;
                        break;

                    case 0x0d:  // 015
                    case 0x8d:  // 0215
                        zsendline_tab[i] = this._config.escape_ctrl_chars ? 2 : !this._config.turbo_escape ? 3 : 1;
                        break;

                    default:
                        zsendline_tab[i] = this._config.escape_ctrl_chars ? 2 : 1;
                }
            }
        }

        this._zdle_table = zsendline_tab;
    }
}

}());
