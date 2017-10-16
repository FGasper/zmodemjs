"use strict";

const path = require("path");
const MinifyPlugin = require("babel-minify-webpack-plugin");

const JsDocPlugin = require('jsdoc-webpack-plugin');

module.exports = {
    entry: {
        zmodem: [ "./src/zmodem_browser.js" ],
        "zmodem.devel": [ "./src/zmodem_browser.js" ],
    },
    output: {
        path: path.resolve( __dirname, "dist" ),
        filename: "[name].js",
    },
    plugins: [
        new MinifyPlugin(
            null,
            {
                test: /zmodem\.js$/,
            }
        ),
        new JsDocPlugin({
            conf: './jsdoc.json'
        })
    ]
}
