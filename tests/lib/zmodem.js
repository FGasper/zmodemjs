global.Zmodem = require('../../src/zmodem.js');

[
    "encode",
    "zcrc",
    "zerror",
    "zmlib",
    "zdle",
    "zvalidation",
    "zheader",
    "zsubpacket",
    "zsession",
    "zsentry",
].forEach( (name) => require(`../../src/${name}`) );

module.exports = global.Zmodem;

delete global.Zmodem;
