var utils = require('./utils.js');
var fs = require('fs');
var md5 = require('MD5');
var C = require('c0lor');
var FlatColors = require("flatcolors");
var log = utils.log;

var imagecolors = require('imagecolors');
var colormatch = require('colormatch');

var ColorSpace = C.space.rgb['CIE-RGB'];

function getColorForUrl(url, callback) {
  var path = utils.getCacheFilepathForUrl(url, "original");

  utils.download(url, path, function() {

    try {
      // var image = fs.readFileSync(path);

      // var originalrgb = colorThief.getColor(image, 1);
      imagecolors.extract(path, 5, function(err, colors) {

        if (!err && colors.length > 0) {
          var colorObject = buildColorObjectFromColors(colors);
          callback(colorObject);
        } else {
          callback(null);
        }
      });

    } catch (e) {
      log(e);
    }


  });
}

function buildColorObjectFromColors(colors) {
  var color = getColorFromColorArray(colors);

  var colorObject = {
    rgb: {
      red: null,
      green: null,
      blue: null
    },
    hex: null,
    int: null,
    xyz: null
  };

  var rgb = [color.rgb.r, color.rgb.g, color.rgb.b];
  var originalRgb = [color.rgb.r, color.rgb.g, color.rgb.b];

  colorObject.rgb.red = originalRgb[0];
  colorObject.rgb.green = originalRgb[1];
  colorObject.rgb.blue = originalRgb[2];
  colorObject.hex = color.hex;
  colorObject.int = 65536 * originalRgb[0] + 256 * originalRgb[1] + originalRgb[2];

  // Doesn't work
  //var colorFormats = C.RGB(rgb[0], rgb[1], rgb[2]);
  //colorObject.xyz = ColorSpace.XYZ(colorFormats);
  //

  X = 1.076450 * rgb[0] - 0.237662 * rgb[1] + 0.161212 * rgb[2];
  Y = 0.410964 * rgb[0] + 0.554342 * rgb[1] + 0.034694 * rgb[2];
  Z = -0.010954 * rgb[0] - 0.013389 * rgb[1] + 1.024343 * rgb[2];

  colorObject.xyz = {
    x: X,
    y: Y,
    z: Z
  };

  return colorObject;
}

function getColorFromColorArray(colors) {

  colors.sort(function(a, b) {

    // console.log(a.family);

    if (a.luminance < 0) {
      // console.log("Too dark");
      return -1;
    }

    if (a.family == "white") {
      // console.log("Too white");
      return -1;
    }

    if (a.family == "black") {
      // console.log("Too black");
      return -1;
    }

    var rgb = [a.rgb.r, a.rgb.g, a.rgb.b];
    var skin = [229, 160, 115];
    var isSkin = colormatch.quickMatch(rgb, skin);
    if (isSkin) {
      // console.log("Looks like skin color");
      return -1;
    }

    if (a.percent < 3) {
      // console.log("Not enough of this color.");
      return -1;
    }

    if (a.luminance < b.luminance) {
      return 1;
    } else if (a.luminance == b.luminance) {
      return 0;
    } else {
      // console.log("Not bright enough.");
      return -1;
    }

  });


  var index = 0;
  var selectedColor = colors[colors.length - 1];

  // If per chance we selected something we don't want then remedy that.
  while (selectedColor.family == "dark" || selectedColor.family == "black") {
    index++;
    if (index === colors.length - 1) {
      return colors[3]; // Fallback color
    }
  }
  return selectedColor;
}

if (!Array.prototype.last) {
  Array.prototype.last = function() {
    return this[this.length - 1];
  };
}

module.exports.getColorForUrl = getColorForUrl;