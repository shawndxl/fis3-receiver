var server = require('./server.js');

var PORT = parseInt(process.argv[2]) || 8999;

server.listen(PORT, function () {
    console.log('receiver listening *:' + PORT);
});
