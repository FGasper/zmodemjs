var Zmodem = require('./zmodem');

module.exports = {
    /**
     * Return an array with the given number of random octet values.
     *
     * @param {Array} count - The number of octet values to return.
     *
     * @returns {Array} The octet values.
     */
    get_random_octets(count) {
        if (!(count > 0)) throw( "Must be positive, not " + count );

        var octets = [];

        //This assigns backwards both for convenience and so that
        //the initial assignment allocates the needed size.
        while (count) {
            octets[count - 1] = Math.floor( Math.random() * 256 );
            count--;
        }

        return octets;
    },

    string_to_octets(string) {
        return string.split("").map( (c) => c.charCodeAt(0) );
    },

    make_temp_dir() {
        return require('tmp').dirSync().name;
    },

    make_temp_file(size) {
        const fs = require('fs');
        const tmp = require('tmp');

        var tmpobj = tmp.fileSync();
        var content = Array(size).fill("x").join("");
        fs.writeSync( tmpobj.fd, content );
        fs.writeSync( tmpobj.fd, "=THE_END" );
        fs.closeSync( tmpobj.fd );

        return tmpobj.name;
    },

    exec_lrzsz_steps(t, binpath, z_args, steps) {
        const spawn = require('child_process').spawn;

        var child;

        var zsession;
        var zsentry = new Zmodem.Sentry( {
            to_terminal: Object,
            on_detect: (d) => { zsession = d.confirm() },
            on_retract: console.error.bind(console),
            sender: (d) => {
                child.stdin.write( new Buffer(d) );
            },
        } );

        var step = 0;
        var inputs = [];

        child = spawn(binpath, z_args);
        child.on("error", console.error.bind(console));

        //We can’t just pipe this on through because there can be lone CR
        //bytes which screw up TAP::Harness.
        child.stderr.on("data", (d) => {
            d = d.toString().replace(/\r/g, "\n");
            if (d.substr(-1) !== "\n") d += "\n";
            process.stderr.write(`STDERR: ${d}`);
        });

        child.stdout.on("data", (d) => {
            //console.log("STDOUT from child", d);
            inputs.push( Array.from(d) );

            zsentry.consume( Array.from(d) );

            if (zsession) {
                if ( steps[step] ) {
                    if ( steps[step](zsession, child) ) {
                        step++;
                    }
                }
                else {
                    child.stdin.end();
                }
            }
        });

        var exit_promise = new Promise( (res, rej) => {
            child.on("exit", (code, signal) => {
                console.log(`# "${binpath}" exit: code ${code}, signal ${signal}`);
                res([code, signal]);
            } );
        } );

        return exit_promise.then( () => { return inputs } );
    },
};
