module.exports = {
    string_to_octets(string) {
        return string.split("").map( (c) => c.charCodeAt(0) );
    },
};
