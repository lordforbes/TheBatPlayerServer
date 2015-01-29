var exec = require('child_process').exec;
var utils = require("../utils/utils.js");
var fs = require('fs');
var config = require("../config.js");

function createBackground(url, colorObject, callback) {

  var path = utils.getCacheFilepathForUrl(url, "backgrounds");
  var cacheFile = utils.getCacheFilepathForUrl(url, "original");

  fs.exists(path, function(exists) {
    if (exists && config.enableImageCache) {
      callback(null, path);
      return;
    }

    utils.download(url, cacheFile, function() {
      var rgb = "'rgb\(" + colorObject.red + "," + colorObject.green + "," + colorObject.blue + "\)'";
      var command = "convert " + cacheFile + " -set colorspace RGB \\( -clone 0 -fill " + rgb + " -colorize 90% -auto-level \\) \\( -clone 0 -colorspace gray \\) -compose blend -define compose:args=80x30 -composite -resize 480x270\^ -gravity center -crop 480x270+0+40 -colors 10 -median 2 -modulate 180,110 -morphology Open Octagon -fill " + rgb + " -blur 4x1 -contrast-stretch 2x50% -colorize 10% " + path;
      console.log(command);

      var child = exec(command, null, function(err, stdout, stderr) {
        console.log("Complete");
        callback(err, path);
      });

    });
  });


}

module.exports.createBackground = createBackground;