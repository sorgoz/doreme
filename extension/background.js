
var ncr = {

	re_domain: new RegExp("^https?:\/\/([^\/:]+)\/?", "i"),
    WOT_APIKEY: "f8223315dac376ea9564afce9c98666ebd27b5c9",

	applied: {}, // store status of NCR for recent domains

    block: {},

	init : function() {
//		console.log("started");
		ncr.init_interceptor();
        ncr.nav_logger.init();
	},

	is_domain_served: function (domain) {
		return (domain.indexOf(".blogspot.") > 0 || domain.indexOf(".google.") > 0);
		// TODO: make more comprehensive check of served domains
	},

	is_ncr_allowed: function (domain) {

		// TODO: check whether user has disallowed NCR for the domain (return false in this case)
		if (domain == "aboutintranet.blogspot.com") return false;

		return true;
	},

	decide: function (details) {
		/* analyses http headers, target url and decides whether the NCR cookie needs to be set */

		console.log("GOT", details);
		var url = details.url,
			domain = ncr.get_domain(url),
			ncr_applied = false;

		// apply NCR to GET requests only and only for certain domains
		if (details.method === "GET" && ncr.is_domain_served(domain)) {

			var cookie_info = ncr.get_cookie_info(details.requestHeaders);

			// check whether the domain has user's preferences to disallow NCR
			if (ncr.is_ncr_allowed(domain)) {

				var is_ncr = ncr.is_ncr_set(cookie_info.cookies),
					new_header = "";

//				console.log("cookie_info", cookie_info, "is_NCR?", is_ncr);

				if (is_ncr === false) { // NCR cookie is absent
					if (cookie_info.header_index !== undefined) {
						// Some cookies are set, so we don't need to add artifical header
						new_header = ncr.enable_ncr(url, cookie_info, true);
						details.requestHeaders[cookie_info.header_index].value = new_header;
						ncr_applied = true;

					} else {
						// no cookies are set. Need to all http header
	//					console.log("NO COOKIES!");
						new_header = { name: "Cookie", value: "NCR=1" };
						details.requestHeaders.push(new_header);
						ncr.enable_ncr(url, cookie_info, false);
						ncr_applied = true;
					}
				} else {
					ncr_applied = (is_ncr == 1);
				}

			} else {
				var new_cookie_string = ncr.disable_ncr(url, cookie_info);
				if (cookie_info.header_index >= 0) { // if cookie header is present

					if (new_cookie_string) { // if cookie string is not empty after modification
						details.requestHeaders[cookie_info.header_index].value = new_cookie_string;
					} else {
						details.requestHeaders.splice(cookie_info.header_index, 1); // remove cookie header
					}

				}
			}

			if (!ncr.applied[domain]) {
				ncr.applied[domain] = {};
			}

			ncr.applied[domain][details.tabId] = {
				applied: ncr_applied
			}

		}

//		console.log("Final headers:", details.requestHeaders);

        ncr.nav_logger.add_track(details.tabId, url, details.type, details.timeStamp);

		return {requestHeaders: details.requestHeaders};
	},

    intercept: function (details) {
        if (ncr.block[details.url]) {
            delete ncr.block[details.url];  // clear temporary block registry
            ncr.ui.set_badge("BLK", "blocked", details.tabId);
            ncr.ui.set_icon(true, details.tabId);
            return {cancel: true};
        }
    },

	indicate: function (tabId, changeInfo, tab) {

		if (changeInfo.status == "complete") {
			var domain = ncr.get_domain(tab.url);

			if (ncr.applied[domain]) {
				if (ncr.applied[domain][tabId]) {
					var ncr_applied = ncr.applied[domain][tabId].applied;
					ncr.ui.set_icon(ncr_applied, tabId);
				}
			}
		}
	},

	get_cookie_info: function (headers) {
		/* parses cookies from string to object */
		for (var i = 0; i < headers.length; ++i) {

			if (headers[i].name === 'Cookie') {
				var cookies = (function () {
					var r = {};
					headers[i].value.split(';').map(function (v) {
						v = v.trim().split('=');
						r[v[0]] = v.splice(1).join('=')
					});
					return r;
				})();   // parse cookies string to object

				return {
					cookies: cookies,
					header_index: i,
					cookie_string: headers[i].value
				}
			}
		}
		return {};  // no cookies found
	},

	enable_ncr: function (url, cookie_info, append_cookie) {
		ncr.set_cookie(url, 1);  // for future requests

		// modify cookies header for current request
		if (append_cookie) {
			// simply append NCR cookie
			return cookie_info.cookie_string + "; NCR=1"

		} else {
			// otherwise create and replace cookies string to a new one
		}
	},

	disable_ncr: function (url, cookie_info) {
		ncr.set_cookie(url, false);

		// modify headers: remove NCR cookie
		var cookies = cookie_info.cookies,
			new_cookie_string = "";

		if (cookies && cookies['NCR']) {
			cookies['NCR'] = undefined;
		}

		for (var key in cookies) {
			if (cookies[key] !== undefined) {
				new_cookie_string += key + "=" + cookies[key] + ";";
			}
		}

		return new_cookie_string;
	},

	set_cookie: function(url, value) {
		if (value === 1 || value === 0) {

			chrome.cookies.set({
				url: url,
				name: "NCR",
				value: String(value),
				path: "/",
				httpOnly: true
			});

		} else {
			// other values to remove the cookie
			chrome.cookies.remove({
				name: "NCR",
				url: url
			});
		}
	},

	is_ncr_set: function (cookies) {
		// detects whether NCR cookie is set and return it's value (false, 0, 1)
		if (cookies) {
			// if cookie is set, we need it's validated numerical value
			if (cookies['NCR'] === "1") return 1;
			if (cookies['NCR'] === "0") return 0;
		}
		return false;
	},

	get_domain: function (url) {
		var reg_matches = ncr.re_domain.exec(url);
		if (reg_matches && reg_matches.length > 1) {
			return reg_matches[1];
		}
		return "";
	},

	init_interceptor: function () {
		var filter = {
			urls: ["<all_urls>"],   // no need to specify here particular urls since they are already defined in manifest permissions
			types: ["main_frame", "sub_frame"]  // interested only in main and sub frames
		};

		// intercept request to modify haders
		chrome.webRequest.onBeforeSendHeaders.addListener(ncr.decide, filter, ["blocking", "requestHeaders"]);

        // intecept all responses and check whether it is a server redirect to be able to block it
        chrome.webRequest.onBeforeRequest.addListener(ncr.intercept, filter, ["blocking"]);

		// listen when the request is completed
		chrome.tabs.onUpdated.addListener(ncr.indicate);

	},

	ui: {

        BADGETYPES: {
            redirlog: {
                color: "#ddd"
            },
            blocked: {
                color: "#703030"
            }
        },

		set_icon: function (is_ncr, tab_id) {

			var details = {
				tabId: tab_id,
				path: {
					"19": "/assets/icon_19_" + (is_ncr ? "red.png" : "blue.png"),
					"38": "/assets/icon_38_" + (is_ncr ? "red.png" : "blue.png")
				}
			};

			chrome.browserAction.setIcon(details);
		},

        set_badge: function (text, type, tab_id) {
            var color = "#d00", btype = {};
            if (ncr.ui.BADGETYPES[type]) {
                btype = ncr.ui.BADGETYPES[type];
                color = btype.color;
            }

            chrome.browserAction.setBadgeText({
                text: text,
                tabId: tab_id
            });
            chrome.browserAction.setBadgeBackgroundColor({
                color: color,
                tabId: tab_id
            });
        }
	},

    nav_logger: {
        redir_cache: {},    // storage for tracing requests per tab

        init: function() {
            chrome.webNavigation.onCommitted.addListener(ncr.nav_logger.on_committed);
            chrome.webNavigation.onCompleted.addListener(ncr.nav_logger.on_completed);
        },

        on_completed: function (details) {
            // prefetch reputation for all hostnames in the log
            ncr.nav_logger.indicate(details.tabId);
        },

        on_committed: function (details) {
//            console.log("on_committed", details);
            var _th = ncr.nav_logger,
                tabid = details.tabId,
                url = details.url,
                type = details.transitionType;

            // when the log should be reset
            // possible types: "link", "typed", "auto_bookmark", "auto_subframe", "manual_subframe", "generated", "start_page", "form_submit", "reload", "keyword", or "keyword_generated"
            var reset_types = ['link', 'typed', 'form_submit', 'reload'];
            var new_session = true;

            if (reset_types.indexOf(type) >= 0) {

                // lets see whether we should start new session or not
                if (details.transitionQualifiers) {
                    if (details.transitionQualifiers.indexOf("server_redirect") >= 0 ||
                        details.transitionQualifiers.indexOf("client_redirect")) {
                        new_session = false;   // don't start new session if was redirected
                    }
                }

                if (new_session) _th.start_session(tabid, false); // start new log session and clear previous one
                _th.add_track(tabid, url, type, details.timeStamp);
            }
        },

        start_session: function (tab_id, clear) {
            var _th = ncr.nav_logger;
            if (!_th.redir_cache[tab_id]) _th.redir_cache[tab_id] = []; // create an array if none is defined
            var log = _th.redir_cache[tab_id];
            log.push({type: "NEW"});    // start new "session"
        },

        add_track: function (tab_id, url, type, timestamp) {
            var _th = ncr.nav_logger;

            if (!_th.redir_cache[tab_id]) {
                _th.start_session(tab_id);
            }

            _th.redir_cache[tab_id].push({
                type: type,
                url: url,
                timestamp: timestamp
            });
        },

        order_by_time: function (log) {
            // sort
            if (!log) return [];
            var sorted_log = log.sort(function(a,b){
                return (a.timestamp > b.timestamp);
            });

            var unique_log = [], prev_url = "";

            for (var i = 0 ; i < sorted_log.length; i++) {
                if (prev_url == sorted_log[i].url) continue;
                unique_log.push(sorted_log[i]);
                prev_url = sorted_log[i].url;
            }

            return unique_log;
        },

        count_redirects: function (log) {
            var exclude = ['reload', 'NEW', 'typed'],   // these are to be excluded types from counting
                num = 0,    // number of redirects found
                prev_url = "";

            if (log && log.length > 0) {
                for (var i=0; i < log.length; i++) {
                    if (log[i].url == prev_url) continue;
                    if (exclude.indexOf(log[i].type) < 0) {
                        num++;
                    }
                    prev_url = log[i].url;
                }
            }

            return num;
        },

        get_visible_log: function (tab_id) {
            var _th = ncr.nav_logger;
            var log = _th.redir_cache[tab_id];
            log = _th.order_by_time(log);
            return log;
        },

        fetch_reputation: function (log, callback) {
            var domains = [];
            if (log && log.length) {
                for (var i in log) {
                    var d = ncr.get_domain(log[i].url);
                    if (d && domains.indexOf(d) < 0) {
                        domains.push(d);
                    }
                }
            }

//            console.log("domains?", domains);

            if (domains.length) {
                ncr.wot.request_reputation(domains, callback);
            } else {
                callback({});
            }
        },

        indicate: function (tab_id) {
            var _th = ncr.nav_logger,
                log = _th.get_visible_log(tab_id),
                redirects_number = _th.count_redirects(log);

            if (log) {
                // prefetch reputation
                _th.fetch_reputation(log, function (reputation_data) {
//                console.log("after fetch rep", reputation_data);
                    if (log && redirects_number > 0) {
                        ncr.ui.set_badge(String(redirects_number), "redirlog", tab_id);
                    } else {
                        ncr.ui.set_badge("","", tab_id);
                    }
                });
            }
        }
    },

    wot: {
        cache: {},      // internal cache for reputation data
        TTL: 3600 * 50, // time to live in cache. 50 minutes
        API_URL: "https://api.mywot.com/0.4/public_link_json2",

        reputationlevels: [
            { name: "rx", min: -2 },
            { name: "r0", min: -1 },
            { name: "r1", min:  0 },
            { name: "r2", min: 20 },
            { name: "r3", min: 40 },
            { name: "r4", min: 60 },
            { name: "r5", min: 80 }
        ],

        confidencelevels: [
            { name: "cx", min: -2 },
            { name: "c0", min: -1 },
            { name: "c1", min:  6 },
            { name: "c2", min: 12 },
            { name: "c3", min: 23 },
            { name: "c4", min: 34 },
            { name: "c5", min: 45 }
        ],

        apps: [0, 1, 2, 4],

        request_reputation: function (domains, callback) {
//            console.log("request_reputation()", domains);
            var _th = ncr.wot,
                domains = (typeof domains == "string") ? [domains] : domains,
                need_request = [],  // hostnames to ask about
                result = {};

            for (var i=0; i < domains.length; i++) {
                var d = domains[i],
                    cached = _th.get_cached(d);
                if (!cached) {
                    need_request.push(d);
                } else {
                    result[d] = cached;
                }
            }

            if (need_request.length == 0) {
                // woohoo! all reputation data is here, no need to ask WOT servers
                callback(result);
            } else {
                _th._request(need_request, callback);
            }

        },

        getlevel: function(levels, n)
        {
            for (var i = levels.length - 1; i >= 0; --i) {
                if (n >= levels[i].min) {
                    return levels[i];
                }
            }

            return levels[1];
        },

        /* "Private" methods of the object */

        _store: function (domain, data) {
            var _th = ncr.wot;
            _th.cache[domain] = {
                dt: Date.now(),
                data: data
            }
        },

        get_cached: function (domain) {
            var _th = ncr.wot,
                item = _th.cache[domain];

            if (item && (Date.now() - item.dt <= _th.TTL) && item.data) {
                return item.data;
            } else {
                _th._request([domain], function(){});
                return false;
            }
        },

        _process_response: function (data, callback) {
//            console.log("response", data);
            var _th = ncr.wot;
            if (data) {
                for (var d in data) {
                    var rep = data[d];

                    for (var app in rep) {
                        var r = rep[app][0],    // reputation value
                            c = rep[app][1];    // confidence

                        rep[app].rl = _th.getlevel(_th.reputationlevels, r).name;
                        rep[app].cl = _th.getlevel(_th.confidencelevels, c).name;
                    }

                    _th._store(d, rep);
                }
            }
            callback(data);
        },

        _request: function (domains, callback) {
            var _th = ncr.wot;

            $.getJSON(_th.API_URL,
                {
                    hosts: domains.join("/") + "/",
                    key: ncr.WOT_APIKEY
                },
                function(data) {
                    _th._process_response(data, callback);
                });
        }
    }
};

ncr.init();
