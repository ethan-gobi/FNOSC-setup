(function () {
    var STORAGE_KEY = 'fnosc_analytics_v1';
    var MAX_RECENT_EVENTS = 500;

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultState();
            var parsed = JSON.parse(raw);
            return Object.assign(defaultState(), parsed);
        } catch (e) {
            return defaultState();
        }
    }

    function defaultState() {
        return {
            firstSeen: null,
            pageViews: {},
            linkClicks: {},
            supportGroupClicks: {},
            sectionClicks: {},
            recent: [],
            scrollDepth: {},
            timeOnPage: {},
            sessions: 0
        };
    }

    function save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {}
    }

    var state = load();
    if (!state.firstSeen) state.firstSeen = Date.now();

    var pagePath = (location.pathname.split('/').pop() || 'home.html').toLowerCase();
    if (!pagePath.endsWith('.html')) pagePath = pagePath || 'home.html';

    state.pageViews[pagePath] = (state.pageViews[pagePath] || 0) + 1;

    if (!sessionStorage.getItem('fnosc_session')) {
        sessionStorage.setItem('fnosc_session', '1');
        state.sessions = (state.sessions || 0) + 1;
    }
    save(state);

    function vercelEvent(name, data) {
        try {
            if (typeof window.va === 'function') {
                window.va('event', { name: name, data: data || {} });
            }
        } catch (e) {}
    }

    vercelEvent('pageview', { page: pagePath });

    function classifyHref(href) {
        if (!href) return 'unknown';
        if (href.indexOf('tel:') === 0) return 'tel';
        if (href.indexOf('sms:') === 0) return 'sms';
        if (href.indexOf('mailto:') === 0) return 'mailto';
        if (/^https?:/i.test(href)) {
            try {
                var u = new URL(href);
                if (u.hostname === location.hostname) return 'internal';
                return 'external';
            } catch (e) { return 'external'; }
        }
        if (href.indexOf('.html') !== -1) return 'internal';
        return 'other';
    }

    function findSection(el) {
        var node = el;
        while (node && node !== document.body) {
            if (node.tagName === 'SECTION') {
                var h = node.querySelector('h2, h3, h1');
                if (h) return h.textContent.trim();
            }
            node = node.parentNode;
        }
        return '';
    }

    function pushRecent(entry) {
        state.recent.push(entry);
        if (state.recent.length > MAX_RECENT_EVENTS) {
            state.recent.splice(0, state.recent.length - MAX_RECENT_EVENTS);
        }
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;

        var href = a.getAttribute('href') || '';
        var text = (a.textContent || '').trim().slice(0, 120);
        var kind = classifyHref(href);
        var section = findSection(a);
        var groupId = a.getAttribute('data-group-id') || '';
        var groupName = a.getAttribute('data-group-name') || '';
        var groupType = a.getAttribute('data-group-type') || '';

        var key = kind + '|' + href + '|' + text;
        if (!state.linkClicks[key]) {
            state.linkClicks[key] = {
                href: href,
                text: text,
                kind: kind,
                section: section,
                page: pagePath,
                count: 0
            };
        }
        state.linkClicks[key].count += 1;
        state.linkClicks[key].lastClicked = Date.now();

        if (section) {
            state.sectionClicks[section] = (state.sectionClicks[section] || 0) + 1;
        }

        if (groupId || groupName) {
            var gk = groupId || groupName;
            if (!state.supportGroupClicks[gk]) {
                state.supportGroupClicks[gk] = {
                    id: groupId,
                    name: groupName,
                    type: groupType,
                    calls: 0,
                    websiteClicks: 0,
                    total: 0
                };
            }
            var g = state.supportGroupClicks[gk];
            g.total += 1;
            if (kind === 'tel') g.calls += 1;
            if (kind === 'external') g.websiteClicks += 1;
        }

        pushRecent({
            ts: Date.now(),
            page: pagePath,
            kind: kind,
            href: href,
            text: text,
            section: section,
            groupId: groupId,
            groupName: groupName
        });

        save(state);

        vercelEvent('link_click', {
            page: pagePath,
            kind: kind,
            href: href,
            text: text,
            section: section,
            group_id: groupId,
            group_name: groupName,
            group_type: groupType
        });
    }, true);

    var maxDepth = 0;
    function recordScroll() {
        var h = document.documentElement;
        var scrolled = (h.scrollTop + window.innerHeight) / h.scrollHeight;
        var pct = Math.min(100, Math.round(scrolled * 100));
        if (pct > maxDepth) maxDepth = pct;
    }
    window.addEventListener('scroll', recordScroll, { passive: true });

    var startTime = Date.now();
    function flushTiming() {
        var delta = Date.now() - startTime;
        startTime = Date.now();
        if (!state.timeOnPage[pagePath]) state.timeOnPage[pagePath] = 0;
        state.timeOnPage[pagePath] += delta;

        if (!state.scrollDepth[pagePath] || maxDepth > state.scrollDepth[pagePath]) {
            state.scrollDepth[pagePath] = maxDepth;
        }
        save(state);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushTiming();
    });
    window.addEventListener('pagehide', flushTiming);
    window.addEventListener('beforeunload', flushTiming);

    window.FNOSC_Analytics = {
        get: function () { return load(); },
        reset: function () {
            localStorage.removeItem(STORAGE_KEY);
            state = defaultState();
            state.firstSeen = Date.now();
            save(state);
        },
        track: function (name, data) {
            pushRecent({ ts: Date.now(), page: pagePath, kind: 'custom', name: name, data: data || {} });
            save(state);
            vercelEvent(name, Object.assign({ page: pagePath }, data || {}));
        }
    };
})();
