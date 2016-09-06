/**
 * Copyright (c) 2014, Tidepool Project
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 *
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 */

/* global chrome */

var _ = require('lodash');
var async = require('async');
var format = require('util').format;
var md5 = require('blueimp-md5');
var config = require('../config.js');
// sometimes we load this into node and this routine behaves differently
if (md5.md5) {
  md5 = md5.md5;
}
var semver = require('semver');
var sundial = require('sundial');
var uuid = require('node-uuid');

var isChromeApp = (typeof chrome !== 'undefined');
var bows = require('../bows');
var errorText = require('../redux/constants/errors');
var log = isChromeApp ? bows('Api') : console.log;
var builder = require('../objectBuilder')();
var localStore = require('./localStore');

// for cli tools running in node
if (typeof localStore === 'function') {
  localStore = localStore({});
}

// Wrapper around the Tidepool client library
var createTidepoolClient = require('tidepool-platform-client');
var request = require('request');
var tidepool;

var api = {
  log: log
};

// ----- Api Setup -----

// synchronous!
api.create = function(options) {
  var tidepoolLog = isChromeApp ? bows('Tidepool') : console.log;
  tidepool = createTidepoolClient({
    host: options.apiUrl,
    uploadApi: options.uploadUrl,
    log: {
      warn: tidepoolLog,
      info: tidepoolLog,
      debug: tidepoolLog
    },
    localStore: localStore,
    metricsSource: 'chrome-uploader',
    metricsVersion: options.version
  });

  api.tidepool = tidepool;
};

// asynchronous!
api.init = function(cb) {
  api.tidepool.initialize(cb);
};

// ----- Config -----
api.setHosts = function(hosts) {
  if (hosts.API_URL) {
    tidepool.setApiHost(hosts.API_URL);
  }
  if (hosts.UPLOAD_URL) {
    tidepool.setUploadHost(hosts.UPLOAD_URL);
  }
  if (hosts.BLIP_URL) {
    tidepool.setBlipHost(hosts.BLIP_URL);
  }
};

api.makeBlipUrl = function(tail) {
  return tidepool.makeBlipUrl(tail);
};

// ----- User -----

api.user = {};

api.user.login = function(user, options, cb) {
  api.log('POST /auth/login');

  tidepool.login(user, options, function(err, data) {
    if (err) {
      return cb(err);
    }
    return cb(null, data);
  });
};

api.user.account = function(cb) {
  api.log('GET /auth/user');
  tidepool.getCurrentUser(cb);
};

api.user.loggedInProfile = function(cb) {
  api.log('GET /metadata/' + tidepool.getUserId() + '/profile');
  tidepool.findProfile(tidepool.getUserId(), function(err, profile) {
      if (err) {
        return cb(err);
      }
      return cb(null, profile);
  });
};

api.user.profile = function(userId, cb) {
  api.log('GET /metadata/' + userId + '/profile');
  tidepool.findProfile(userId, function(err, profile) {
    if (err) {
      return cb(err);
    }
    return cb(null, profile);
  });
};

api.user.addProfile = function(userId, profile, cb){
  api.log('PUT /metadata/' + userId + '/profile');
  tidepool.addOrUpdateProfile(userId, profile, function(err, response){
    if(err){
      return cb(err);
    }
    return cb(null, response);
  });
};

api.user.updateProfile = function(userId, updates, cb){
  api.user.profile(userId, function(err, profile){
    if(err){
      return cb(err);
    }
    var patient = _.get(profile, 'patient', {});
    var patient_updates = _.get(updates, 'patient', {});
    var new_patient = _.assign(patient, patient_updates);
    var new_profile = _.merge(profile, updates);
    new_profile.patient = new_patient;
    return api.user.addProfile(userId, new_profile, cb);
  });
};

api.user.logout = function(cb) {
  api.log('POST /auth/logout');
  if (!tidepool.isLoggedIn()) {
    api.log('Not authenticated, but still destroying session for just in cases...');
    tidepool.destroySession();
    return;
  }
  tidepool.logout(function(err) {
    if (err) {
      api.log('Error while logging out but still destroying session...');
      tidepool.destroySession();
      return cb(err);
    }
    cb(null);
  });
};

api.user.getUploadGroups = function(cb) {
  var userId = tidepool.getUserId();

  api.log('GET /access/groups/' + userId);

  tidepool.getUploadGroups(userId, function(err, groups) {
    if (err) {
      return cb(err);
    }

    var asyncProfileSearchTasks = [];
    var uploadGroups = [];

    for(var id in groups) {
      var group = groups[id];

      var find = (function(_id) {
        return function(callback) {
          tidepool.findProfile(_id, function(err, profile) {
            if (err) {
              callback(err);
            }

            uploadGroups.push({
              userid: _id,
              profile: profile
            });

            callback();
          });
        };
      })(id);

      asyncProfileSearchTasks.push(find);
    }

    if(!asyncProfileSearchTasks.length) {
      return cb(null, []);
    }

    async.parallel(asyncProfileSearchTasks, function(){
      var sortedGroups = _.sortBy(uploadGroups, function(group) { return group.userid === userId; });

      return cb(null, sortedGroups);
    });
  });
};

// ----- Upload -----

api.upload = {};

api.upload.getVersions = function(cb) {
  api.log('GET /info');
  tidepool.checkUploadVersions(function(err, resp) {
    if (err) {
      if (!navigator.onLine) {
        return cb(new Error(errorText.E_OFFLINE));
      }
      return cb(err);
    }
    var uploaderVersion = _.get(resp, ['versions', 'uploaderMinimum'], null);
    if (uploaderVersion !== null) {
      return cb(null, resp.versions);
    }
    else {
      return cb(new Error(format('Info response does not contain versions.uploaderMinimum.')));
    }
  });
};

api.upload.accounts = function(happyCb, sadCb) {
  api.log('GET /access/groups/'+tidepool.getUserId());
  tidepool.getViewableUsers(tidepool.getUserId(),function(err, data) {
    if(err){
      return sadCb(err,err);
    }
    return happyCb(data, 'upload accounts found');
  });
};

function postBlockToPlatform(data, groupId, blockIndex, callback) {

  var recCount = data.length;
  var happy = function () {
    callback(null, recCount);
  };

  var sad = function (jqxhr, status, err) {
    api.log('postBlockToPlatform: checking failure details');
    if (jqxhr.status == 413 && data.length > 1) { // request entity too big
      // but we can split the request and try again
      var l = Math.floor(data.length / 2);
      var d1 = data.slice(0, l);
      var d2 = data.slice(l);
      async.mapSeries([d1, d2], postBlockToPlatform, function (err, result) {
        if (err) {
          return callback(err, 0);
        }
        return callback(null, result[0] + result[1]);
      });
      return;
    }
    if (jqxhr.responseJSON && jqxhr.responseJSON.errorCode && jqxhr.responseJSON.errorCode == 'duplicate') {
      api.log(jqxhr.responseJSON);
      callback('duplicate', jqxhr.responseJSON.index);
    } else {
      api.log('platform data post failed.');
      api.log(status);
      callback(status);
    }
  };

  api.log('postBlockToPlatform #' + blockIndex + ': using id ', groupId);

  tidepool.uploadDeviceDataForUser(groupId, data, function(err, result) {
    if (err) {
      return sad(err, err);
    }
    return happy(result);
  });
}

/*
 * process the data sending it to the platform in blocks and feed back progress to the calling function
 */
api.upload.toPlatform = function(data, sessionInfo, progress, groupId, cb) {

  api.log('attempting to upload', data.length, 'device data records');
  var grouped = _.groupBy(data, 'type');
  for (var type in grouped) {
    api.log(grouped[type].length, 'records of type', type);
  }


  var blocks = [];
  var BLOCKSIZE = 100;
  var nblocks = 0;

  var post_and_progress = function (data, callback) {
    progress(nblocks++ * 100.0 / blocks.length);
    //off to the platfrom we go
    return postBlockToPlatform(data, groupId, nblocks, callback);
  };

  var post_upload_meta = function (uploadMeta, callback) {
    return postBlockToPlatform(uploadMeta, groupId, 0, callback);
  };

  var decorate = function (data, uploadItem) {
    var deviceRecords = _.map(data, function(item) {
      return _.extend({}, item, {
        uploadId: uploadItem.uploadId,
        guid: uuid.v4()
      });
    });
    return deviceRecords;
  };

  async.waterfall([
    function(callback) {
      //generate and post the upload metadata
      var uploadId = 'upid_' + md5(sessionInfo.deviceId + '_' + sessionInfo.start).slice(0, 12);
      var now = new Date();

      var uploadItem = builder.makeUpload()
        // yes, I'm intentionally breaking up the new Date() I made and parsing
        // it again with another new Date()...it's a moment limitation...
        .with_computerTime(sundial.formatDeviceTime(new Date(Date.UTC(
          now.getFullYear(), now.getMonth(), now.getDate(),
          now.getHours(), now.getMinutes(), now.getSeconds()
        ))))
        .with_time(sessionInfo.start)
        .with_timezone(sessionInfo.tzName)
        .with_timezoneOffset(-new Date().getTimezoneOffset())
        .with_conversionOffset(0)
        .with_timeProcessing(sessionInfo.timeProcessing)
        .with_version(sessionInfo.version)
        .with_uploadId(uploadId)
        .with_guid(uuid.v4())
        .with_source(sessionInfo.source)
        .with_byUser(tidepool.getUserId())
        .with_deviceTags(sessionInfo.deviceTags)
        .with_deviceManufacturers(sessionInfo.deviceManufacturers)
        .with_deviceModel(sessionInfo.deviceModel)
        .with_deviceSerialNumber(sessionInfo.deviceSerialNumber)
        .with_deviceId(sessionInfo.deviceId)
        .with_payload(sessionInfo.payload)
        .done();

      api.log('saving upload metadata');

      post_upload_meta(uploadItem, function(err){
        if(_.isEmpty(err)){
          api.log('saved upload metadata');
          return callback(null, uploadItem);
        }
        api.log('error saving upload metadata ', err);
        return callback(err);
      });
    },
    function(uploadItem, callback) {
      // decorate our data with the successfully posted upload metadata
      // as well as a GUID and then save to the platform
      data =  decorate(data, uploadItem);

      for (var i = 0; i < data.length; i += BLOCKSIZE) {
        blocks.push(data.slice(i, i + BLOCKSIZE));
      }
      api.log('start uploading the rest of the data');
      //process then finalise, or if you want you can finalize :)
      async.mapSeries(blocks, post_and_progress, callback);
    }
  ], function (err, result) {
    if(_.isEmpty(err)){
      api.log('upload.toPlatform: all good');
    //kick off uploadHistory list call
      api.data.fetchUploadHistory(function(cb, uploads){
        return dispatch(syncActions.uploadHistorySuccess(uploads));
      });
      return cb(null, result);
    }
    api.log('upload.toPlatform: failed ',err);
    return cb(err);
  });
};

// `payload` contains:
// `carelinkUsername`, `careLinkPassword`, `daysAgo`
api.upload.fetchCarelinkData = function(payload, cb) {
  api.log('POST /carelink');
  tidepool.uploadCarelinkDataForUser(payload, function(err, syncTask) {
    if (err) {
      return cb(err);
    }
    return tidepool.getCarelinkData(syncTask.id, cb);
  });
};

// ----- Upload History -----

api.data = {};

// This is not part of the existing API, but because it theoretically will be eventually, we have included it as part of the API
// no Tidepool-platform-client endpoint for custom queries so we will call the API directly
// This requires a temp change to the tidepool API (making getUserToken public. This seems like a bad idea for the longterm)

api.data.fetchUploadHistory = function(cb) {
  var userId = tidepool.getUserId();
  var token = tidepool.getUserToken();
  var API_URL = config.API_URL;
  api.log('GET /data/'+userId+'?type=upload');

  var options = {
    uri: API_URL + '/data/'+userId+'?type=upload',
    headers: { 'x-tidepool-session-token' : token }
  };
  request(options, function(error, response, body) {
    var uploads = [];

    if (!error && response.statusCode == 200) {
      try{
        uploads = JSON.parse(body);
      } catch(e) {
        alert(e);
      }

      return cb(null, uploads)
    }
  });


};



// ----- Metrics -----

api.metrics = {};

api.metrics.track = function(eventName, properties) {
  api.log('GET /metrics/' + window.encodeURIComponent(eventName));
  return tidepool.trackMetric(eventName, properties);
};

// ----- Errors -----

api.errors = {};

api.errors.log = function(error, message, properties) {
  api.log('GET /errors');
  return tidepool.logAppError(error.debug, message, properties);
};

module.exports = api;
