
var ncr = {

	re_domain: new RegExp("^https?:\/\/([^\/]+)\/?", "i"),

	applied: {}, // store status of NCR for recent domains

	init : function() {
		console.log("started");
		ncr.init_interceptor();
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

				console.log("cookie_info", cookie_info, "is_NCR?", is_ncr);

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

		console.log("Final headers:", details.requestHeaders);

		return {requestHeaders: details.requestHeaders};
	},

	indicate: function (tabId, changeInfo, tab) {

		if (changeInfo.status == "complete") {
			console.log(arguments);

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
		if (reg_matches.length > 1) {
			return reg_matches[1];
		}
		return "";
	},

	init_interceptor: function () {
		var filter = {
			urls: ["<all_urls>"],   // no need to specify here particular urls since they are already defined in manifest permissions
			types: ["main_frame"]  // interested only in main and sun frames
		};

		// intercept request to modify haders
		chrome.webRequest.onBeforeSendHeaders.addListener(ncr.decide, filter, ["blocking", "requestHeaders"]);

		// listen when the request is completed
		chrome.tabs.onUpdated.addListener(ncr.indicate);

	},

	ui: {
		set_icon: function (is_ncr, tab_id) {

			var details = {
				tabId: tab_id,
				path: {
					"19": "/assets/icon_19_" + (is_ncr ? "red.png" : "blue.png"),
					"38": "/assets/icon_38_" + (is_ncr ? "red.png" : "blue.png")
				}
			};

			chrome.pageAction.setIcon(details);
			chrome.pageAction.show(tab_id);
		}//,

//		remove_icon: function (tab_id) {
//			chrome.pageAction.hide(tab_id);
//		}
	}
};

ncr.init();
