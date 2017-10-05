"use strict";

const path = require("path");
const MinifyPlugin = require("babel-minify-webpack-plugin");

module.exports = {
    entry: {
        zmodem: [ "./index.js", "./src/zbrowser.js" ],
        "zmodem.devel": [ "./index.js", "./src/zbrowser.js" ],
    },
    output: {
        path: path.resolve( __dirname, "webpack" ),
        filename: "[name].js",
    },
    plugins: [
        new MinifyPlugin(
            null,
            {
                test: /zmodem\.js$/,
            }
        ),
    ]
}
