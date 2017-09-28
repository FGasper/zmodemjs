
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
    "zbrowser",
];

SOURCES = SOURCES.map( (s) => { return `src/${s}.js` } );

concat( SOURCES, 'zmodem.js' );

concat( SOURCES ).then( (alljs) => {
    const {code} = minify(alljs);
    fs.writeFileSync( 'zmodem-min.js', code );
} ).catch( console.error.bind(console) );
