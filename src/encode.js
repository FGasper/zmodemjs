/**
 * General, non-ZMODEM-specific encoding logic.
 *
 * @module ENCODELIB
 */
Zmodem.ENCODELIB = (function() {
    "use strict";

    const HEX_DIGITS = [ 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102 ];

    const HEX_OCTET_VALUE = {};
    for (var hd=0; hd<HEX_DIGITS.length; hd++) {
        HEX_OCTET_VALUE[ HEX_DIGITS[hd] ] = hd;
    }

    /**
     * Return an array with the given number as 4 little-endian bytes.
     *
     * @param {number} number - The number to encode.
     *
     * @returns {Array} The octet values.
     */
    function pack_u32_le(number) {
        //Can’t bit-shift because that runs into JS’s bit-shift problem.
        //(See _updcrc32() for an example.)
        var high_bytes = number / 65536;   //fraction is ok

        //a little-endian 4-byte sequence
        return [
            number & 0xff,
            (number & 65535) >> 8,
            high_bytes & 0xff,
            high_bytes >> 8,
        ];
    }

    /**
     * The inverse of pack_u32_le() - i.e., take in a 4-byte sequence
     * and parse it as an unsigned, 4-byte little-endian number.
     *
     * @param {number[4]} octets - The octet values.
     *
     * @returns {number} number - The decoded number.
     */
    function unpack_u32_le(octets) {
        //<sigh> … (254 << 24 is -33554432, according to JavaScript)
        return octets[0] + (octets[1] << 8) + (octets[2] << 16) + (octets[3] * 16777216);
    }

    /**
     * Return an array with the given number as 2 big-endian bytes.
     *
     * @param {number} number - The number to encode.
     *
     * @returns {Array} The octet values.
     */
    function pack_u16_be(number) {
        if (number > 0xffff) throw( "Number cannot exceed 16 bits: " + number )

        return [ number >> 8, number & 0xff ];
    }

    /**
     * The inverse of pack_u16_be() - i.e., take in 2 octet values
     * and parse them as an unsigned, 2-byte big-endian number.
     *
     * @param {number[2]} octets - The octet values.
     *
     * @returns {number} number - The decoded number.
     */
    function unpack_u16_be(bytes_arr) {
        return (bytes_arr[0] << 8) + bytes_arr[1];
    }

    /**
     * Encode a series of octet values to be the octet value that
     * correspond to the hex characters for each octet. The returned
     * array is suitable for printing as binary data.
     *
     * For example:
     *
     *      Original    Hex     Returned
     *      254         fe      102, 101
     *       12         0c      48, 99
     *      129         81      56, 49
     *
     * @param {Array} octets - The original octet values.
     *
     * @returns {Array} - The hex-encoded octet values.
     */
    function octets_to_hex(octets) {
        var hex = [];
        for (var o=0; o<octets.length; o++) {
            hex.push(
                HEX_DIGITS[ octets[o] >> 4 ],
                HEX_DIGITS[ octets[o] & 0x0f ]
            );
        }

        return hex;
    }

    /**
     * The inverse of octets_to_hex(): takes an array
     * of hex octet pairs and returns their octet values.
     *
     * @param {Array} hex_octets - The hex octet values.
     *
     * @returns {Array} - The parsed octet values.
     */
    function parse_hex_octets(hex_octets) {
        var octets = new Array(hex_octets.length / 2);

        for (var i=0; i<octets.length; i++) {
            octets[i] = (HEX_OCTET_VALUE[ hex_octets[2 * i] ] << 4) + HEX_OCTET_VALUE[ hex_octets[1 + 2 * i] ];
        }

        return octets;
    }

    return {
        pack_u16_be: pack_u16_be,
        unpack_u16_be: unpack_u16_be,

        pack_u32_le: pack_u32_le,
        unpack_u32_le: unpack_u32_le,

        octets_to_hex: octets_to_hex,
        parse_hex_octets: parse_hex_octets,
    };
}());
