
const fs = require('fs');

const concat = require('concat');
const minify = require('babel-minify');

var SOURCES = [
    "zmodem",
    "encode",
    "zmlib",
    "zdle",
    "zcrc",
    "zheader",
    "zsubpacket",
    "zsentry",
    "zsession",
    "zerror",
    "zvalidation",
];

var BROWSER_SOURCES = SOURCES.slice(0).concat( ["zbrowser"] );

const nameroot_sources = new Map( [
    [ "zmodem-pure", SOURCES ],
    [ "zmodem", BROWSER_SOURCES ],
] );

for ( let [base, sources] of nameroot_sources ) {
    var full_sources = sources.map( (s) => { return `src/${s}.js` } );

    concat( full_sources, `${base}.js` );

    concat( full_sources ).then( (alljs) => {
        const {code} = minify(alljs);
        fs.writeFileSync( `${base}-min.js`, code );
    } ).catch( console.error.bind(console) );
}
