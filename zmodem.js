/*
TODO:
use?? https://github.com/SheetJS/js-crc32 (need to reverse byte order)

NOTES:

ZDLE is ASCII CAN (i.e., “cancel”)

If a ZDLE character appears in binary data, it is prefixed with
ZDLE, then sent as ZDLEE.

Five (5) consecutive ZDLE = abort ZMODEM session. (Spec says to send 8, but.)

(cnum & ~0xff) - Need to figure out this incantation in a more portable,
legible vein.

ZRPOS shouldn’t be necessary. We assume a reliable connection here.
… except we might want to resume a transaction?

=============================
RECEIVE FLOW:

get ZRQINIT
send ZRINIT

(optional: get ZSINIT, send ZACK)

{
    get ZFILE
    get subpacket

    send ZSKIP or ZRPOS

    get ZDATA

    (optional: fail ZDATA pos; resend ZRPOS & throw away data packets)

    get subpackets; send responses as requested

    get ZEOF; send ZRINIT/ZFERR (NB: see ZDATA discussion?)
}

get ZFIN, send ZFIN

get “OO”

========================
SEND FLOW:
get ZRINIT

(optional: send ZSINIT, wait for ZACK)

{
    send_offer():
        send ZFILE & subpacket

    next if ZSKIP;
    seek ZRPOS

    send ZDATA

    send data but always watch for ZRPOS
    (how to know which subpacket type to send?)

    send ZEOF
    get ZRINIT/ZFERR
}

send ZFIN, get ZFIN
send “OO”
*/

    //No implementations of ZCOMMAND or ZSTDERR

    //----------------------------------------------------------------------
    //going to change this to be more readable:
    //  ZCRCE = end_noack
    //  ZCRCG = continue_noack
    //  ZCRCQ = continue_ack
    //  ZCRCW = end_ack

    //----------------------------------------------------------------------

/*
    const XOFF = 0x73 & 0x1f, // ('s'&037)
        XON = 0x71 & 0x1f  // ('q'&037)
    ;

    //----------------------------------------------------------------------

    class Zmodem {
        constructor(config) {
            if (!config) config = {};

            if (config.crc32) {
                throw "32-bit CRC not implemented for header creation";
            }

            this._config = config;

            this._setup_zdle_table();
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
                        case ZMLIB.ZDLE:  //NB: no (ZDLE | 0x80)
                        case XOFF:
                        case XON:
                        case (XOFF | 0x80):
                        case (XON | 0x80):
                            zsendline_tab[i] = 2;
                            break;

                        case 0x10:  // 020
                        case 0x90:  // 0220
                            zsendline_tab[i] = this._config.turbo_escape ? 1 : 2;
                            break;

                        case 0x0d:  // 015
                        case 0x8d:  // 0215
                            zsendline_tab[i] = this._config.Zctlesc ? 2 : !this._config.turbo_escape ? 3 : 1;
                            break;

                        default:
                            zsendline_tab[i] = this._config.Zctlesc ? 2 : 1;
                    }
                }
            }

            this._zsendline_tab = zsendline_tab;
        }

        //ZMODEM software escapes ZDLE, 020, 0220, 021, 0221, 023, and 0223.  If
        //preceded by 0100 or 0300 (@), 015 and 0215 are also escaped to protect the
        //Telenet command escape CR-@-CR.
        zdle_encode(octets) {
            for (var o=0; o<octets.length; o++) {

                var todo = this._zsendline_tab[octets[o]];
                if (!todo) {
                    throw( "Invalid octet: " + octets[o] );
                }
//console.log( octets[o], todo );

                this._lastcode = octets[o];

                if (todo === 1) continue;

                //0x40 = '@'; i.e., only escape if the last
                //octet was '@'.
                if (todo === 3 && ((this._lastcode & 0x7f) != 0x40)) {
                    continue;
                }

                this._lastcode ^= 0x40;   //0100
                octets.splice(o, 1, ZMLIB.ZDLE, this._lastcode);
            }

            return octets;
        }

    }

//    return Zmodem;
//})();
*/

//----------------------------------------------------------------------

Zmodem = {};

if ( typeof module === "object" ) {
    module.exports = Zmodem;
}
