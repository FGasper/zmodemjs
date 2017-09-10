/**
 * Tools and constants that are useful for ZMODEM.
 *
 * @module ZMLIB
 */
Zmodem.ZMLIB = (function() {
    "use strict";

    const
        ZDLE = 0x18,
        XON = 0x11,
        XOFF = 0x13,
        XON_HIGH = 0x80 | XON,
        XOFF_HIGH = 0x80 | XOFF
    ;

    /**
     * Remove octet values from the given array that ZMODEM always ignores.
     * This will mutate the given array.
     *
     * @param {Array} octets - The octet values to transform.
     *      Each array member should be an 8-bit unsigned integer (0-255).
     *      This object is mutated in the function.
     *
     * @returns {Array} The passed-in array. This is the same object that is
     *      passed in.
     */
    function strip_ignored_bytes(octets) {
        for (var o=octets.length-1; o>=0; o--) {
            switch (octets[o]) {
                case XON:
                case XON_HIGH:
                case XOFF:
                case XOFF_HIGH:
                    octets.splice(o, 1);
                    continue;
            }
        }

        return octets;
    }

    /**
     * Return an array with the given number of random octet values.
     *
     * @param {Array} count - The number of octet values to return.
     *
     * @returns {Array} The octet values.
     */
    function get_random_octets(count) {
        if (!(count > 0)) throw( "Must be positive, not " + count );

        var octets = [];

        //This assigns backwards both for convenience and so that
        //the initial assignment allocates the needed size.
        while (count) {
            octets[count - 1] = Math.floor( Math.random() * 256 );
            count--;
        }

        return octets;
    }

    /**
     * Like Array.prototype.indexOf, but searches for a subarray
     * rather than just a particular value.
     *
     * @param {Array} haystack - The array to search, i.e., the bigger.
     *
     * @param {Array} needle - The array whose values to find,
     *      i.e., the smaller.
     *
     * @returns {number} The position in “haystack” where “needle”
     *      first appears--or, -1 if “needle” doesn’t appear anywhere
     *      in “haystack”.
     */
    function find_subarray(haystack, needle) {
        var h=0, n;

        var start = Date.now();

      HAYSTACK:
        while (h !== -1) {
            h = haystack.indexOf( needle[0], h );
            if (h === -1) break HAYSTACK;

            for (n=1; n<needle.length; n++) {
                if (haystack[h + n] !== needle[n]) {
                    h++;
                    continue HAYSTACK;
                }
            }

            return h;
        }

        return -1;
    }

    return {
        ZDLE: ZDLE,
        XON: XON,
        XOFF: XOFF,
        strip_ignored_bytes:    strip_ignored_bytes,
        get_random_octets:      get_random_octets,
        find_subarray:          find_subarray,
    };
}());
