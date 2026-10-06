/*
 * Relay AI — GitHub Context Detection
 *
 * Shared by:
 * - GitHub content script
 * - Relay side panel
 *
 * The side panel cannot use its own window.location to identify
 * the GitHub page. It therefore asks Chrome for the active tab.
 */

(function (root) {
  "use strict";


  /* =========================================================
     RESERVED GITHUB ROUTES
     ========================================================= */

  const reserved = new Set([
    "about",
    "account",
    "apps",
    "business",
    "codespaces",
    "collections",
    "contact",
    "copilot",
    "customer-stories",
    "dashboard",
    "discussions",
    "enterprise",
    "events",
    "explore",
    "features",
    "issues",
    "join",
    "login",
    "logout",
    "marketplace",
    "new",
    "notifications",
    "organizations",
    "orgs",
    "pricing",
    "pulls",
    "readme",
    "search",
    "security",
    "sessions",
    "settings",
    "signup",
    "site",
    "sponsors",
    "topics",
    "trending",
    "users"
  ]);


  /* =========================================================
     HELPERS
     ========================================================= */

  function decode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }


  function number(value) {
    return (
      /^\d+$/.test(value || "") &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) > 0
    )
      ? Number(value)
      : null;
  }


  /* =========================================================
     PARSE GITHUB URL
     ========================================================= */

  function parse(url, hints = {}) {

    let location;

    try {
      location = new URL(url);
    } catch {
      return null;
    }


    /*
     * Only real GitHub URLs are accepted.
     */

    if (
      location.protocol !== "https:" ||
      location.hostname !== "github.com"
    ) {
      return null;
    }


    const parts = location.pathname
      .split("/")
      .filter(Boolean)
      .map(decode);


    const context = {
      host: location.hostname,
      owner: null,
      repository: null,
      url: location.href,

      pageType: "github",

      issueNumber: null,
      pullRequestNumber: null,

      branch: null
    };


    /* =======================================================
       GITHUB PROJECT
       ======================================================= */

    if (
      ["users", "orgs"].includes(parts[0]) &&
      parts[2] === "projects"
    ) {

      return {
        ...context,

        owner: parts[1] || null,

        pageType: "project"
      };
    }


    /* =======================================================
       GITHUB HOME
       ======================================================= */

    if (!parts.length) {
      return {
        ...context,

        pageType: "home"
      };
    }


    /* =======================================================
       RESERVED GITHUB ROUTE
       ======================================================= */

    if (
      reserved.has(
        parts[0].toLowerCase()
      )
    ) {
      return context;
    }


    /* =======================================================
       OWNER
       ======================================================= */

    if (
      !/^[a-z\d][a-z\d-]{0,38}$/i.test(
        parts[0]
      )
    ) {
      return context;
    }


    context.owner = parts[0];


    /* =======================================================
       PROFILE
       ======================================================= */

    if (!parts[1]) {

      return {
        ...context,

        pageType: "profile"
      };
    }


    /* =======================================================
       REPOSITORY
       ======================================================= */

    if (
      !/^[\w.-]+$/.test(parts[1]) ||
      [".", ".."].includes(parts[1])
    ) {
      return context;
    }


    context.repository = parts[1];


    /* =======================================================
       REPOSITORY ROUTE
       ======================================================= */

    const route = parts[2];


    const types = {
      issues: "issues",

      pulls: "pull-requests",

      pull: "pull-requests",

      tree: "code",

      blob: "file",

      blame: "file",

      projects: "project",

      actions: "actions",

      discussions: "discussions",

      settings: "settings",

      releases: "releases",

      tags: "tags",

      branches: "branches",

      wiki: "wiki",

      commit: "commit",

      commits: "commits",

      compare: "compare",

      security: "security",

      pulse: "insights",

      network: "insights"
    };


    context.pageType =
      route
        ? (
            types[route] ||
            "repository"
          )
        : "repository";


    /* =======================================================
       ISSUE
       ======================================================= */

    if (
      route === "issues" &&
      number(parts[3])
    ) {

      context.pageType = "issue";

      context.issueNumber =
        number(parts[3]);
    }


    /* =======================================================
       PULL REQUEST
       ======================================================= */

    if (
      route === "pull" &&
      number(parts[3])
    ) {

      context.pageType =
        "pull-request";

      context.pullRequestNumber =
        number(parts[3]);
    }


    /* =======================================================
       BRANCH
       ======================================================= */

    const branch =
      typeof hints.branch === "string"
        ? hints.branch.trim()
        : "";


    if (
      branch &&
      branch.length <= 255 &&
      hints.refType !== "tag" &&
      [
        "repository",
        "code",
        "file"
      ].includes(context.pageType)
    ) {

      const tail =
        parts.slice(3).join("/");


      if (
        !route ||
        tail === branch ||
        tail.startsWith(
          branch + "/"
        )
      ) {

        context.branch = branch;
      }
    }


    return context;
  }


  /* =========================================================
     READ GITHUB PAGE HINTS
     ========================================================= */

  const refCache =
    new WeakMap();


  function readHints(document) {

    if (!document) {
      return {};
    }


    /*
     * GitHub's code view publishes refInfo locally.
     *
     * We do NOT read:
     * - cookies
     * - session data
     * - authentication data
     * - issue bodies
     * - file contents
     */

    for (
      const script of document.querySelectorAll(
        'script[data-target="react-app.embeddedData"]'
      )
    ) {

      try {

        const text =
          script.textContent;


        let cached =
          refCache.get(script);


        if (
          !cached ||
          cached.text !== text
        ) {

          const payload =
            JSON.parse(text).payload;


          cached = {
            text,

            ref:
              payload?.codeViewRepoRoute?.refInfo ||
              payload?.refInfo
          };


          refCache.set(
            script,
            cached
          );
        }


        const ref =
          cached.ref;


        if (
          ref?.name &&
          ref.refType === "branch"
        ) {

          return {
            branch: ref.name,

            refType: "branch"
          };
        }


        if (
          ref?.refType === "tag"
        ) {

          return {
            refType: "tag"
          };
        }

      } catch {
        /*
         * Ignore partial navigation or unrelated
         * embedded React data.
         */
      }
    }


    return {};
  }


  /* =========================================================
     GET CURRENT GITHUB TAB
     
     IMPORTANT:
     This is used by the Chrome side panel.
     ========================================================= */

  async function getCurrentTab() {

    /*
     * The side panel can ask Chrome for the active tab.
     */

    if (
      typeof chrome === "undefined" ||
      !chrome.tabs ||
      !chrome.tabs.query
    ) {
      return null;
    }


    try {

      const tabs =
        await chrome.tabs.query({
          active: true,
          currentWindow: true
        });


      const tab =
        tabs?.[0];


      if (
        !tab ||
        !Number.isInteger(tab.id)
      ) {
        return null;
      }


      return tab;

    } catch {
      return null;
    }
  }


  /* =========================================================
     GET CURRENT GITHUB CONTEXT
     
     This is the important new function for panel.html.
     ========================================================= */

  async function getCurrentContext() {

    const tab =
      await getCurrentTab();


    if (!tab) {
      return null;
    }


    const url =
      typeof tab.url === "string"
        ? tab.url
        : "";


    /*
     * Make sure the active tab is actually GitHub.
     */

    if (!isGitHub(url)) {
      return null;
    }


    /*
     * Try to read branch information from the GitHub
     * content page when possible.
     */

    let hints = {};


    /*
     * The side panel itself cannot directly inspect the
     * GitHub DOM, so branch information may remain null.
     *
     * URL parsing still works correctly.
     */

    try {

      if (
        chrome.tabs &&
        chrome.tabs.sendMessage
      ) {

        const response =
          await chrome.tabs.sendMessage(
            tab.id,
            {
              type:
                "relay-ai-get-context-hints"
            }
          );


        if (
          response &&
          typeof response === "object"
        ) {

          hints = response;
        }
      }

    } catch {
      /*
       * Content script may not be ready.
       * This is okay — URL parsing still works.
       */
    }


    const context =
      parse(
        url,
        hints
      );


    if (!context) {
      return null;
    }


    return {
      ...context,

      tabId: tab.id,

      tabTitle:
        typeof tab.title === "string"
          ? tab.title
          : null
    };
  }


  /* =========================================================
     GITHUB CHECK
     ========================================================= */

  function isGitHub(url) {

    try {

      const location =
        new URL(url);


      return (
        location.protocol === "https:" &&
        location.hostname === "github.com"
      );

    } catch {

      return false;
    }
  }


  /* =========================================================
     HUMAN READABLE DESCRIPTION
     ========================================================= */

  function describe(context) {

    if (!context) {
      return "Open a GitHub page";
    }


    if (context.issueNumber) {

      return (
        "Issue #" +
        context.issueNumber
      );
    }


    if (
      context.pullRequestNumber
    ) {

      return (
        "Pull request #" +
        context.pullRequestNumber
      );
    }


    const labels = {

      home:
        "GitHub home",

      github:
        "GitHub page",

      profile:
        "Profile",

      repository:
        "Repository overview",

      issues:
        "Issues",

      "pull-requests":
        "Pull requests",

      code:
        "Code",

      file:
        "File",

      project:
        "Project",

      actions:
        "Actions",

      discussions:
        "Discussions",

      settings:
        "Settings",

      releases:
        "Releases",

      tags:
        "Tags",

      branches:
        "Branches",

      wiki:
        "Wiki",

      commit:
        "Commit",

      commits:
        "Commits",

      compare:
        "Compare",

      security:
        "Security",

      insights:
        "Insights"
    };


    return (
      labels[context.pageType] ||
      "GitHub page"
    );
  }


  /* =========================================================
     PUBLIC API
     ========================================================= */

  const api = Object.freeze({

    parse,

    readHints,

    describe,

    isGitHub,

    getCurrentTab,

    getCurrentContext
  });


  /* =========================================================
     EXPORT
     ========================================================= */

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {

    module.exports = api;

  } else {

    root.RelayAIContext = api;
  }

})(globalThis);