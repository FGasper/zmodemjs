( function() {
    "use strict";

    const TYPE_MESSAGE = {
        "aborted": "Session aborted",
        "already_aborted": "Session already aborted",
    };

    function _generate_message(type) {
        if (TYPE_MESSAGE[type]) return TYPE_MESSAGE[type];

        throw new Error("Unknown ZmodemError type: " + type);
    }

    Zmodem.Error = class ZmodemError extends Error {
        constructor(type) {
            super();
            this.type = type;
            this.message = _generate_message(type);
        }
    }
}());
