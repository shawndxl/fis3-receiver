var http = require('http');
var formidable = require('formidable');
var fs = require('fs');
var url = require('url');
var path = require('path');
var mkdirp = require('mkdirp');
var minimatch = require('minimatch');
var exec = require('exec');
var RealTimeConfig = require('rtconfig');
var config = new RealTimeConfig('./config.json', {
  onupdate: function (data) {
    console.log('config.update() data: %j', data);
  }
});

/**
 *  * 获取客户端 IP 地址
 *   *
 *    * Nginx 需要设置才有效 `proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;`
 *     * @see https://rtcamp.com/tutorials/nginx/forwarding-visitors-real-ip/
 *      * @param {HTTPRequest} req HTTP request
 *       */
function getClientIp(req) {
  if (!req) {
    return;
  }
  return req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
}

var server = http.createServer(function(req, res) {

  function error(err) {
    console.error('error(err: %j)', err);
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
    res.end(err.toString()); //fail
  }

  function success() {
    res.writeHead(200, {
      'Content-Type': 'text/plain'
    });
    res.end('0'); //success
  }

  function next(from, to) {
    fs.readFile(from, function(err, content) {
      if (err) {
        error(err);
      } else {
        fs.writeFile(to, content, function(err) {
          if (err) {
            error(err);
          }
          fs.unlink(from, function(err) {
            if (err) {
              error(err);
            }
          });
          console.info('upload success. clientIp: %j, to: %j', clientIp, to);
          success();
        });
      }
    });
  }

  var urlInfo = url.parse(req.url, true);
  var clientIp = getClientIp(req);
  if (urlInfo.pathname === '/receiver' && req.method === 'POST') {

    var info = config[urlInfo.query.token];
    if (!info) {
      error('fail. #1');
      return;
    }

    var iplimit = info.iplimit || (config.default && config.default.iplimit);
    if (iplimit) { // 来源 IP 限制
      if (!minimatch(clientIp, iplimit)) {
        error('fail. #6');
        return;
      }
    }

    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
      if (err) {
        error(err);
      } else {
        var to = fields['to'];

        if (to === '#end') {
          if (info.postreceiver) {
            exec(info.postreceiver, {
              env: {
                PATH: process.env.PATH,
                HOME: process.env.HOME
              }
            }, function(err, out, code) {
              if (err) {
                console.error(err);
                error('fail. #7');
              } else {
                console.info('exec success. clientIp: %j, post: %j', clientIp, info.postreceiver);
                success();
              }
            });
          } else {
            success();
          }
          return;
        }

        if (to === '#begin' || to === '#start') {
          if (info.prereceiver) {
            exec(info.prereceiver, {
              env: {
                PATH: process.env.PATH,
                HOME: process.env.HOME
              }
            }, function(err, out, code) {
              if (err) {
                console.error(err);
                error('fail. #8');
              } else {
                success();
              }
            });
          } else {
            console.info('exec success. clientIp: %j, pre: %j', clientIp, info.prereceiver);
            success();
          }
          return;
        }

        if (to.indexOf('..') >= 0) {
          error('fail. #3');
          return;
        }
        if (to.indexOf(info.to) !== 0) {
          error('fail. #4');
          return;
        }

        fs.exists(to, function(exists) {
          if (exists) {
            fs.unlink(to, function(err) {
              next(files.file && files.file.path || files['null'].path, to);
            });
          } else {
            fs.exists(path.dirname(to), function(exists) {
              if (exists) {
                next(files.file && files.file.path || files['null'].path, to);
              } else {
                mkdirp(path.dirname(to), 0777, function(err) {
                  if (err) {
                    error(err);
                    return;
                  }
                  next(files.file && files.file.path || files['null'].path, to);
                });
              }
            });
          }
        });
      }
    });
  } else {
    error('fail. #0');
  }
});
module.exports = server;