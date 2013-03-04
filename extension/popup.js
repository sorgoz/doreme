var popup = {

	bg: null,

	init: function() {

		popup.bg = chrome.extension.getBackgroundPage();

		popup.get_active_tab(function(tab) {

		});

	},

	get_active_tab: function (callback) {

	}


};

popup.init();
