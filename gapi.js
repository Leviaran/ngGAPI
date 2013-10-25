'use strict';

angular.module('gapi', [])

  /**
   * GAPI exposes many services, but their respective APIs follow
   * a pattern. This is fortunate. We can define a core abstraction
   * for communicating with all google apis, and then specialize it
   * for each service.
   *
   * The reponsibility of this general service is to implement the 
   * authorization flow, and make requests on behalf of a dependent
   * API specific service.
   *
   * Each google API maps specific methods to HTTP verbs.
   *
   *     METHOD         HTTP
   *     list           GET
   *     insert         POST
   *     update         PUT
   *     delete         DELETE
   *     etc            ...
   *
   * Among the collected API's, these methods appear to map consistently.
   */



  .factory('GAPI', function ($q, $http, GoogleApp) {

    /**
     * GAPI Credentials
     */

    GAPI.app = GoogleApp;


    /**
     * Google APIs base URL
     */

    var server = 'https://www.googleapis.com';


    /**
     * Generate a method name from an action and a resource
     */

    function methodName (action, resource) {
      // allow resources with a path prefix
      resource = resource.split('/').pop()
      // uppercase the first character
      resource = resource.charAt(0).toUpperCase() + resource.slice(1);
      return action + resource;
    }


    /**
     * Recurse through a "spec" object and create methods for 
     * resources and nested resources.
     * 
     * For each resource in the provided spec, we define methods
     * for each of the its actions.
     */
    
    function createMethods (service, spec, parents) {
      var resources = Object.keys(spec);

      resources.forEach(function (resource) {
        var actions = spec[resource];

        actions.forEach(function (action) {
          
          // if the action is an object, treat it as a nested
          // spec and recurse
          if (typeof action === 'object') {

            if (!parents) { parents = []; }
            // we can't keep passing around the 
            // same array, we need a new one
            var p = parents.concat([resource]); 
            createMethods(service, action, p);

          } else {
          
            var method = methodName(action, resource);
            service[method] = GAPI[action](resource, parents);              
          
          }
        });
      });
    }


    /**
     * GAPI Service Constructor
     */

    function GAPI (api, version, spec) {
      this.api     = api;
      this.version = version;
      this.url     = [ server, api, version, '' ].join('/');

      createMethods(this, spec);
      
      //this.search = GAPI.search;
    }


    /**
     * OAuth 2.0 Signatures
     */

    function oauthHeader(options) {
      if (!options.headers) { options.headers = {}; }
      options.headers['Authorization'] = 'Bearer ' + GAPI.app.oauthToken.access_token;      
    }

    function oauthParams(options) {
      if (!options.params) { options.params = {}; }
      options.params.access_token = GAPI.app.oauthToken.access_token;      
    }

    
    /**
     * HTTP Request Helper
     */

    function request (config) {
      var deferred = $q.defer();

      oauthHeader(config);

      function success(response) {
        console.log(config, response);
        deferred.resolve(response.data);
      }

      function failure(fault) {
        console.log(config, fault);
        deferred.reject(fault);
      }

      $http(config).then(success, failure);
      return deferred.promise;
    }


    GAPI.request = request;


    /**
     * Build a resource url, optionally with nested resources
     */

    function resourceUrl (args, parents, base, resource) {
      var argIndex = 0
        , nodes = []
        , params = args[args.length.toString()]
        ;

      if (parents && parents.length > 0) {
        parents.forEach(function (parent, i) {
          nodes.push(parent, args[i.toString()])
          argIndex += 1;
        });
      } 

      nodes.push(resource);
      if (['string', 'number'].indexOf(typeof args[argIndex.toString()]) !== -1) {
        nodes.push(args[argIndex.toString()]);
      }

      return base += nodes.join('/');
    }


    /**
     * Get params from last argument
     */

    function params (args) {
      var last = args[(args.length - 1).toString()];
      return (typeof last === 'object') ? last : null      
    }


    /**
     * General API methods
     * 
     * These methods are used to construct a service.
     * They are not intended to be called directly on GAPI.
     */


    GAPI.get = function (resource, parents) {
      return function () {
        return request({
          method: 'GET',
          url: resourceUrl(arguments, parents, this.url, resource),
          params: params(arguments)
        });
      };
    };


    GAPI.set = function (resource, parents) {
      return function () {
        return request({
          method: 'POST',
          url: resourceUrl(arguments, parents, this.url, resource) + '/set', 
          params: params(arguments)
        });
      };
    };


    GAPI.unset = function (resource, parents) {
      return function () {
        return request({
          method: 'POST',
          url: resourceUrl(arguments, parents, this.url, resource) + '/unset', 
          params: params(arguments)
        });
      };
    };    


    GAPI.list = function (resource, parents) {
      return function () {
        return request({
          method: 'GET',
          url: resourceUrl(arguments, parents, this.url, resource),
          params: params(arguments)
        });
      };
    };
    

    // UGLY REPETITION FROM LINES 214 to 231
    // ON LINES 246 to 263
    GAPI.insert = function (resource, parents) {
      return function () {
        var args = arguments
          , last = args[(args.length - 1).toString()]
          , next = args[(args.length - 2).toString()]
          , lastType = typeof last
          , nextType = typeof next
          , data
          , params
          ;

        if (lastType === 'object' && nextType === 'object') {
          data = next;
          params = last;
        }

        if (lastType === 'object' && nextType !== 'object') {
          data = last;
          params = undefined;
        }

        return request({
          method: 'POST',
          url: resourceUrl(arguments, parents, this.url, resource), 
          data: data,
          params: params
        });
      };
    };
    

    GAPI.update = function (resource, parents) {
      return function () {
        var args = arguments
          , last = args[(args.length - 1).toString()]
          , next = args[(args.length - 2).toString()]
          , lastType = typeof last
          , nextType = typeof next
          , data
          , params
          ;

        if (lastType === 'object' && nextType === 'object') {
          data = next;
          params = last;
        }

        if (lastType === 'object' && nextType !== 'object') {
          data = last;
          params = undefined;
        }

        return request({
          method: 'PUT',
          url: resourceUrl(arguments, parents, this.url, resource),
          data: data,
          params: params
        });
      };
    };

  
    GAPI.patch = function (resource, parents) {
      return function () {
        var args = arguments
          , last = args[(args.length - 1).toString()]
          , next = args[(args.length - 2).toString()]
          , lastType = typeof last
          , nextType = typeof next
          , data
          , params
          ;

        if (lastType === 'object' && nextType === 'object') {
          data = next;
          params = last;
        }

        if (lastType === 'object' && nextType !== 'object') {
          data = last;
          params = undefined;
        }

        return request({
          method: 'PATCH',
          url: resourceUrl(arguments, parents, this.url, resource),
          data: data,
          params: params
        });
      };
    };


    GAPI.delete = function (resource, parents) {
      return function () {
        return request({
          method: 'DELETE',
          url: resourceUrl(arguments, parents, this.url, resource),
          params: params(arguments)
        });
      };
    };


    GAPI.search = function (query) {
      return request({
        method: 'GET',
        url: this.url + 'search',
        params: {
          q: query,
          part: 'snippet',
          maxResults: 50
        }
      });
    }


    /**
     * Authorization
     */

    GAPI.init = function () {
      var app = GAPI.app
        , deferred = $q.defer();

      gapi.load('auth', function () {
        gapi.auth.authorize({
          client_id: app.clientId,
          scope: app.scopes,
          immediate: false     
        }, function() {
          app.oauthToken = gapi.auth.getToken();
          deferred.resolve(app);
          console.log('authorization', app)
        });
      });

      return deferred.promise;  
    }

    return GAPI;
  })


  /**
   * Youtube API
   *
   *   Youtube.listActivities(params)
   *   Youtube.insertActivities(data, params)
   *   
   *   Youtube.listChannels(params)
   *   Youtube.updateChannels(data, params)
   *  
   *   Youtube.listGuideCategories(params)
   *  
   *   Youtube.listPlaylistItems(params)
   *   Youtube.insertPlaylistItems(data, params)
   *   Youtube.updatePlaylistItems(data, params)
   *   Youtube.deletePlaylistItems(params)
   *  
   *   Youtube.listPlaylists(params)
   *   Youtube.insertPlaylists(data, params)
   *   Youtube.updatePlaylists(data, params)
   *   Youtube.deletePlaylists(params)
   *  
   *   Youtube.search()
   *  
   *   Youtube.listSubscriptions(params)
   *   Youtube.insertSubscriptions(data, params)
   *   Youtube.deleteSubscriptions(params)
   *  
   *   Youtube.setThumbnails(?)
   *  
   *   Youtube.listVideoCategories(params)
   *  
   *   Youtube.listVideos(params)
   *   Youtube.insertVideos(data, params)
   *   Youtube.updateVideos(data, params)
   *   Youtube.deleteVideos(params)
   *  
   *   Youtube.getRating(?)
   * 
   */

  .factory('Youtube', function (GAPI) {
    var Youtube = new GAPI('youtube', 'v3', {
      activities:       ['list', 'insert'],
      channels:         ['list', 'update'],
      guideCategories:  ['list'],
      liveBroadcasts:   ['list', 'insert', 'update', 'delete'],
      liveStreams:      ['list', 'insert', 'update', 'delete'],
      playlistItems:    ['list', 'insert', 'update', 'delete'],
      playlists:        ['list', 'insert', 'update', 'delete'],
      subscriptions:    ['list', 'insert', 'delete'],
      thumbnails:       ['set'],
      videoCategories:  ['list'],
      videos:           ['list', 'insert', 'update', 'delete'],
      watermarks:       ['set', 'unset']
    });

    // Some methods don't fit the pattern
    // Define them explicitly here
    Youtube.insertChannelBanners = function () {};

    Youtube.bindLiveBroadcasts = function () {};
    Youtube.controlLiveBroadcasts = function () {};
    Youtube.transitionLiveBroadcasts = function () {};

    Youtube.rateVideos = function (params) {
      return GAPI.request({
        method: 'POST',
        url: Youtube.url + 'videos/rate', 
        params: params
      });
    };

    Youtube.getVideoRating = function (params) {
      return GAPI.request({
        method: 'GET',
        url: Youtube.url + 'videos/getRating', 
        params: params
      });      
    };

    //Youtube.unsetWatermarks = function () {};

    Youtube.search = function (params) {
      return GAPI.request({
        method: 'GET',
        url: Youtube.url + 'search',
        params: params
      });
    }

    return Youtube;
  })


  /**
   * Blogger API
   *
   *   Blogger.getBlogs(id)
   *   Blogger.getBlogByUrl()
   *   Blogger.getBlogsByUser
   *   
   *   Blogger.listComments(blogId, postId)
   *   Blogger.getComments(blogId, postId, commentId)
   *
   *   Blogger.listPages(blogId)
   *   Blogger.getPages(blogId, pageId)
   *
   *   Blogger.listPosts(blogId)
   *   Blogger.getPosts(blogId, postId)
   *   Blogger.insertPosts(blogId, postId)
   *   Blogger.updatePosts(blogId, postId)
   *   Blogger.deletePosts(blogId, postId)
   *   Blogger.patchPosts(blogId, postId)
   *   
   *   Blogger.getPostByPath(blogId, path)
   *   Blogger.searchPosts(blogId, query)
   *   
   *   Blogger.getUsers(userId)
   *   
   */


  .factory('Blogger', function (GAPI) {

    var Blogger = new GAPI('blogger', 'v3', {
      users:        ['get'],
      blogs:        ['get', {
        pages:      ['list', 'get'],
        posts:      ['list', 'get', 'insert', 'update', 'delete', {
          comments: ['list', 'get']
        }]
      }]
    });

    // search
    // patch
    // getPostsByPath
    // getBlogByUrl
    // listBlogsByUser
    
    return Blogger;
  })


  /**
   * Calendar API
   */

  .factory('Calendar', function (GAPI) {
    var Calendar = new GAPI('calendar', 'v3', {
      colors: ['get'],
      calendars: ['get', 'insert', 'update', 'delete', 'patch', {
        acl:     ['list', 'get', 'insert', 'update', 'delete', 'patch'],
        events:  ['list', 'get', 'insert', 'update', 'delete', 'patch']
      }],
      'users/me/calendarList': ['list', 'get', 'insert', 'update', 'delete', 'patch'],
      'users/me/settings': ['list', 'get']
    });


    Calendar.clearCalendar = function (id, params) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + 'calendars/' + id + '/clear',
        params: params
      });
    };

    Calendar.importEvents = function (calendarId, data, params) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + ['calendars', calendarId, 'events', 'import'].join('/'),
        data:   data,
        params: params
      });
    };

    Calendar.moveEvents = function (calendarId, eventId, destinationId) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + ['calendars', calendarId, 'events', eventId, 'move'].join('/'),
        params: { destination: destinationId }
      });
    };

    Calendar.listEventInstances = function (calendarId, eventId, params) {
      return GAPI.request({
        method: 'GET',
        url:    Calendar.url + ['calendars', calendarId, 'events', eventId, 'instances'].join('/'),
        params: params
      });
    }

    Calendar.quickAdd = function (id, params) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + ['calendars', id, 'events', 'quickAdd'].join('/'),
        params: params
      });
    }

    Calendar.watchEvents = function (id, data, params) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + ['calendars', id, 'events', 'watch'].join('/'),
        data:   data,
        params: params        
      });
    };

    Calendar.freeBusy = function (data) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + 'freeBusy',
        data:   data      
      });
    }

    Calendar.stopWatching = function (data) {
      return GAPI.request({
        method: 'POST',
        url:    Calendar.url + 'channels/stop',
        data:   data
      });
    };

    return Calendar;
  })


  /**
   * Drive API
   */

  .factory('Drive', function (GAPI) {
    var Drive = new GAPI('drive', 'v2', {
      files:          ['get', 'list', 'insert', 'update', 'delete', 'patch', {
        children:     ['get', 'list', 'insert', 'delete'],
        parents:      ['get', 'list', 'insert', 'delete'],        
        permissions:  ['get', 'list', 'insert', 'update', 'delete', 'patch'],
        revisions:    ['get', 'list', 'update', 'delete', 'patch'],
        comments:     ['get', 'list', 'insert', 'update', 'delete', 'patch', {
          replies:      ['get', 'list', 'insert', 'update', 'delete', 'patch']
        }],
        properties:   ['get', 'list', 'insert', 'update', 'delete', 'patch'],
        realtime:     ['get']
      }],
      changes: ['get', 'list'],
      apps: ['get', 'list']
    });

    Drive.copyFile = function (fileId, data, params) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + ['files', fileId, 'copy'].join('/'),
        data:   data,
        params: params
      });
    };

    Drive.touchFile   = function (fileId) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + ['files', fileId, 'touch'].join('/')
      });      
    };

    Drive.trashFile   = function (fileId) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + ['files', fileId, 'trash'].join('/')
      });  
    };

    Drive.untrashFile = function (fileId) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + ['files', fileId, 'untrash'].join('/')
      });        
    };

    Drive.watchFile   = function (fileId, data) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + ['files', fileId, 'watch'].join('/'),
        data:   data
      });
    };

    Drive.about = function (params) {
      return GAPI.request({
        method: 'GET',
        url:    Drive.url + 'about',
        params: params
      });
    }

    Drive.watchChanges = function (data) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + 'changes/watch',
        data:   data
      });
    };

    Drive.getPermissionIdForEmail = function (email) {
      return GAPI.request({
        method: 'GET',
        url:    Drive.url + ['permissionIds', email].join('/')
      });
    };

    Drive.stopChannels = function (data) {
      return GAPI.request({
        method: 'POST',
        url:    Drive.url + 'channels/stop',
        data:   data
      });
    };

    Drive.updateRealtime = function (fileId, params) {
      return GAPI.request({
        method: 'PUT', 
        url:    Drive.url + ['files', fileId, 'realtime'].join('/'),
        params: params
      });
    };


    return Drive;
  })


  /**
   * Google+ API
   */

  .factory('Plus', function (GAPI) {
    var Plus = new GAPI('plus', 'v1', {
      people:       ['get', {
        activities: ['list']
      }],
      activities:   ['get', {
        comments:   ['list']
      }], 
      comments:     ['get']
    });

    Plus.searchPeople = function (params) {
      return GAPI.request({
        method: 'GET',
        url:    Plus.url + 'people',
        params: params
      });     
    };

    Plus.listPeopleByActivity = function (activityId, collection, params) {
      return GAPI.request({
        method: 'GET',
        url:    Plus.url + ['activities', activityId, 'people', collection].join('/'),
        params: params
      });        
    };
    
    Plus.listPeople = function (userId, collection, params) {
      return GAPI.request({
        method: 'GET',
        url:    Plus.url + ['people', userId, 'people', collection].join('/'),
        params: params
      });
    }

    Plus.searchActivities = function (params) {
      return GAPI.request({
        method: 'GET',
        url:    Plus.url + 'activities',
        params: params
      });  
    };

    Plus.insertMoments = function (userId, collection, data, params) {
      return GAPI.request({
        method: 'POST',
        url:    Plus.url + ['people', userId, 'moments', collection].join('/'),
        data:   data,
        params: params
      });      
    };

    Plus.listMoments = function (userId, collection, params) {
      return GAPI.request({
        method: 'GET',
        url:    Plus.url + ['people', userId, 'moments', collection].join('/'),
        params: params
      });  
    };

    Plus.removeMoments = function (id) {
      return GAPI.request({
        method: 'DELETE',
        url:    Plus.url + ['moments', id].join('/')
      });       
    };

    return Plus;
  })
