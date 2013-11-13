#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;
var existsSync = fs.existsSync || path.existsSync;

var request = require('request');
var semver = require('semver');

var withConfig = require('../lib/config');
var gitDir = require('../lib/git_dir');

function remote (cb) {
    exec('git remote -v', function (err, stdout, stderr) {
        if (err) return cb(err.stack)
        if (stderr) return cb(stderr)
        
        var m = stdout.match(
            /origin\s+(?:git@github\.com:|(?:https?|git):\/\/github\.com\/)(\S+)/
        );
        if (!m) return cb('no github remote found');
        cb(null, m[1].replace(/\.git$/, ''));
    });
}

withConfig(function (config) {
    remote(function (err, repo) {
        if (err) console.error(err)
        else if (process.argv[2] === 'test') {
            testHook(config, repo);
        }
        else if (process.argv[2] === 'badge') {
            console.log([
                '[![build status](https://secure.travis-ci.org/',
                repo, '.png)]',
                '(http://travis-ci.org/', repo, ')',
            ].join(''));
        }
        else {
            var dir = gitDir(process.cwd());
            if (!existsSync(dir + '/.travis.yml')
            && existsSync(dir + '/package.json')) {
                var pkg = JSON.parse(fs.readFileSync(dir + '/package.json'));
                
                var sv = (pkg.engines || {}).node || '>=0.4';
                var vs = [ '0.8.1', '0.10.0' ].filter(function (v) {
                    return semver.satisfies(v, sv);
                });
                if (vs.length === 0) {
                    console.error('ERROR: no node versions on travis'
                        + ' match the engine field semver'
                    );
                }
                else {
                    fs.writeFileSync(dir + '/.travis.yml', [
                        'language: node_js',
                        'node_js:',
                        vs.map(function (v) {
                            return '  - "' + v.replace(/\.\d+$/, '') + '"';
                        }).join('\n')
                    ].join('\n') + '\n');
                    
                    console.log('# created a .travis.yml');
                    console.log('# make sure to `git add .travis.yml`');
                }
            }
            addHook(config, repo)
        }
    });
});

function hookUri (config, repo) {
    var user = config.user;
    var pass = config.pass;
    if(config.token){
        user = config.token;
        pass = 'x-oauth-basic';
    }

    return 'https://'
        + [ user, pass ].map(encodeURIComponent).join(':')
        + '@api.github.com/repos/' + repo + '/hooks'
    ;
}

function getHook (uri, cb) {
    var opts = {
        uri : uri,
        json : true,
        headers : { 'user-agent' : 'travisify' }
    };
    request.get(opts, function (err, res, body) {
        if (err) return cb(err);
        if (res.statusCode !== 200) return cb(body);
        if (!Array.isArray(body)) {
            return cb('non-array response: ' + JSON.stringify(body));
        }
        
        cb(null, body.filter(function (rec) {
            return rec && rec.name === 'travis'
        })[0]);
    });
}

function testHook (config, repo) {
    var uri = hookUri(config, repo);
    getHook(uri, function (err, hook) {
        if (err) return console.error(err);
        if (!hook) return console.error('no hook for this project');
        
        var opts = {
            uri : uri + '/' + hook.id + '/test',
            body : '',
            headers : { 'user-agent' : 'travisify' }
        };
        request.post(opts, function (err, res, body) {
            if (err) console.error(err)
            else if (!res.statusCode.toString().match(/^2/)) {
                console.error('response code ' + res.statusCode);
                console.error(body);
            }
            else console.log('test hook sent for ' + repo + '/' + hook.id)
        });
    });
}

function addHook (config, repo) {
    var uri = hookUri(config, repo);
    var doc = {
        name : 'travis',
        config : {
            token : config.token,
            domain : '',
            user : config.user,
        },
    };
    
    getHook(uri, function (err, hook) {
        if (err) return console.error(err);
        if (hook) return console.log('this repo already has a travis hook');
        
        var opts = {
            uri : uri,
            body : JSON.stringify(doc),
            json : true,
            headers : { 'user-agent' : 'travisify' }
        };
        request.post(opts, function (err, res, body) {
            if (err) console.error(err);
            else if (body && body.id) {
                console.log('travis hook added for ' + repo
                    + ' with id ' + body.id);
            }
            else console.log(body)
        });
    });
}
