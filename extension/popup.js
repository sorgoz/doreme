var popup = {

	bg: null,
    current_tab: null,

	init: function() {

		popup.bg = chrome.extension.getBackgroundPage();

		popup.get_active_tab(function(tab) {
            popup.bg.console.log("cur tab", tab);
            popup.current_tab = tab;

            var url = tab.url;
            popup.replace_placeholders(url);
            popup.show_redirection_log(tab.id);

		});

        $("#log").on("click", ".log-item-text", function(e){
            $(this).closest(".log-item").find(".log-item-full").toggle();
        });

	},

    replace_placeholders: function (url) {
        var domain = popup.bg.ncr.get_domain(url),
            encoded_url = encodeURI(url);

        $("a").each(function(i){
            var href = $(this).attr("href");
            href = href.replace("{HOST}", domain).replace("{URL}", encoded_url);
            $(this).attr("href", href);
        });
    },

    show_redirection_log: function (tab_id) {
        var log = popup.bg.ncr.nav_logger.get_visible_log(tab_id),
            prev_url = "";
        var $_log = $("#log");

        if (log && log.length) {
            for(var i=0; i < log.length; i++) {
                var item = log[i];
                if (item.type == "NEW" || item.url == prev_url) continue;   // skip session begin marker
                var $_item = popup._make_logitem(item);
                $_log.append($_item);
            }

        } else {
            $_log.append("<li class='log-item'><div class='log-item-text'>No redirects found.</div></li>");
        }
    },

    _make_logitem: function (item) {
        var url = item.url || "NOT A LINK?",
            host = popup.bg.ncr.get_domain(url) || "",
            cached_rep = popup.bg.ncr.wot.get_cached(host);

        var url_text = url.replace(host, '<span class="hostname" host="' + host + '">'+host+'</span>');

        var s =
        '<li class="log-item">' +
            '<div class="log-item-text">'+ url_text +'</div>' +
            '<div class="logitem-buttons">' +
                '<div class="logitem-button">' +
                    '<a href="http://www.mywot.com/s/' + host + '" class="wot-scard" target="_blank">WOT</a>' +
                '</div>' +
                '<div class="logitem-button">' +
                    '<a href="'+ url +'" class="new-tab" target="_blank">tab</a>' +
                '</div>' +
            '</div>' +
            '<div class="log-item-full">' + url + '</div>' +
        '</li>';

        var $_item = $(s);
        $_item.addClass(item.type);

        if (cached_rep) {
            var tr = cached_rep[0],
                trust_level = tr ? tr.rl : "r0";
            $_item.addClass(trust_level);
        }

        return $_item;
    },

	get_active_tab: function (callback) {
        chrome.tabs.query({ active: true, currentWindow: true, windowType: "normal" }, function(tabs){
            if(tabs && tabs.length > 0) {
                callback(tabs[0]);
            }
        });
	}


};

$(document).ready(popup.init);
