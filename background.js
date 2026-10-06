/*
 * Relay AI — Native Chrome Side Panel broker
 *
 * Relay is available ONLY on GitHub pages.
 *
 * No API calls.
 * No credentials.
 * No persistent user data.
 */

"use strict";


/* =========================================================
   GITHUB CHECK
   ========================================================= */

function isGitHub(url) {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com"
    );
  } catch {
    return false;
  }
}


/* =========================================================
   ENABLE / DISABLE RELAY FOR A SPECIFIC TAB
   ========================================================= */

function updateRelayForTab(tabId, url) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  const enabled = isGitHub(url);

  chrome.sidePanel.setOptions({
    tabId,
    path: "panel.html",
    enabled
  }).catch(() => {
    // Tab may have disappeared.
  });
}


/* =========================================================
   ACTIVE TAB
   ========================================================= */

async function updateActiveTab() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const tab = tabs[0];

    if (!tab || !Number.isInteger(tab.id)) {
      return;
    }

    updateRelayForTab(
      tab.id,
      tab.url || ""
    );

  } catch {
    // Ignore failures.
  }
}


/* =========================================================
   TAB SWITCH
   ========================================================= */

chrome.tabs.onActivated.addListener(async (activeInfo) => {

  if (!Number.isInteger(activeInfo?.tabId)) {
    return;
  }

  try {
    const tab = await chrome.tabs.get(
      activeInfo.tabId
    );

    updateRelayForTab(
      activeInfo.tabId,
      tab.url || ""
    );

  } catch {
    // Tab may have closed.
  }
});


/* =========================================================
   URL / NAVIGATION CHANGE
   ========================================================= */

chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {

    /*
     * React to:
     *
     * 1. URL changes
     * 2. Page finishing loading
     */

    if (
      changeInfo.url === undefined &&
      changeInfo.status !== "complete"
    ) {
      return;
    }

    updateRelayForTab(
      tabId,
      tab?.url ||
      changeInfo.url ||
      ""
    );
  }
);


/* =========================================================
   EXTENSION STARTUP
   ========================================================= */

chrome.runtime.onStartup.addListener(() => {
  updateActiveTab();
});


/* =========================================================
   EXTENSION INSTALLED / UPDATED
   ========================================================= */

chrome.runtime.onInstalled.addListener(() => {
  updateActiveTab();
});


/* =========================================================
   OPEN RELAY FROM GITHUB PAGE
   ========================================================= */

chrome.runtime.onMessage.addListener(
  (message, sender, respond) => {

    if (
      message?.type !==
      "relay-ai-open-panel"
    ) {
      return false;
    }


    /* ---------------------------------------------
       SECURITY VALIDATION
       --------------------------------------------- */

    if (
      sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 ||
      !Number.isInteger(sender.tab?.id) ||
      !isGitHub(sender.url)
    ) {

      respond({
        ok: false,
        error:
          "Open Relay from a GitHub page."
      });

      return false;
    }


    const tabId = sender.tab.id;


    /* ---------------------------------------------
       IMPORTANT
       
       DO NOT await anything before open().
       
       Chrome requires open() to happen directly
       from the user's click gesture.
       --------------------------------------------- */

    try {

      chrome.sidePanel.open({
        tabId
      }).then(() => {

        /*
         * Configure the panel AFTER it has opened.
         */

        return chrome.sidePanel.setOptions({
          tabId,
          path: "panel.html",
          enabled: true
        });

      }).then(() => {

        respond({
          ok: true
        });

      }).catch(() => {

        respond({
          ok: false,
          error:
            "Chrome could not open Relay. " +
            "Try reloading this GitHub tab."
        });

      });

    } catch {

      respond({
        ok: false,
        error:
          "Relay requires desktop Chrome 116 or newer. " +
          "Reload the extension and this tab."
      });
    }


    /*
     * Keep response channel alive.
     */

    return true;
  }
);


/* =========================================================
   EXTENSION TOOLBAR ICON
   ========================================================= */

chrome.action.onClicked.addListener((tab) => {

  if (!Number.isInteger(tab?.id)) {
    return;
  }


  /* ---------------------------------------------
     OUTSIDE GITHUB
     --------------------------------------------- */

  if (!isGitHub(tab.url)) {

    updateRelayForTab(
      tab.id,
      tab.url || ""
    );

    chrome.action.setBadgeText({
      tabId: tab.id,
      text: "!"
    });

    chrome.action.setTitle({
      tabId: tab.id,
      title:
        "Relay is available only on GitHub"
    });

    return;
  }


  /* ---------------------------------------------
     GITHUB
     
     OPEN FIRST.
     DO NOT await setOptions().
     --------------------------------------------- */

  try {

    chrome.sidePanel.open({
      tabId: tab.id
    }).then(() => {

      /*
       * Configure this specific GitHub tab
       * after Chrome accepts the user gesture.
       */

      return chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "panel.html",
        enabled: true
      });

    }).then(() => {

      /*
       * Clear previous error state.
       */

      chrome.action.setBadgeText({
        tabId: tab.id,
        text: ""
      });

      chrome.action.setTitle({
        tabId: tab.id,
        title: "Open Relay AI"
      });

    }).catch(() => {

      chrome.action.setBadgeText({
        tabId: tab.id,
        text: "!"
      });

      chrome.action.setTitle({
        tabId: tab.id,
        title:
          "Relay could not open. Reload the GitHub tab."
      });

    });

  } catch {

    chrome.action.setBadgeText({
      tabId: tab.id,
      text: "!"
    });

    chrome.action.setTitle({
      tabId: tab.id,
      title:
        "Relay could not open. Reload the GitHub tab."
    });
  }
});


/* =========================================================
   INITIAL STATE
   ========================================================= */

updateActiveTab();