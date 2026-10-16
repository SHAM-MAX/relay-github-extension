/*
 * Relay AI — GitHub floating panel launcher
 *
 * Relay runs directly inside github.com.
 *
 * No Chrome Side Panel.
 * No API calls from this content script.
 * No credentials.
 * No persistent user data.
 */

(() => {
  "use strict";

  /* =========================================================
     PREVENT DUPLICATE START
     ========================================================= */

  if (globalThis.__relayAIContentStarted) {
    return;
  }

  globalThis.__relayAIContentStarted = true;


  /* =========================================================
     STATE
     ========================================================= */

  let lastSnapshot = "";

  let lastUrl =
    location.href;

  let scheduled =
    false;

  let stopped =
    false;

  let errorTimer;


  /* =========================================================
     GITHUB CONTEXT
     ========================================================= */

  function context() {

    try {

      return RelayAIContext.parse(
        location.href,
        RelayAIContext.readHints(document)
      );

    } catch {

      return null;
    }
  }


  /* =========================================================
     AUTH / OAUTH PAGE CHECK
     ========================================================= */

  function isAuthPage() {

    if (
      typeof RelayAIContext !== "undefined" &&
      typeof RelayAIContext.isAuthPage === "function"
    ) {
      return RelayAIContext.isAuthPage(location.href);
    }

    try {
      const loc = new URL(location.href);
      if (loc.hostname !== "github.com") return false;
      const parts = loc.pathname.split("/").filter(Boolean).map(p => p.toLowerCase());
      if (!parts.length) return false;
      const first = parts[0];
      return first === "login" || first === "session" || first === "sessions" || first === "oauth";
    } catch {
      return false;
    }
  }


  /* =========================================================
     ERROR MESSAGE
     ========================================================= */

  function showError(message) {

    const box =
      document.getElementById(
        "relay-ai-launcher-error"
      );

    if (!box) {
      return;
    }

    box.textContent =
      message;

    box.hidden =
      false;

    clearTimeout(
      errorTimer
    );

    errorTimer =
      setTimeout(
        () => {
          box.hidden = true;
        },
        9000
      );
  }


  /* =========================================================
     LAUNCHER VISIBILITY
     ========================================================= */

  function hideLauncher() {

    const launcher =
      document.getElementById(
        "relay-ai-launcher"
      );

    if (!launcher) {
      return;
    }

    launcher.style.display =
      "none";
  }


  function showLauncher() {

    const launcher =
      document.getElementById(
        "relay-ai-launcher"
      );

    if (!launcher) {
      return;
    }

    launcher.style.display =
      "flex";
  }


  /* =========================================================
     LOAD PANEL
     ========================================================= */

  /* =========================================================
     LOAD LARGE INSET FLOATING RELAY PANEL
     ========================================================= */

  function openRelay() {

    if (isAuthPage()) {
      return;
    }

    /*
     * If Relay is already open,
     * simply make sure it is visible and keep the launcher hidden.
     */

    const existing =
      document.getElementById(
        "relay-ai-floating-panel"
      );

    if (existing) {

      existing.classList.remove(
        "relay-ai-floating-panel-hidden"
      );

      existing.classList.add(
        "relay-ai-floating-panel-visible"
      );

      hideLauncher();

      return;
    }


    /*
     * Hide the launcher immediately
     * before creating the panel.
     */

    hideLauncher();


    /*
     * Create the large inset floating Relay shell.
     */

    const panel =
      document.createElement(
        "section"
      );

    panel.id =
      "relay-ai-floating-panel";

    panel.className =
      "relay-ai-floating-panel relay-ai-floating-panel-visible";

    panel.setAttribute(
      "aria-label",
      "Relay AI GitHub Assistant"
    );


    /*
     * Create iframe loading existing panel.html.
     */

    const frame =
      document.createElement(
        "iframe"
      );

    frame.id =
      "relay-ai-floating-frame";

    frame.className =
      "relay-ai-floating-frame";

    frame.title =
      "Relay AI — GitHub Assistant";

    frame.src =
      chrome.runtime.getURL(
        "panel.html"
      );

    frame.setAttribute(
      "allow",
      "clipboard-read; clipboard-write"
    );


    /*
     * Outer header controls container.
     */

    const controls =
      document.createElement(
        "div"
      );

    controls.id =
      "relay-ai-floating-controls";

    controls.className =
      "relay-ai-floating-controls";


    /*
     * Minimize button (collapses back to launcher).
     */

    const minimize =
      document.createElement(
        "button"
      );

    minimize.type =
      "button";

    minimize.id =
      "relay-ai-floating-minimize";

    minimize.className =
      "relay-ai-floating-minimize";

    minimize.textContent =
      "—";

    minimize.setAttribute(
      "aria-label",
      "Minimize Relay"
    );

    minimize.title =
      "Minimize Relay";

    minimize.addEventListener(
      "click",
      () => {
        panel.classList.remove(
          "relay-ai-floating-panel-visible"
        );

        panel.classList.add(
          "relay-ai-floating-panel-hidden"
        );

        setTimeout(
          () => {
            panel.remove();
            showLauncher();
          },
          180
        );
      }
    );


    /*
     * Close button (dismisses Relay and restores launcher).
     */

    const close =
      document.createElement(
        "button"
      );

    close.type =
      "button";

    close.id =
      "relay-ai-floating-close";

    close.className =
      "relay-ai-floating-close";

    close.textContent =
      "×";

    close.setAttribute(
      "aria-label",
      "Close Relay"
    );

    close.title =
      "Close Relay";

    close.addEventListener(
      "click",
      () => {

        panel.classList.remove(
          "relay-ai-floating-panel-visible"
        );

        panel.classList.add(
          "relay-ai-floating-panel-hidden"
        );

        setTimeout(
          () => {

            panel.remove();

            /*
             * Bring the launcher back
             * after the panel is removed.
             */

            showLauncher();

          },
          180
        );
      }
    );


    /*
     * Build controls & panel.
     */

    controls.append(
      minimize,
      close
    );

    panel.append(
      frame,
      controls
    );

    document.documentElement.append(
      panel
    );


    /*
     * Send context after iframe loads.
     */

    frame.addEventListener(
      "load",
      () => {
        sendContextToPanel(
          frame
        );
      }
    );
  }


  /* =========================================================
     FULL-PAGE WORKSPACE IN-PAGE OVERLAY
     ========================================================= */

  function openWorkspaceOverlay() {
    if (isAuthPage()) {
      return;
    }

    const floatingPanel = document.getElementById("relay-ai-floating-panel");
    if (floatingPanel) {
      floatingPanel.classList.remove("relay-ai-floating-panel-visible");
      floatingPanel.classList.add("relay-ai-floating-panel-hidden");
      floatingPanel.style.display = "none";
    }

    hideLauncher();

    let overlay = document.getElementById("relay-ai-workspace-overlay");
    if (overlay) {
      overlay.classList.remove("relay-ai-workspace-hidden");
      overlay.classList.add("relay-ai-workspace-visible");
      const frame = document.getElementById("relay-ai-workspace-frame");
      if (frame) {
        sendContextToWorkspace(frame);
      }
      return;
    }

    overlay = document.createElement("section");
    overlay.id = "relay-ai-workspace-overlay";
    overlay.className = "relay-ai-workspace-overlay relay-ai-workspace-visible";
    overlay.setAttribute("aria-label", "Relay AI PM Workspace");

    const frame = document.createElement("iframe");
    frame.id = "relay-ai-workspace-frame";
    frame.className = "relay-ai-workspace-frame";
    frame.title = "Relay AI — AI Project Management Workspace";

    const ctx = context();
    const owner = ctx?.owner ? encodeURIComponent(ctx.owner) : "";
    const repo = ctx?.repository ? encodeURIComponent(ctx.repository) : "";
    const query = owner && repo ? `?owner=${owner}&repo=${repo}` : "";

    frame.src = chrome.runtime.getURL(`dashboard.html${query}`);
    frame.setAttribute("allow", "clipboard-read; clipboard-write");

    overlay.append(frame);
    document.documentElement.append(overlay);

    frame.addEventListener("load", () => {
      sendContextToWorkspace(frame);
    });
  }

  function minimizeWorkspaceOverlay() {
    const overlay = document.getElementById("relay-ai-workspace-overlay");
    if (overlay) {
      overlay.classList.remove("relay-ai-workspace-visible");
      overlay.classList.add("relay-ai-workspace-hidden");
    }

    const floatingPanel = document.getElementById("relay-ai-floating-panel");
    if (floatingPanel) {
      floatingPanel.style.display = "";
      floatingPanel.classList.remove("relay-ai-floating-panel-hidden");
      floatingPanel.classList.add("relay-ai-floating-panel-visible");
      hideLauncher();
    } else {
      openRelay();
    }
  }

  function closeWorkspaceOverlay() {
    const overlay = document.getElementById("relay-ai-workspace-overlay");
    if (overlay) {
      overlay.remove();
    }

    const floatingPanel = document.getElementById("relay-ai-floating-panel");
    if (floatingPanel) {
      floatingPanel.style.display = "";
      floatingPanel.classList.remove("relay-ai-floating-panel-hidden");
      floatingPanel.classList.add("relay-ai-floating-panel-visible");
      hideLauncher();
    } else {
      showLauncher();
    }
  }

  function sendContextToWorkspace(frame = null) {
    const target = frame || document.getElementById("relay-ai-workspace-frame");
    if (!target) return;
    try {
      target.contentWindow.postMessage(
        {
          type: "relay-ai-host-context",
          context: context()
        },
        "*"
      );
    } catch {
      // Ignore failures
    }
  }


  /* =========================================================
     SEND CONTEXT TO PANEL
     ========================================================= */

  function sendContextToPanel(
    frame = null
  ) {

    const target =
      frame ||
      document.getElementById(
        "relay-ai-floating-frame"
      );

    if (!target) {
      return;
    }

    try {

      target.contentWindow.postMessage(
        {
          type:
            "relay-ai-host-context",

          context:
            context()
        },
        "*"
      );

    } catch {
      // Ignore iframe messaging failures.
    }
  }


  /* =========================================================
     LAUNCHER BUTTON
     ========================================================= */

  function ensureButton() {

    if (
      !document.body ||
      isAuthPage() ||
      document.getElementById(
        "relay-ai-launcher"
      )
    ) {
      return;
    }


    const container =
      document.createElement(
        "div"
      );

    container.id =
      "relay-ai-launcher";


    /*
     * Error box.
     */

    const error =
      document.createElement(
        "div"
      );

    error.id =
      "relay-ai-launcher-error";

    error.setAttribute(
      "role",
      "alert"
    );

    error.hidden =
      true;


    /*
     * Relay button.
     */

    const button =
      document.createElement(
        "button"
      );

    button.id =
      "relay-ai-launcher-button";

    button.type =
      "button";

    button.textContent =
      "✦ Relay";

    button.setAttribute(
      "aria-label",
      "Open Relay AI"
    );

    button.title =
      "Open Relay AI — GitHub Assistant";


    let isDragging = false;
    let hasDragged = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    button.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasDragged = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      const docScrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft;
      const docScrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
      startLeft = rect.left + docScrollLeft;
      startTop = rect.top + docScrollTop;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      if (!hasDragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasDragged = true;
        button.style.cursor = 'grabbing';
        button.style.pointerEvents = 'none';
      }
      
      if (hasDragged) {
        container.style.right = 'auto';
        container.style.left = (startLeft + dx) + "px";
        container.style.top = (startTop + dy) + "px";
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      button.style.cursor = '';
      button.style.pointerEvents = '';
      if (hasDragged) {
        const ctx = context();
        if (ctx && ctx.owner && ctx.repository) {
          const key = `relay_pos_${ctx.owner}_${ctx.repository}`;
          if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ [key]: { left: container.style.left, top: container.style.top } });
          }
        }
      }
    });

    button.addEventListener(
      "click",
      (e) => {
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        try {
          openRelay();
        } catch {
          showError("Relay could not open. Reload this GitHub page and try again.");
        }
      }
    );

    container.append(error, button);

    document.documentElement.append(container);

    const ctx = context();
    if (ctx && ctx.owner && ctx.repository) {
      const key = `relay_pos_${ctx.owner}_${ctx.repository}`;
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get([key], (result) => {
          if (result[key]) {
            container.style.right = 'auto';
            container.style.left = result[key].left;
            container.style.top = result[key].top;
          }
        });
      }
    }


    /*
     * If a panel somehow already exists,
     * keep launcher hidden.
     */

    if (
      document.getElementById(
        "relay-ai-floating-panel"
      )
    ) {

      hideLauncher();

    } else {

      showLauncher();
    }
  }


  /* =========================================================
     UPDATE CONTEXT
     ========================================================= */

  function refresh() {

    scheduled =
      false;

    if (stopped) {
      return;
    }


    /*
     * Hide launcher and all injected UI on GitHub login/OAuth pages.
     */

    if (isAuthPage()) {

      removeRelayUI();

      return;
    }


    /*
     * Relay only exists on GitHub.
     */

    const latest =
      context();


    /*
     * If this is no longer valid,
     * remove Relay completely.
     */

    if (!latest) {

      removeRelayUI();

      return;
    }


    /*
     * Ensure launcher exists.
     */

    ensureButton();


    /*
     * If the panel is open,
     * keep launcher hidden.
     */

    if (
      document.getElementById(
        "relay-ai-floating-panel"
      )
    ) {

      hideLauncher();

    } else {

      showLauncher();
    }


    /*
     * Detect context changes.
     */

    const snapshot =
      JSON.stringify(
        latest
      );

    if (
      snapshot !== lastSnapshot
    ) {

      lastSnapshot =
        snapshot;

      try {
        chrome.runtime.sendMessage({
          type: "relay-ai-context-changed",
          context: latest
        }).catch(() => {});
      } catch (e) {
        // Ignore error if extension context is invalidated
      }

      notifyPanel(
        latest
      );
    }
  }


  /* =========================================================
     NOTIFY FLOATING PANEL
     ========================================================= */

  function notifyPanel(
    latest
  ) {

    const frame =
      document.getElementById(
        "relay-ai-floating-frame"
      );

    if (frame) {
      try {
        frame.contentWindow.postMessage(
          {
            type:
              "relay-ai-host-context",
            context:
              latest
          },
          "*"
        );
      } catch {
        // Ignore iframe messaging failures.
      }
    }

    const wsFrame =
      document.getElementById(
        "relay-ai-workspace-frame"
      );

    if (wsFrame) {
      try {
        wsFrame.contentWindow.postMessage(
          {
            type:
              "relay-ai-host-context",
            context:
              latest
          },
          "*"
        );
      } catch {
        // Ignore iframe messaging failures.
      }
    }
  }


  /* =========================================================
     REMOVE RELAY UI
     ========================================================= */

  function removeRelayUI() {

    const launcher =
      document.getElementById(
        "relay-ai-launcher"
      );

    if (launcher) {
      launcher.remove();
    }


    const panel =
      document.getElementById(
        "relay-ai-floating-panel"
      );

    if (panel) {
      panel.remove();
    }

    const overlay =
      document.getElementById(
        "relay-ai-workspace-overlay"
      );

    if (overlay) {
      overlay.remove();
    }


    lastSnapshot =
      "";
  }


  /* =========================================================
     SCHEDULE UPDATE
     ========================================================= */

  function schedule() {

    if (
      scheduled ||
      stopped
    ) {
      return;
    }

    scheduled =
      true;

    setTimeout(
      refresh,
      120
    );
  }


  /* =========================================================
     WATCH GITHUB SPA NAVIGATION
     ========================================================= */

  const observer =
    new MutationObserver(
      schedule
    );

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );


  const events = [
    "popstate",
    "hashchange",
    "turbo:load",
    "turbo:render",
    "pjax:end",
    "pageshow"
  ];


  events.forEach(
    event => {

      window.addEventListener(
        event,
        schedule
      );
    }
  );


  /* =========================================================
     URL CHANGE FALLBACK
     ========================================================= */

  const interval =
    setInterval(
      () => {

        if (
          location.href !== lastUrl
        ) {

          lastUrl =
            location.href;

          schedule();

          return;
        }


        if (isAuthPage()) {

          removeRelayUI();

          return;
        }


        if (
          !document.getElementById(
            "relay-ai-launcher"
          )
        ) {

          schedule();
        }

      },
      900
    );


  /* =========================================================
     STOP
     ========================================================= */

  function stop() {

    stopped =
      true;

    observer.disconnect();

    clearInterval(
      interval
    );


    events.forEach(
      event => {

        window.removeEventListener(
          event,
          schedule
        );
      }
    );


    removeRelayUI();
  }


  /* =========================================================
     WINDOW MESSAGES
     ========================================================= */

  window.addEventListener(
    "message",
    event => {

      /*
       * Only accept messages from
       * the Relay iframe or workspace overlay iframe.
       */

      const frame =
        document.getElementById(
          "relay-ai-floating-frame"
        );

      const wsFrame =
        document.getElementById(
          "relay-ai-workspace-frame"
        );

      const isFromPanel =
        frame &&
        event.source === frame.contentWindow;

      const isFromWorkspace =
        wsFrame &&
        event.source === wsFrame.contentWindow;

      if (!isFromPanel && !isFromWorkspace) {
        return;
      }


      const message =
        event.data;

      if (!message) {
        return;
      }


      /*
       * Workspace requests minimize.
       */

      if (
        message.type ===
        "relay-ai-minimize-workspace"
      ) {
        minimizeWorkspaceOverlay();
        return;
      }


      /*
       * Workspace requests close.
       */

      if (
        message.type ===
        "relay-ai-close-workspace"
      ) {
        closeWorkspaceOverlay();
        return;
      }


      /*
       * Frame asks for current context.
       */

      if (
        message.type ===
        "relay-ai-request-context"
      ) {

        if (isFromPanel) {
          sendContextToPanel(
            frame
          );
        } else if (isFromWorkspace) {
          sendContextToWorkspace(
            wsFrame
          );
        }

        return;
      }


      /*
       * Frame requests navigation.
       */

      if (
        message.type ===
        "relay-ai-navigate" &&
        message.url
      ) {

        try {
          const url = new URL(message.url);
          if (url.protocol === "https:" && url.hostname === "github.com") {
            const panel = document.getElementById("relay-ai-floating-panel");
            const wasOpen = panel && panel.classList.contains("relay-ai-floating-panel-visible");
            if (wasOpen && typeof chrome !== 'undefined' && chrome.storage) {
              chrome.storage.local.set({ 'relay_auto_reopen': true }, () => {
                window.location.href = url.href;
              });
            } else {
              window.location.href = url.href;
            }
          }
        } catch {
          // Ignore invalid URL
        }

        return;
      }


      /*
       * Panel requests minimize.
       */

      if (
        message.type ===
        "relay-ai-minimize"
      ) {

        const panel =
          document.getElementById(
            "relay-ai-floating-panel"
          );

        if (panel) {

          panel.classList.remove(
            "relay-ai-floating-panel-visible"
          );

          panel.classList.add(
            "relay-ai-floating-panel-hidden"
          );

          setTimeout(
            () => {

              panel.remove();

              showLauncher();

            },
            180
          );

        } else {

          showLauncher();
        }

        return;
      }


      /*
       * Panel requests close.
       */

      if (
        message.type ===
        "relay-ai-close"
      ) {

        const panel =
          document.getElementById(
            "relay-ai-floating-panel"
          );

        if (panel) {

          panel.classList.remove(
            "relay-ai-floating-panel-visible"
          );

          panel.classList.add(
            "relay-ai-floating-panel-hidden"
          );

          setTimeout(
            () => {

              panel.remove();

              /*
               * Restore launcher after
               * closing from inside the iframe.
               */

              showLauncher();

            },
            180
          );

        } else {

          showLauncher();
        }

        return;
      }


      /*
       * Panel requests fresh context.
       */

      if (
        message.type ===
        "relay-ai-refresh"
      ) {

        refresh();

        return;
      }
    }
  );


  /* =========================================================
     EXTENSION MESSAGES
     ========================================================= */

  chrome.runtime.onMessage.addListener(
    (
      message,
      sender,
      respond
    ) => {

      if (
        sender.id !==
        chrome.runtime.id
      ) {
        return;
      }


      if (
        message?.type ===
        "relay-ai-get-context"
      ) {

        respond({
          context:
            context()
        });

        return;
      }


      if (
        message?.type ===
        "relay-ai-close"
      ) {

        removeRelayUI();

        respond({
          ok: true
        });

        return;
      }


      if (
        message?.type ===
        "relay-ai-refresh"
      ) {

        refresh();

        respond({
          ok: true
        });

        return;
      }
    }
  );


  /* =========================================================
     INITIALIZE
     ========================================================= */

  refresh();

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['relay_auto_reopen'], (result) => {
      if (result?.relay_auto_reopen) {
        chrome.storage.local.remove(['relay_auto_reopen']);
        if (!isAuthPage()) {
          openRelay();
        }
      }
    });
  }

})();