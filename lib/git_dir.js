var path = require('path');
var fs = require('fs');
var path = require('path');
var existsSync = fs.existsSync || path.existsSync;

module.exports = function (dir) {
    var ps = dir.split('/');
    for (var i = ps.length; i > 0; i--) {
        var p = ps.slice(0, i).join('/');
        if (existsSync(p + '/.git')) return p;
    }
};
