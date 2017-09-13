// Browser-specific tools
( function() {
"use strict";

/**
 * Send a batch of files in sequence. The session is left open
 * afterward, which allows for more files to be sent if desired.
 *
 * @param {Zmodem.Session} session - The send session
 *
 * @param {FileList|Array} files - A list of File objects
 *
 * @param {Object} options - Optional, can be:
 *
 *      - on_offer_response(File object, Transfer object)
 *          Called when an offer response arrives. If the offer is
 *          not accepted (i.e., skipped), the 2nd argument will be undefined.
 *
 *      - on_progress(File, Transfer, Uint8Array)
 *          Called immediately after a chunk of a file is sent.
 *          That chunk is represented by the Uint8Array.
 *
 *      - on_file_complete(File, Transfer, Uint8Array)
 *          Called immediately after the last chunk of a file is sent.
 *          That chunk is represented by the Uint8Array.
 *          (It’s probably empty.)
 *
 * @return {Promise} A Promise that fulfills when the batch is done.
 *      Note that skipped files are not considered an error condition.
 */
function send_files(session, files, options) {
    if (!options) options = {};

    var batch = [];
    var total_size = 0;
    for (var f=0; f<files_obj.length; f++) {
        var fobj = files_obj[f];
        batch.push( {
            obj: fobj,
            name: fobj.name,
            size: fobj.size,
        } );
        total_size += fobj.size;
    }

    var file_idx = 0;
    function promise_callback() {
        var cur_b = batch[file_idx];

        if (!cur_b) return; //batch done!

        file_idx++;

        return zsession.send_offer(cur_b).then( function after_send_offer(xfer) {
            if (options.on_offer_response) {
                options.on_offer_response(cur_b.obj, xfer);
            }

            if (xfer === undefined) {
                return promise_callback();   //skipped
            }

            return new Promise( function(res) {
                var reader = new FileReader();

                //This really shouldn’t happen … so let’s
                //blow up if it does.
                reader.onerror = function reader_onerror(e) {
                    console.error("file read error", e);
                    throw("File read error: " + e);
                };

                var piece;
                reader.onprogress = function reader_onprogress(e) {
                    piece = new Uint8Array(e.target.result, xfer.get_offset())
                    xfer.send(piece);

                    if (options.on_progress) {
                        options.on_progress(cur_b.obj, xfer, piece);
                    }
                };

                reader.onload = function reader_onload(e) {
                    piece = new Uint8Array(e.target.result, xfer, piece)
                    xfer.end(piece).then(res).then(promise_callback);

                    if (options.on_file_complete) {
                        options.on_file_complete(cur_b.obj, xfer);
                    }
                };

                reader.readAsArrayBuffer(cur_b.obj);
            } );
        } );
    }

    return promise_callback();
}

Zmodem.Browser = {
    send_files: send_files,
};

}());
