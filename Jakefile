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

var ALL_TASKS = [];

for ( let [base, sources] of nameroot_sources ) {
    let full_sources = sources.map( (s) => { return `src/${s}.js` } );

    let base_js = `${base}.js`;
    let base_min_js = `${base}-min.js`;

    file( base_js, full_sources, { async: true }, () => {
        concat( full_sources, base_js ).then(complete);
    } );

    file(base_min_js, [base_js], () => {
        let alljs = fs.readFileSync(base_js);
        const {code} = minify(alljs);
        fs.writeFileSync( base_min_js, code );
    } );

    ALL_TASKS.push( base_js, base_min_js );
}

task('default', ALL_TASKS);
