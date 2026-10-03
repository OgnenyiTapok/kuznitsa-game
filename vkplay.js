/* =========================================================
   vkplay.js — интеграция с VK Play JS API для браузерных игр.
   Основано на официальной схеме JS API / iframeApi.
   Если игра открыта вне VK Play, используется безопасный fallback.
   ========================================================= */
(function (PMG) {
  "use strict";

  var externalApi = null;
  var initPromise = null;
  var initialized = false;
  var gmrid = "";
  var loadedScript = false;
  var savedCallbacks = {};

  function normalizeLang(value) {
    if (!value) return "ru";
    var lang = String(value).toLowerCase().replace("_", "-").split("-")[0];
    return lang || "ru";
  }

  function detectGMRID() {
    if (window.VKPLAY_GMRID) return String(window.VKPLAY_GMRID).trim();

    try {
      var meta = document.querySelector('meta[name="vkplay-gmrid"]');
      if (meta && meta.content) return String(meta.content).trim();
    } catch (e) {}

    var sources = [];
    try { sources.push(window.location.href); } catch (e) {}
    try { if (document.referrer) sources.push(document.referrer); } catch (e) {}

    for (var i = 0; i < sources.length; i++) {
      var m = sources[i].match(/(?:^|\/)app\/([A-Za-z0-9_-]+)/i);
      if (m && m[1]) return m[1];
    }

    try {
      var qs = new URLSearchParams(window.location.search || "");
      var fromQuery = qs.get("gmrid") || qs.get("appid") || qs.get("app_id");
      if (fromQuery) return String(fromQuery).trim();
    } catch (e) {}

    return "";
  }

  function getLocaleFromLaunch() {
    try {
      var qs = new URLSearchParams(window.location.search || "");
      return normalizeLang(
        qs.get("lang") ||
        qs.get("locale") ||
        qs.get("language") ||
        qs.get("game_locale") ||
        ""
      );
    } catch (e) {
      return "ru";
    }
  }

  function loadCoreScript(id) {
    if (loadedScript) return Promise.resolve(true);
    if (!id) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var src = "//store.my.games/app/" + encodeURIComponent(id) + "/static/mailru.core.js";
      var script = document.createElement("script");
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(false);
      }, 8000);

      script.async = true;
      script.src = src;
      script.onload = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        loadedScript = true;
        resolve(true);
      };
      script.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function makeCallbacks() {
    savedCallbacks = {
      appid: gmrid,
      getLoginStatusCallback: function (status) {
        if (typeof PMG._vkplayLoginStatusCallback === "function") PMG._vkplayLoginStatusCallback(status);
      },
      userInfoCallback: function (info) {
        if (typeof PMG._vkplayUserInfoCallback === "function") PMG._vkplayUserInfoCallback(info);
      },
      userProfileCallback: function (profile) {
        if (typeof PMG._vkplayUserProfileCallback === "function") PMG._vkplayUserProfileCallback(profile);
      },
      registerUserCallback: function (info) {
        if (typeof PMG._vkplayRegisterCallback === "function") PMG._vkplayRegisterCallback(info);
      },
      paymentFrameItem: function (object) {
        if (typeof PMG._vkplayPaymentFrameItemCallback === "function") PMG._vkplayPaymentFrameItemCallback(object);
      },
      paymentFrameUrlCallback: function (url) {
        if (typeof PMG._vkplayPaymentFrameUrlCallback === "function") PMG._vkplayPaymentFrameUrlCallback(url);
      },
      getAuthTokenCallback: function (token) {
        if (typeof PMG._vkplayAuthTokenCallback === "function") PMG._vkplayAuthTokenCallback(token);
      },
      paymentReceivedCallback: function (data) {
        if (typeof PMG._vkplayPaymentReceivedCallback === "function") PMG._vkplayPaymentReceivedCallback(data);
      },
      paymentWindowClosedCallback: function () {
        if (typeof PMG._vkplayPaymentClosedCallback === "function") PMG._vkplayPaymentClosedCallback();
      },
      userConfirmCallback: function () {
        if (typeof PMG._vkplayUserConfirmCallback === "function") PMG._vkplayUserConfirmCallback();
      },
      getGameInventoryItems: function (items) {
        if (typeof PMG._vkplayInventoryCallback === "function") PMG._vkplayInventoryCallback(items);
      }
    };
    return savedCallbacks;
  }

  function handshake() {
    if (typeof window.iframeApi !== "function") return Promise.resolve(false);

    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(false);
      }, 8000);

      function fail(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        console.warn("VK Play JS API init error:", err);
        resolve(false);
      }

      function connected(api) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        externalApi = api || null;
        resolve(!!externalApi);
      }

      try {
        Promise.resolve(window.iframeApi(makeCallbacks())).then(connected, fail);
      } catch (e) {
        fail(e);
      }
    });
  }

  function init() {
    if (initPromise) return initPromise;

    initPromise = Promise.resolve().then(function () {
      gmrid = detectGMRID();
      var locale = getLocaleFromLaunch();

      PMG.i18n = {
        requestedLang: locale,
        lang: locale,
        isSupported: locale === "ru" || locale === "en"
      };

      if (!gmrid) {
        console.info("VK Play GMRID is not set. Using local/off-platform fallback.");
        return false;
      }

      return loadCoreScript(gmrid).then(function (loaded) {
        if (!loaded) return false;
        return handshake();
      }).then(function (ok) {
        initialized = !!ok;
        if (initialized) {
          // A platform-provided locale has priority over a browser locale.
          try {
            if (externalApi && typeof externalApi.getLoginStatus === "function") {
              externalApi.getLoginStatus();
            }
          } catch (e) {}
        }
        return initialized;
      });
    }).catch(function (error) {
      console.warn("VK Play init error:", error);
      externalApi = null;
      initialized = false;
      return false;
    });

    return initPromise;
  }

  function getSDK() {
    return externalApi;
  }

  function getGMRID() {
    return gmrid;
  }

  function getLoginStatus() {
    return new Promise(function (resolve) {
      if (!externalApi || typeof externalApi.getLoginStatus !== "function") {
        resolve(null);
        return;
      }
      PMG._vkplayLoginStatusCallback = function (status) {
        PMG._vkplayLoginStatusCallback = null;
        resolve(status || null);
      };
      try { externalApi.getLoginStatus(); } catch (e) { PMG._vkplayLoginStatusCallback = null; resolve(null); }
    });
  }

  function getUserInfo() {
    return new Promise(function (resolve) {
      if (!externalApi || typeof externalApi.userInfo !== "function") {
        resolve(null);
        return;
      }
      PMG._vkplayUserInfoCallback = function (info) {
        PMG._vkplayUserInfoCallback = null;
        resolve(info || null);
      };
      try { externalApi.userInfo(); } catch (e) { PMG._vkplayUserInfoCallback = null; resolve(null); }
    });
  }

  function getUserProfile() {
    return new Promise(function (resolve) {
      if (!externalApi || typeof externalApi.userProfile !== "function") {
        resolve(null);
        return;
      }
      PMG._vkplayUserProfileCallback = function (profile) {
        PMG._vkplayUserProfileCallback = null;
        resolve(profile || null);
      };
      try { externalApi.userProfile(); } catch (e) { PMG._vkplayUserProfileCallback = null; resolve(null); }
    });
  }

  function getAuthToken() {
    return new Promise(function (resolve) {
      if (!externalApi || typeof externalApi.getAuthToken !== "function") {
        resolve(null);
        return;
      }
      PMG._vkplayAuthTokenCallback = function (token) {
        PMG._vkplayAuthTokenCallback = null;
        resolve(token || null);
      };
      try { externalApi.getAuthToken(); } catch (e) { PMG._vkplayAuthTokenCallback = null; resolve(null); }
    });
  }

  // VK Play HTML5 games do not use the LoadingAPI/GameplayAPI contract.
  // Keep these methods as no-ops so the game lifecycle remains platform-safe.
  function gameReady() {}
  function gameplayStart() {}
  function gameplayStop() {}

  PMG.vkplay = {
    init: init,
    getSDK: getSDK,
    getGMRID: getGMRID,
    getLoginStatus: getLoginStatus,
    getUserInfo: getUserInfo,
    getUserProfile: getUserProfile,
    getAuthToken: getAuthToken,
    gameReady: gameReady,
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    isInitialized: function () { return initialized; }
  };
})(window.PMG = window.PMG || {});
