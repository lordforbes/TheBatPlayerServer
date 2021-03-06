var streamtitle = require("./streamTitle.js");
var shoutcasttitle = require("./getTitleShoutcast.js");
var utils = require("../utils/utils.js");
var log = utils.log;
var lastfm = require('./sources/lastfm.js');
var async = require("async");
var moment = require("moment");
var album = require("./getAlbum.js");
var md5 = require('MD5');
var config = require("../config.js");
var charmed = require('charmed');

var S = require('string');
S.extendPrototype();
var validUrl = require('valid-url');


function fetchMetadataForUrl(url, req, mainCallback) {

  if (!validUrl.isUri(url)) {
    var error = {};
    error.message = "The URL " + url + " does not appear to be a valid URL.  Please verify it's a properly encoded URL.";
    error.status = 406;
    error.batserver = config.useragent;
    return mainCallback(error, null);
  }

  var track = null;
  var fetchMethodCacheTime = Math.floor(Date.now() / 1000) + (config.cachetime * 60);
  var streamCacheKey = ("cache-stream-" + url).slugify();

  var sourceStreamCacheKey = ("cache-source-stream-" + url).slugify();
  var metadataSource;
  var streamFetchMethodCacheKey = ("cache-stream-fetchmethod" + url).slugify();

  if (url.endsWith("/;")) {
    url = url + "/;";
  }

  utils.getCacheData(streamFetchMethodCacheKey, function(error, result) {
    metadataSource = result;


    async.series([

        // Check for a cached version
        function(callback) {
          utils.getCacheData(streamCacheKey, function(error, result) {
            if (!error && result) {
              track = result;
              return mainCallback(error, track);
            } else {
              return callback();
            }
          });
        },

        // Get the title from Shoutcast v1 metadata
        function(callback) {
          if (track === null && (metadataSource != "SHOUTCAST_V2" && metadataSource != "STREAM")) {
            shoutcasttitle.getV1Title(url, function(data) {
              if (data) {
                track = utils.createTrackFromTitle(data.title);
                track.station = data;
                if (!metadataSource) {
                  utils.cacheData(streamFetchMethodCacheKey, "SHOUTCAST_V1", fetchMethodCacheTime);
                }
              }
              return callback();
            });
          } else {
            return callback();
          }
        },

        // Get the title from Shoutcast v2 metadata
        function(callback) {
          if (track === null && (metadataSource != "SHOUTCAST_V1" && metadataSource != "STREAM")) {
            shoutcasttitle.getV2Title(url, function(data) {
              if (data) {
                track = utils.createTrackFromTitle(data.title);
                track.station = data;
                if (!metadataSource) {
                  utils.cacheData(streamFetchMethodCacheKey, "SHOUTCAST_V2", fetchMethodCacheTime);
                }
              }
              return callback();
            });
          } else {
            return callback();
          }

        },

        // Get the title from the station stream
        function(callback) {
          if (track === null) {
            streamtitle.getTitle(url, function(error, title) {
              if (title) {
                track = utils.createTrackFromTitle(title);
                track.station = {};
                track.station.fetchsource = "STREAM";
                utils.cacheData(streamFetchMethodCacheKey, "STREAM", fetchMethodCacheTime);
              }
              return callback();
            });
          } else {
            return callback();
          }
        },

        function(asyncCallback) {
          if (track) {
            async.parallel([
                function(callback) {
                  async.series([ //Begin Artist / Color series

                    // Get artist
                    function(callback) {
                      getArtistDetails(track, callback);
                    },

                    // Get color based on above artist image
                    function(callback) {
                      getColor(track, function() {
                        if (track.image.url) {
                          var file = encodeURIComponent(track.image.url);
                          track.image.backgroundurl = config.hostname + "/images/background/" + file + "/" + track.image.color.rgb.red + "/" + track.image.color.rgb.green + "/" + track.image.color.rgb.blue;
                          track.image.url = config.hostname + "/images/artist/" + file + "/" + track.image.color.rgb.red + "/" + track.image.color.rgb.green + "/" + track.image.color.rgb.blue;
                        }
                        return callback();
                      });
                    }

                  ], function(err, results) {
                    return callback();
                  }); // End Artist / Color series
                },

                // Get track Details
                function(callback) {
                  if (track.song && track.artist) {
                    getTrackDetails(track, callback);
                  } else {
                    return callback();
                  }

                },

                // Get Album for track
                function(callback) {
                  if (track.artist && track.song) {
                    getAlbumDetails(track, function(error, albumObject) {
                      track.album = albumObject;
                      return callback();
                    });
                  } else {
                    track.album = null;
                    return callback();
                  }
                }


              ],
              function(err, results) {
                return asyncCallback(); // Track and Album details complete
              });
          } else {
            return asyncCallback(); // No track exists so track and album details could not take place
          }
        }
      ],
      function(err) {
        // If no track was able to be created it's an error
        if (!track) {
          var error = {};
          error.message = "No data was able to be fetched for your requested radio stream: " + decodeURIComponent(url) + ". Make sure your stream url is valid and encoded properly.  It's also possible the server just doesn't supply any metadata for us to provide you.";
          error.status = 400;
          error.batserver = config.useragent;
          return mainCallback(error, null);
        }

        utils.cacheData(streamCacheKey, track, config.cachetime);

        return mainCallback(null, track);
      });
  });

}

function getArtistDetails(track, callback) {
  lastfm.getArtistDetails(utils.sanitize(track.artist), function(error, artistDetails) {
    populateTrackObjectWithArtist(track, artistDetails);
    return callback();
  });
}

function getTrackDetails(track, callback) {
  lastfm.getTrackDetails(utils.sanitize(track.artist), utils.sanitize(track.song), function(error, trackDetails) {
    populateTrackObjectWithTrack(track, trackDetails);
    return callback();
  });
}

function getAlbumDetails(track, callback) {
  album.fetchAlbumForArtistAndTrack(track.artist, track.song, callback);
}

function getColor(track, callback) {
  if (track.image.url) {
    utils.getColorForImage(track.image.url, function(color) {
      if (color) {
        track.image.color = color;
      }
      return callback();
    });
  } else {
    return callback();
  }

}

function createEmptyTrack() {
  var track = {};
  return track;
}

function populateTrackObjectWithArtist(track, apiData) {

  if (apiData) {
    try {
      var bioDate = moment(new Date(apiData.bio.published));
      var bioText = apiData.bio.summary.stripTags().trim().replace(/\n|\r/g, "");

      // Simplify unicode since Roku can't handle it
      track.artist = charmed.toSimple(track.artist);
      track.song = charmed.toSimple(track.song);
      track.bio.text = charmed.toSimple(bioText);

      track.image.url = apiData.image.last()["#text"];
      track.isOnTour = parseInt(apiData.ontour);
      track.bio.published = bioDate.year();
      track.tags = apiData.tags.tag.map(function(tagObject) {
        return tagObject.name;
      });

      // If on tour then add it as the first tag
      if (track.isOnTour) {
        track.tags.unshift("on tour");
      }

      track.metaDataFetched = true;
    } catch (e) {
      log(e);
    }
  }
}

function populateTrackObjectWithTrack(track, apiData) {

  if (apiData) {
    try {
      track.album.name = charmed.toSimple(apiData.album.title);
      track.album.image = apiData.album.image.last()["#text"];
      track.metaDataFetched = true;
    } catch (e) {

    } finally {}

  }

}


if (!Array.prototype.last) {
  Array.prototype.last = function() {
    return this[this.length - 1];
  };
}


module.exports.fetchMetadataForUrl = fetchMetadataForUrl;