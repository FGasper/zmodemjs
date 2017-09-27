( function() {
    "use strict";

    function _crc_message(got, expected) {
        this.got = got.slice(0);
        this.expected = expected.slice(0);
        return "CRC check failed! (got: " + got.join() + "; expected: " + expected.join() + ")";
    }

    const TYPE_MESSAGE = {
        aborted: "Session aborted",
        peer_aborted: "Peer aborted session",
        already_aborted: "Session already aborted",
        crc: _crc_message,
    };

    function _generate_message(type) {
        const msg = TYPE_MESSAGE[type];
        switch (typeof msg) {
            case "string":
                return msg;
            case "function":
                var args_after_type = [].slice.call(arguments).slice(1);
                return msg.apply(this, args_after_type);
        }

        throw new Error("Unknown ZmodemError type: " + type);
    }

    Zmodem.Error = class ZmodemError extends Error {
        constructor(type) {
            super();
            this.type = type;
            this.message = _generate_message.apply(this, arguments);
        }
    }
}());
