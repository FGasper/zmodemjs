class _my_TextEncoder {
    encode(text) {
        text = unescape(encodeURIComponent(text));

        var bytes = new Array( text.length );

        for (var b = 0; b < text.length; b++) {
            bytes[b] = text.charCodeAt(b);
        }

        return new Uint8Array(bytes);
    }
}

class _my_TextDecoder {
    decode(bytes) {
        return decodeURIComponent( escape( String.fromCharCode.apply(String, bytes) ) );
    }
}

var TEncoder = (typeof TextEncoder === "undefined") ? null : TextEncoder;
var TDecoder = (typeof TextDecoder === "undefined") ? null : TextDecoder;

var Zmodem = module.exports;

/**
 * A limited-use compatibility shim for TextEncoder and TextDecoder.
 *
 * @exports Text
 */
Zmodem.Text = {
    Encoder: TEncoder || _my_TextEncoder,
    Decoder: TDecoder || _my_TextDecoder,
};
