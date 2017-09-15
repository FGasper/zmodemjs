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

    //Populate the batch in reverse order to simplify sending
    //the remaining files/bytes components.
    var batch = [];
    var total_size = 0;
    for (var f=files.length - 1; f>=0; f--) {
        var fobj = files[f];
        total_size += fobj.size;
        batch[f] = {
            obj: fobj,
            name: fobj.name,
            size: fobj.size,
            mtime: new Date(fobj.lastModified),
            files_remaining: files.length - f,
            bytes_remaining: total_size,
        };
    }

    var file_idx = 0;
    function promise_callback() {
        var cur_b = batch[file_idx];

        if (!cur_b) {
            return Promise.resolve(); //batch done!
        }

        file_idx++;

        return session.send_offer(cur_b).then( function after_send_offer(xfer) {
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

                    //Some browsers (e.g., Chrome) give partial returns,
                    //while others (e.g., Firefox) don’t.
                    if (e.target.result) {
                        piece = new Uint8Array(e.target.result, xfer.get_offset())
                        xfer.send(piece);

                        if (options.on_progress) {
                            options.on_progress(cur_b.obj, xfer, piece);
                        }
                    }
                };

                reader.onload = function reader_onload(e) {
                    piece = new Uint8Array(e.target.result, xfer, piece)
                    xfer.end(piece).then( function() {
                        if (options.on_file_complete) {
                            options.on_file_complete(cur_b.obj, xfer, piece);
                        }

                        //Resolve the current file-send promise with
                        //another promise. That promise resolves immediately
                        //if we’re done, or with another file-send promise
                        //if there’s more to send.
                        res( promise_callback() );
                    } );
                };

                reader.readAsArrayBuffer(cur_b.obj);
            } );
        } );
    }

    return promise_callback();
}

/**
 * Prompt a user to save the given octet buffer as a file.
 *
 * @param {Uint8Array|Array} octets - The bytes to save.
 * @param {string} name - The name to give the file.
 */
function save_to_disk(octets, name) {
    var uint8array = new Uint8Array(octets);
    var blob = new Blob([uint8array]);
    var url = URL.createObjectURL(blob);

    var el = document.createElement("a");
    el.style.display = "none";
    el.href = url;
    el.download = name;
    document.body.appendChild(el);

    //It seems like a security problem that this actually works.
    //But, hey.
    el.click();

    document.body.removeChild(el);
}

Zmodem.Browser = {
    send_files: send_files,
    save_to_disk: save_to_disk,
};

}());
