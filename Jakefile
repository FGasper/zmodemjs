const glob_fs = require('glob-fs')();

const jsdoc = require('jsdoc-api');

const webpack = require('webpack');
const webpack_config = require("./webpack.config.js");

var ALL_TASKS = [
    "documentation",
    "webpack"
];

task( "documentation", [], () => {
    jsdoc.renderSync( {
        configure: "jsdoc.json",
        destination: "documentation",
        readme: "README.md",
        files: glob_fs.readdirSync("src/*.js"),
    } );
} );

task( "webpack", [], {async: true}, () => {
    webpack(
        webpack_config,
        (err, stats) => {
            if (err || stats.hasErrors()) {
                console.error(err, stats);
            }
            complete();
        }
    );
} );

task('default', ALL_TASKS);
