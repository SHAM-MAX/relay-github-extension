/*
 * Relay AI — Floating GitHub Panel
 *
 * The panel runs inside an iframe injected into GitHub.
 * GitHub context is received from content.js through postMessage.
 */

(() => {
  "use strict";

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  const $ = id =>
    document.getElementById("relay-ai-" + id);

  const ui = Object.fromEntries([
    "repository",
    "page",
    "branch",
    "branch-row",
    "context-json",
    "host",
    "refresh",
    "context-refresh",
    "empty",
    "messages",
    "conversation",
    "loading",
    "form",
    "input",
    "send",
    "file",
    "attach",
    "attachments",
    "count",
    "error",
    "context-error",
    "connect",
    "close",
    "model-selector",
    "custom-picker-trigger",
    "custom-picker-dropdown",
    "custom-picker-value",
    "gear",
    "gear-menu",
    "gear-history",
    "gear-models",
    "gear-prefs",
    "gear-about",
    "history-view",
    "back-history",
    "history-list",
    "preferences-view",
    "back-prefs",
    "pref-clear-current",
    "pref-clear-all",
    "about-view",
    "back-about"
  ].map(name => [name, $(name)]));


  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    messages: [],
    files: [],
    draft: "",
    busy: false,
    error: ""
  };

  let currentContext = null;
  let requestInFlight = false;
  let renderedMessageCount = 0;


  /* =========================================================
     HELPERS
     ========================================================= */

  function setError(message, element = ui.error) {
    if (!element) return;

    element.textContent = message || "";
    element.hidden = !message;
  }


  function updateControls() {
    const hasMessage =
      Boolean(ui.input?.value.trim());

    const hasFiles =
      state.files.length > 0;

    if (ui.send) {
      ui.send.disabled =
        requestInFlight ||
        state.busy ||
        !currentContext ||
        (!hasMessage && !hasFiles);
    }

    if (ui.input) {
      ui.input.disabled =
        requestInFlight ||
        state.busy;
    }

    if (ui.attach) {
      ui.attach.disabled =
        requestInFlight ||
        state.busy;
    }

    if (ui.count && ui.input) {
      ui.count.textContent =
        ui.input.value.length.toLocaleString("en-US") +
        " / 4,000";
    }

    if (ui.loading) {
      ui.loading.hidden =
        !state.busy;
    }

    if (ui.form) {
      ui.form.setAttribute(
        "aria-busy",
        String(state.busy)
      );
    }
  }


  /* =========================================================
     CLOSE FLOATING PANEL
     ========================================================= */

  function closePanel() {
    try {
      window.parent.postMessage(
        {
          type: "relay-ai-close"
        },
        "*"
      );
    } catch {
      // Ignore close errors.
    }
  }


  if (ui.close) {
    ui.close.addEventListener(
      "click",
      closePanel
    );
  }


  /* =========================================================
     FILES
     ========================================================= */

  function renderFiles() {
    if (!ui.attachments) return;

    ui.attachments.replaceChildren();

    state.files.forEach(
      (file, index) => {

        const item =
          document.createElement("li");

        const name =
          document.createElement("span");

        name.textContent =
          file.name;

        name.title =
          file.name;

        const remove =
          document.createElement("button");

        remove.type = "button";
        remove.textContent = "×";

        remove.setAttribute(
          "aria-label",
          "Remove " + file.name
        );

        remove.disabled =
          requestInFlight ||
          state.busy;

        remove.addEventListener(
          "click",
          () => {

            state.files.splice(
              index,
              1
            );

            renderFiles();
            updateControls();
          }
        );

        item.append(
          name,
          remove
        );

        ui.attachments.append(item);
      }
    );
  }


  /* =========================================================
     CHAT MESSAGE
     ========================================================= */

  function appendMessage(message) {

    const article =
      document.createElement("article");

    article.className =
      "relay-ai-message relay-ai-message-" +
      message.role;

    const label =
      document.createElement("div");

    label.className =
      "relay-ai-message-label";

    const author =
      document.createElement("span");

    author.textContent =
      message.role === "user"
        ? "You"
        : "✦ Relay AI";

    const contextLabel =
      document.createElement("span");

    contextLabel.className =
      "relay-ai-message-context";

    if (
      message.context?.repository &&
      message.context?.owner
    ) {
      let description = "";

      try {
        description =
          RelayAIContext.describe(
            message.context
          );
      } catch {
        description =
          message.context.pageType || "";
      }

      contextLabel.textContent =
        `${message.context.owner}/${message.context.repository}` +
        (description
          ? ` · ${description}`
          : "");
    }

    label.append(
      author,
      contextLabel
    );

    const body =
      document.createElement("p");

    body.className =
      "relay-ai-message-body";

    /*
     * Never render assistant/user text as HTML.
     */
    body.textContent =
      message.text;

    article.append(
      label,
      body
    );



    if (message.files?.length) {

      const list =
        document.createElement("ul");

      list.className =
        "relay-ai-message-files";

      for (
        const file of message.files
      ) {

        const item =
          document.createElement("li");

        item.textContent =
          "↳ " +
          file.name +
          " · not uploaded";

        list.append(item);
      }

      article.append(list);
    }

    if (message.issuePlan && message.issuePlan.issues && message.issuePlan.issues.length) {
      const planContainer = document.createElement("div");
      planContainer.className = "relay-ai-issue-plan";

      const planTitle = document.createElement("h4");
      planTitle.className = "relay-ai-issue-plan-title";
      planTitle.textContent = "Proposed GitHub Issues";
      planContainer.append(planTitle);

      for (const issue of message.issuePlan.issues) {
        const card = document.createElement("div");
        card.className = "relay-ai-issue-card";

        const header = document.createElement("div");
        header.className = "relay-ai-issue-header";

        const title = document.createElement("h5");
        title.className = "relay-ai-issue-title";
        let titleText = issue.title || "Untitled Issue";
        if (issue.id) {
          titleText = `#${issue.id} ` + titleText;
        }
        title.textContent = titleText;

        const meta = document.createElement("div");
        meta.className = "relay-ai-issue-meta";

        if (issue.issue_type) {
          const typeBadge = document.createElement("span");
          typeBadge.className = "relay-ai-issue-badge relay-ai-issue-type";
          typeBadge.textContent = issue.issue_type;
          meta.append(typeBadge);
        }

        if (issue.priority) {
          const priorityBadge = document.createElement("span");
          priorityBadge.className = "relay-ai-issue-badge relay-ai-issue-priority";
          priorityBadge.textContent = issue.priority;
          meta.append(priorityBadge);
        }

        header.append(title, meta);

        const body = document.createElement("p");
        body.className = "relay-ai-issue-desc";
        body.textContent = issue.body || "";

        card.append(header, body);

        if ((issue.labels && issue.labels.length) || (issue.dependencies && issue.dependencies.length)) {
          const footer = document.createElement("div");
          footer.className = "relay-ai-issue-footer";

          if (issue.labels && issue.labels.length) {
            const labelsDiv = document.createElement("div");
            labelsDiv.className = "relay-ai-issue-labels";
                        for (const rawLabel of issue.labels) {
              const parts = typeof rawLabel === 'string' ? rawLabel.split(',') : [rawLabel];
              for (const p of parts) {
                const clean = (typeof p === 'string' ? p.trim() : p);
                if (!clean) continue;
                const span = document.createElement("span");
                span.className = "relay-ai-issue-label";
                span.textContent = clean;
                labelsDiv.append(span);
              }
            }
            footer.append(labelsDiv);
          }

          if (issue.dependencies && issue.dependencies.length) {
            const depsDiv = document.createElement("div");
            depsDiv.className = "relay-ai-issue-deps";
            depsDiv.textContent = "Depends on: " + issue.dependencies.join(", ");
            footer.append(depsDiv);
          }
          
          card.append(footer);
        }

        planContainer.append(card);
      }

      const actions = document.createElement("div");
      actions.className = "relay-ai-issue-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "relay-ai-btn relay-ai-btn-secondary";
      cancelBtn.textContent = "Cancel";
      cancelBtn.type = "button";
      
      const createBtn = document.createElement("button");
      createBtn.className = "relay-ai-btn relay-ai-btn-primary";
      const numIssues = message.issuePlan.issues.length;
      createBtn.textContent = `Create ${numIssues} Issue${numIssues === 1 ? '' : 's'}`;
      createBtn.type = "button";

      const infoMsg = document.createElement("div");
      infoMsg.className = "relay-ai-issue-info";
      infoMsg.textContent = "GitHub Issue creation will be available in the next step.";
      infoMsg.hidden = true;

      createBtn.addEventListener("click", async () => {
        infoMsg.hidden = false;
        infoMsg.textContent = "Creating issues...";
        infoMsg.className = "relay-ai-issue-info";
        createBtn.disabled = true;
        cancelBtn.disabled = true;

        try {
          const res = await RelayAIAssistant.createIssue(message.issuePlan, currentContext);
          
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Server error " + res.status);
          
          planContainer.replaceChildren();
          for (const result of data.results || []) {
            const card = document.createElement("div");
            card.className = "relay-ai-issue-card";
            
            if (result.status === 'success') {
              const title = document.createElement("a");
              title.className = "relay-ai-issue-title";
              title.href = result.url;
              title.target = "_blank";
              title.textContent = "✅ #" + result.number + " " + result.title;
              card.append(title);
            } else {
              const title = document.createElement("h4");
              title.className = "relay-ai-issue-title";
              title.textContent = "❌ " + result.title;
              
              const errNode = document.createElement("p");
              errNode.style.color = "var(--relay-ai-danger)";
              errNode.style.marginTop = "8px";
              errNode.textContent = result.error;
              card.append(title, errNode);
            }
            planContainer.append(card);
          }
        } catch (err) {
          infoMsg.textContent = "Failed to create issues: " + err.message;
          infoMsg.style.color = "var(--relay-ai-danger)";
          createBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      });
      
      cancelBtn.addEventListener("click", () => {
        planContainer.remove();
      });

      actions.append(cancelBtn, createBtn);
      planContainer.append(actions, infoMsg);

      article.append(planContainer);
    }

    ui.messages.append(article);
  }


  /* =========================================================
     CONVERSATION
     ========================================================= */

  function renderConversation(
    reset = false
  ) {

    if (!ui.messages) return;

    if (reset) {

      ui.messages.replaceChildren();

      renderedMessageCount = 0;
    }

    for (
      const message of
      state.messages.slice(
        renderedMessageCount
      )
    ) {
      appendMessage(message);
    }

    renderedMessageCount =
      state.messages.length;

    if (ui.empty) {
      ui.empty.hidden =
        state.messages.length > 0;
    }

    setError(
      state.error,
      ui.error
    );

    updateControls();

    if (
      state.messages.length &&
      ui.conversation
    ) {
      ui.conversation.scrollTop =
        ui.conversation.scrollHeight;
    }
  }


  /* =========================================================
     RENDER GITHUB CONTEXT
     ========================================================= */

  function renderContext(context) {

    currentContext =
      context || null;


    if (ui.repository) {

      ui.repository.textContent =
        context?.repository
          ? `${context.owner}/${context.repository}`
          : "Select repository";
    }


    if (ui.page) {

      try {

        ui.page.textContent =
          context
            ? RelayAIContext.describe(context)
            : "";

      } catch {

        ui.page.textContent =
          context?.pageType || "";
      }
    }


    if (ui.host) {
      ui.host.textContent =
        context?.host || "";
    }


    if (ui["branch-row"]) {

      ui["branch-row"].hidden =
        !context?.branch;
    }


    if (ui.branch) {

      ui.branch.textContent =
        context?.branch || "";
    }


    if (ui["context-json"]) {

      ui["context-json"].textContent =
        context
          ? JSON.stringify(
              context,
              null,
              2
            )
          : "";
    }


    updateControls();
  }


  /* =========================================================
     RECEIVE CONTEXT FROM GITHUB CONTENT SCRIPT
     ========================================================= */

  window.addEventListener(
    "message",
    event => {

      /*
       * Only accept messages from the
       * parent GitHub document.
       */

      if (
        event.source !== window.parent
      ) {
        return;
      }

      const message =
        event.data;

      if (!message) {
        return;
      }


      if (
        message.type ===
        "relay-ai-host-context"
      ) {

        const oldRepo = currentContext && currentContext.repository
          ? `${currentContext.owner}/${currentContext.repository}`
          : null;
          
        const newRepo = message.context && message.context.repository
          ? `${message.context.owner}/${message.context.repository}`
          : null;

        if (oldRepo && newRepo && oldRepo !== newRepo) {
          state.messages = [];
          state.files = [];
          state.error = "";
          state.draft = "";
          renderedMessageCount = 0;
          if (ui.input) { ui.input.value = ""; }
          if (ui.messages) { ui.messages.replaceChildren(); }
          if (ui.empty) { ui.empty.hidden = false; }
          setError("");
          renderFiles();
        }

        renderContext(
          message.context || null
        );
      }


      if (
        message.type ===
        "relay-ai-refresh-context"
      ) {

        /*
         * Ask parent page for the
         * latest GitHub context.
         */

        try {
          window.parent.postMessage(
            {
              type: "relay-ai-request-context"
            },
            "*"
          );
        } catch {
          // Ignore.
        }
      }
    }
  );


  /* =========================================================
     ASK PARENT FOR INITIAL CONTEXT
     ========================================================= */

  function requestInitialContext() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "relay-ai-request-context" }, "*");
      } else if (chrome && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs && tabs[0]) {
            const url = tabs[0].url;
            try {
              const res = chrome.tabs.sendMessage(tabs[0].id, { type: "relay-ai-get-context" }, response => {
                if (chrome.runtime.lastError || !response || !response.context) {
                  const fallback = parseRepositoryUrl(url);
                  if (fallback) {
                    renderContext({ owner: fallback.owner, repository: fallback.repository, url });
                  } else {
                    renderContext(null);
                  }
                  setError("Relay could not read the GitHub page. Refresh this GitHub tab.", ui["context-error"]);
                } else {
                  renderContext(response.context);
                }
              });
              if (res && res.catch) {
                res.catch((e) => {
                  const fallback = parseRepositoryUrl(url);
                  renderContext(fallback ? { owner: fallback.owner, repository: fallback.repository, url } : null);
                  setError("Relay could not read the GitHub page. Refresh this GitHub tab.", ui["context-error"]);
                });
              }
            } catch (err) {
              const fallback = parseRepositoryUrl(url);
              renderContext(fallback ? { owner: fallback.owner, repository: fallback.repository, url } : null);
              setError("Relay could not read the GitHub page. Refresh this GitHub tab.", ui["context-error"]);
            }
          } else {
            renderContext(null);
          }
        });
      }
    } catch {
      renderContext(null);
      setError("Relay could not read the GitHub page. Refresh this GitHub tab.", ui["context-error"]);
    }
  }


  /* =========================================================
     REPOSITORY URL PARSER
     ========================================================= */

  function parseRepositoryUrl(value) {

    const raw =
      String(value || "").trim();

    if (!raw) {
      return null;
    }

    let url;

    try {

      url =
        new URL(
          raw.startsWith("http")
            ? raw
            : `https://github.com/${raw}`
        );

    } catch {

      return null;
    }


    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com"
    ) {
      return null;
    }


    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);


    if (parts.length < 2) {
      return null;
    }


    const owner =
      parts[0];

    const repository =
      parts[1].replace(
        /\.git$/,
        ""
      );


    if (
      !owner ||
      !repository
    ) {
      return null;
    }


    return {

      host: "github.com",

      owner,

      repository,

      url:
        `https://github.com/${owner}/${repository}`,

      pageType:
        "repository",

      issueNumber: null,

      pullRequestNumber: null,

      branch: "main"
    };
  }


  /* =========================================================
     REPOSITORY PICKER
     ========================================================= */

  function openRepositoryPicker() {

    if (
      document.getElementById(
        "relay-ai-repository-picker"
      )
    ) {
      return;
    }


    const overlay =
      document.createElement("div");

    overlay.id =
      "relay-ai-repository-picker";

    overlay.className =
      "relay-ai-repository-picker";


    const dialog =
      document.createElement("div");

    dialog.className =
      "relay-ai-repository-dialog";

    dialog.setAttribute(
      "role",
      "dialog"
    );

    dialog.setAttribute(
      "aria-modal",
      "true"
    );

    dialog.setAttribute(
      "aria-label",
      "Select GitHub repository"
    );


    /* -------------------------------------------------------
       HEADER
       ------------------------------------------------------- */

    const header =
      document.createElement("div");

    header.className =
      "relay-ai-repository-dialog-header";


    const title =
      document.createElement("div");

    const titleSpan = document.createElement("span");
    titleSpan.className = "relay-ai-repository-dialog-title";
    titleSpan.textContent = "Select GitHub repository";

    const subtitleSpan = document.createElement("span");
    subtitleSpan.className = "relay-ai-repository-dialog-subtitle";
    subtitleSpan.textContent = "Choose the project Relay should work with";

    title.append(titleSpan, subtitleSpan);


    const close =
      document.createElement("button");

    close.type = "button";

    close.className =
      "relay-ai-repository-close";

    close.textContent =
      "×";

    close.setAttribute(
      "aria-label",
      "Close repository picker"
    );


    header.append(
      title,
      close
    );


    /* -------------------------------------------------------
       SEARCH
       ------------------------------------------------------- */

    const search =
      document.createElement("input");

    search.type = "text";

    search.className =
      "relay-ai-repository-search";

    search.placeholder =
      "Search or paste GitHub repository URL...";

    search.autocomplete =
      "off";


    /* -------------------------------------------------------
       LIST
       ------------------------------------------------------- */

    const list =
      document.createElement("div");

    list.className =
      "relay-ai-repository-list";


    function addRepository(
      repository,
      description = ""
    ) {

      const item =
        document.createElement("button");

      item.type =
        "button";

      item.className =
        "relay-ai-repository-item";


      const icon =
        document.createElement("span");

      icon.className =
        "relay-ai-repository-item-icon";

      icon.textContent =
        "●";


      const content =
        document.createElement("span");

      content.className =
        "relay-ai-repository-item-content";


      const name =
        document.createElement("strong");

      name.textContent =
        repository.fullName;


      const meta =
        document.createElement("small");

      meta.textContent =
        description ||
        repository.url;


      content.append(
        name,
        meta
      );


      item.append(
        icon,
        content
      );


      item.addEventListener(
        "click",
        () => {

          selectRepository(
            repository.context
          );

          closePicker();
        }
      );


      list.append(item);
    }


    /*
     * Current repository.
     */

    if (
      currentContext?.owner &&
      currentContext?.repository
    ) {

      addRepository(
        {
          fullName:
            `${currentContext.owner}/${currentContext.repository}`,

          url:
            currentContext.url ||
            `https://github.com/${currentContext.owner}/${currentContext.repository}`,

          context:
            currentContext
        },

        "Current GitHub repository"
      );
    }




    /*
     * Dynamic GitHub Repositories.
     */

    const loadingState = document.createElement("div");
    loadingState.className = "relay-ai-repository-loading";
    loadingState.textContent = "Loading repositories...";
    list.append(loadingState);

    RelayAIAssistant.getRepositories()
    .then(r => {
      if (!r.ok) throw new Error('API error: ' + r.status);
      return r.json();
    })
    .then(data => {
      loadingState.remove();
      if (!data.repositories || data.repositories.length === 0) {
        const errorState = document.createElement("div");
        errorState.className = "relay-ai-repository-error";
        errorState.textContent = "No repositories found";
        list.append(errorState);
        return;
      }
      
      data.repositories.forEach(repo => {
        // Avoid duplicating current repository if it matches exactly
        const isCurrent = currentContext?.owner === repo.owner && currentContext?.repository === repo.name;
        
        if (!isCurrent) {
          addRepository({
            fullName: repo.fullName,
            url: repo.htmlUrl,
            context: repo.context
          }, repo.owner);
        }
      });
      
      // Re-trigger filter just in case the user typed while loading
      search.dispatchEvent(new Event('input'));
    })
    .catch(() => {
      loadingState.remove();
      const errorState = document.createElement("div");
      errorState.className = "relay-ai-repository-error";
      errorState.textContent = "Unable to load repositories";
      
      const retry = document.createElement("button");
      retry.textContent = "Retry";
      retry.className = "relay-ai-repository-retry";
      retry.onclick = () => {
        closePicker();
        setTimeout(openRepositoryPicker, 50);
      };
      
      errorState.append(document.createElement("br"), retry);
      list.append(errorState);
    });


    /* -------------------------------------------------------
       MANUAL URL
       ------------------------------------------------------- */

    const manual =
      document.createElement("button");

    manual.type =
      "button";

    manual.className =
      "relay-ai-repository-manual";

    manual.textContent =
      "Use this repository";

    manual.hidden =
      true;


    manual.addEventListener(
      "click",
      () => {

        const context =
          parseRepositoryUrl(
            search.value
          );

        if (!context) {

          search.classList.add(
            "relay-ai-repository-search-error"
          );

          search.focus();

          return;
        }


        selectRepository(context);

        closePicker();
      }
    );


    /* -------------------------------------------------------
       SEARCH FILTER
       ------------------------------------------------------- */

    search.addEventListener(
      "input",
      () => {

        const value =
          search.value
            .trim()
            .toLowerCase();


        const parsed =
          parseRepositoryUrl(
            search.value
          );


        manual.hidden =
          !parsed;


        for (
          const item of
          Array.from(list.children)
        ) {

          const text =
            item.textContent
              .toLowerCase();

          item.hidden =
            Boolean(
              value &&
              !text.includes(value)
            );
        }
      }
    );


    /* -------------------------------------------------------
       HINT
       ------------------------------------------------------- */

    const hint =
      document.createElement("p");

    hint.className =
      "relay-ai-repository-hint";

    hint.textContent =
      "You can paste a GitHub repository URL, for example github.com/SHAM-MAX/GitHub-Kanban-Practice";


    /* -------------------------------------------------------
       CLOSE
       ------------------------------------------------------- */

    function closePicker() {

      overlay.remove();

      document.removeEventListener(
        "keydown",
        onKeyDown
      );
    }


    close.addEventListener(
      "click",
      closePicker
    );


    overlay.addEventListener(
      "click",
      event => {

        if (
          event.target === overlay
        ) {
          closePicker();
        }
      }
    );


    function onKeyDown(event) {

      if (
        event.key === "Escape"
      ) {
        closePicker();
      }
    }


    document.addEventListener(
      "keydown",
      onKeyDown
    );


    dialog.append(
      header,
      search,
      list,
      manual,
      hint
    );

    overlay.append(dialog);

    document.body.append(
      overlay
    );

    search.focus();
  }


  /* =========================================================
     SELECT REPOSITORY
     ========================================================= */

  function selectRepository(
    context
  ) {

    if (!context) {
      return;
    }

    const url = context.url || `https://github.com/${context.owner}/${context.repository}`;

    try {
      window.parent.postMessage(
        {
          type: "relay-ai-navigate",
          url: url
        },
        "*"
      );
    } catch {
      // Ignore.
    }
  }


  /* =========================================================
     REPOSITORY BUTTON
     ========================================================= */

  if (ui.refresh) {
    ui.refresh.addEventListener("click", event => {
      event.preventDefault();
      openRepositoryPicker();
    });
  }

  if (ui["context-refresh"]) {
    ui["context-refresh"].addEventListener("click", event => {
      event.preventDefault();
      requestInitialContext();
    });
  }


  /* =========================================================
     TEXT INPUT
     ========================================================= */

  if (ui.input) {

    ui.input.addEventListener(
      "input",
      () => {

        state.draft =
          ui.input.value;

        state.error = "";

        setError("");

        updateControls();
      }
    );


    /* -------------------------------------------------------
       Enter to send
       ------------------------------------------------------- */

    ui.input.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.isComposing
        ) {

          event.preventDefault();

          if (
            !ui.send.disabled
          ) {
            ui.form.requestSubmit();
          }
        }
      }
    );
  }


  /* =========================================================
     FILE ATTACHMENT
     ========================================================= */

  if (ui.attach && ui.file) {

    ui.attach.addEventListener(
      "click",
      () => ui.file.click()
    );


    ui.file.addEventListener(
      "change",
      () => {

        const picked =
          Array.from(
            ui.file.files || [],
            file => ({
              name: file.name,
              size: file.size,
              lastModified:
                file.lastModified
            })
          );


        ui.file.value = "";


        if (
          requestInFlight ||
          state.busy
        ) {
          return;
        }


        const merged =
          [...state.files];


        for (
          const file of picked
        ) {

          if (
            !merged.some(
              item =>
                item.name === file.name &&
                item.size === file.size &&
                item.lastModified ===
                  file.lastModified
            )
          ) {
            merged.push(file);
          }
        }


        if (merged.length > 3) {

          state.error =
            "Choose up to 3 local files. Remove a file and try again.";

        } else {

          state.files =
            merged;

          state.error = "";
        }


        setError(
          state.error
        );

        renderFiles();

        updateControls();
      }
    );
  }


  /* =========================================================
     SEND MESSAGE
     ========================================================= */

  if (ui.form) {

    ui.form.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const text =
          ui.input.value.trim();


        if (
          requestInFlight ||
          state.busy ||
          !currentContext ||
          (!text &&
            !state.files.length)
        ) {
          return;
        }


        if (!text) {

          state.error =
            "Type a message to send. Files are local only and are not read or uploaded.";

          setError(
            state.error
          );

          return;
        }


        if (
          ui.input.value.length > 4000
        ) {

          state.error =
            "Keep your message within 4,000 characters, then try again.";

          setError(
            state.error
          );

          ui.input.focus();

          return;
        }


        const messageContext = {
          ...currentContext
        };


        state.messages.push({

          role: "user",

          text,

          files:
            [...state.files],

          context:
            messageContext
        });
        
        if (typeof saveConversation === "function") saveConversation();


        state.files = [];

        state.draft = "";

        state.error = "";

        state.busy = true;

        requestInFlight = true;

        ui.input.value = "";


        renderFiles();

        renderConversation();


        try {

          const response =
            await RelayAIAssistant.send(
              text,
              messageContext,
              { model: ui["model-selector"]?.value || "auto" }
            );

          /*
           * If context was reset (e.g. navigation changed repo)
           * while in-flight, discard the reply.
           */
          if (state.messages.length === 0) {
            return;
          }

          state.messages.push({

            role: "assistant",

            text:
              response.reply,

            issuePlan:
              response.issuePlan,

            context:
              messageContext,

            model:
              response.model
          });
          
          if (typeof saveConversation === "function") saveConversation();

        } catch (err) {

          state.error =
            err?.message ||
            "The Relay backend could not respond. Please retry.";

          state.draft =
            text;

          ui.input.value =
            text;

        } finally {

          state.busy =
            false;

          requestInFlight =
            false;

          renderFiles();

          renderConversation();

          ui.input.focus();
        }
      }
    );
  }


  /* =========================================================
     QUICK PROMPTS
     ========================================================= */

  document
    .querySelectorAll(
      "[data-relay-prompt]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            if (
              requestInFlight ||
              state.busy
            ) {
              return;
            }


            ui.input.value =
              button.dataset.relayPrompt;

            state.draft =
              ui.input.value;

            updateControls();

            ui.input.focus();
          }
        );
      }
    );


  /* =========================================================
     CONNECT RELAY
     ========================================================= */

  if (
    ui.connect &&
    globalThis.chrome?.runtime?.id
  ) {

    ui.connect.href =
      RelayAIAssistant.connectionURL(
        chrome.runtime.id
      );
  }


  /* =========================================================
     INITIAL STATE
     ========================================================= */

  const customPicker = document.getElementById("relay-ai-custom-picker");
  const customPickerTrigger = document.getElementById("relay-ai-custom-picker-trigger");
  const customPickerValue = document.getElementById("relay-ai-custom-picker-value");
  const customPickerDropdown = document.getElementById("relay-ai-custom-picker-dropdown");

  function setModel(value) {
    if (ui["model-selector"]) ui["model-selector"].value = value;
    if (globalThis.chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ relay_ai_model: value });
    }
    
    // Update custom picker UI
    if (customPickerDropdown && customPickerValue) {
      const options = customPickerDropdown.querySelectorAll('.relay-ai-custom-picker-option');
      options.forEach(opt => {
        if (opt.dataset.value === value) {
          opt.classList.add('is-selected');
          const textSpan = opt.querySelector('.relay-ai-option-text');
          if (textSpan) customPickerValue.textContent = textSpan.textContent;
        } else {
          opt.classList.remove('is-selected');
        }
      });
    }
  }

  if (ui["model-selector"] && globalThis.chrome?.storage?.local) {
    chrome.storage.local.get(["relay_ai_model"], (result) => {
      if (result.relay_ai_model) {
        setModel(result.relay_ai_model);
      } else {
        setModel(ui["model-selector"].value || "auto");
      }
    });
    ui["model-selector"].addEventListener("change", () => {
      setModel(ui["model-selector"].value);
    });
  } else if (ui["model-selector"]) {
    setModel(ui["model-selector"].value || "auto");
  }

  if (customPicker && customPickerTrigger && customPickerDropdown) {
    customPickerTrigger.addEventListener("click", (e) => {
      e.stopPropagation && e.stopPropagation();
      const isOpen = customPicker.classList.contains("is-open");
      if (isOpen) {
        customPicker.classList.remove("is-open");
        customPickerTrigger.setAttribute("aria-expanded", "false");
      } else {
        customPicker.classList.add("is-open");
        customPickerTrigger.setAttribute("aria-expanded", "true");
      }
    });

    customPickerDropdown.addEventListener("click", (e) => {
      const option = e.target.closest(".relay-ai-custom-picker-option");
      if (option) {
        e.stopPropagation && e.stopPropagation();
        const value = option.dataset.value;
        setModel(value);
        customPicker.classList.remove("is-open");
        customPickerTrigger.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("click", (e) => {
      if (customPicker.classList.contains("is-open") && !customPicker.contains(e.target)) {
        customPicker.classList.remove("is-open");
        customPickerTrigger.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && customPicker.classList.contains("is-open")) {
        customPicker.classList.remove("is-open");
        customPickerTrigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  renderFiles();

  renderConversation();

  updateControls();

  requestInitialContext();

  /* =========================================================
     GEAR MENU & CHAT HISTORY & PERSISTENCE
     ========================================================= */

  // 1. Gear menu toggle
  if (ui["gear"]) {
    ui["gear"].addEventListener("click", (e) => {
      e.stopPropagation();
      ui["gear-menu"].classList.toggle("hidden");
      ui["gear"].classList.toggle("active");
    });
  }

  // Close gear menu when clicking outside
  document.addEventListener("click", (e) => {
    if (ui["gear-menu"] && !ui["gear-menu"].classList.contains("hidden") && !ui["gear-menu"].contains(e.target) && !ui["gear"].contains(e.target)) {
      ui["gear-menu"].classList.add("hidden");
      ui["gear"].classList.remove("active");
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui["gear-menu"] && !ui["gear-menu"].classList.contains("hidden")) {
      ui["gear-menu"].classList.add("hidden");
      ui["gear"].classList.remove("active");
    }
  });

  // View navigation helper
  function openView(viewElement) {
    if (ui["gear-menu"]) ui["gear-menu"].classList.add("hidden");
    if (ui["gear"]) ui["gear"].classList.remove("active");
    
    // Hide all subviews first
    ["history-view", "preferences-view", "about-view"].forEach(id => {
      if (ui[id]) ui[id].classList.add("hidden");
    });
    
    if (viewElement) {
      viewElement.classList.remove("hidden");
    }
  }

  // History View
  if (ui["gear-history"]) {
    ui["gear-history"].addEventListener("click", () => {
      openView(ui["history-view"]);
      loadChatHistory();
    });
  }
  if (ui["back-history"]) {
    ui["back-history"].addEventListener("click", () => openView(null));
  }

  // Preferences View
  if (ui["gear-prefs"]) {
    ui["gear-prefs"].addEventListener("click", () => openView(ui["preferences-view"]));
  }
  if (ui["back-prefs"]) {
    ui["back-prefs"].addEventListener("click", () => openView(null));
  }

  // About View
  if (ui["gear-about"]) {
    ui["gear-about"].addEventListener("click", () => {
      openView(ui["about-view"]);
      const versionEl = document.getElementById("relay-ai-version");
      if (versionEl && chrome.runtime && chrome.runtime.getManifest) {
        versionEl.textContent = chrome.runtime.getManifest().version;
      }
    });
  }
  if (ui["back-about"]) {
    ui["back-about"].addEventListener("click", () => openView(null));
  }

  // AI Models
  if (ui["gear-models"]) {
    ui["gear-models"].addEventListener("click", () => {
      if (ui["gear-menu"]) ui["gear-menu"].classList.add("hidden");
      if (ui["gear"]) ui["gear"].classList.remove("active");
      
      const customPickerTrigger = document.getElementById("relay-ai-custom-picker-trigger");
      if (customPickerTrigger) {
        customPickerTrigger.click();
      } else if (ui["model-selector"]) {
        ui["model-selector"].focus();
      }
    });
  }

  // Preferences Logic
  function showConfirmDialog(title, message, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "relay-ai-subview";
    overlay.style.zIndex = "1000";
    
    const header = document.createElement("div");
    header.className = "relay-ai-subview-header";
    const h2 = document.createElement("h2");
    h2.textContent = title;
    header.appendChild(h2);
    
    const content = document.createElement("div");
    content.className = "relay-ai-subview-content";
    content.style.padding = "16px";
    
    const p = document.createElement("p");
    p.style.marginBottom = "20px";
    p.style.fontSize = "14px";
    p.textContent = message;
    
    const confirmBtn = document.createElement("button");
    confirmBtn.id = "relay-confirm-btn";
    confirmBtn.className = "relay-ai-btn relay-ai-btn-danger";
    confirmBtn.style.width = "100%";
    confirmBtn.style.marginBottom = "12px";
    confirmBtn.textContent = "Confirm";
    
    const cancelBtn = document.createElement("button");
    cancelBtn.id = "relay-cancel-btn";
    cancelBtn.className = "relay-ai-btn relay-ai-btn-secondary";
    cancelBtn.style.width = "100%";
    cancelBtn.textContent = "Cancel";
    
    content.appendChild(p);
    content.appendChild(confirmBtn);
    content.appendChild(cancelBtn);
    
    overlay.appendChild(header);
    overlay.appendChild(content);
    
    document.body.appendChild(overlay);
    
    confirmBtn.addEventListener("click", () => {
      overlay.remove();
      onConfirm();
    });
    cancelBtn.addEventListener("click", () => {
      overlay.remove();
    });
  }

  if (ui["pref-clear-current"]) {
    ui["pref-clear-current"].addEventListener("click", () => {
      showConfirmDialog("Clear Conversation", "Are you sure you want to clear the current conversation?", () => {
        state.messages = [];
        state.files = [];
        renderConversation(true);
        openView(null);
      });
    });
  }

  if (ui["pref-clear-all"]) {
    ui["pref-clear-all"].addEventListener("click", () => {
      showConfirmDialog("Clear All History", "Are you sure you want to delete all saved conversations?", () => {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove("relay_conversations", () => {
            state.messages = [];
            state.files = [];
            renderConversation(true);
            openView(null);
          });
        }
      });
    });
  }

  // Conversation Persistence
  state.conversationId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  
  function saveConversation() {
    if (!currentContext || state.messages.length === 0) return;
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["relay_conversations"], (res) => {
        let conversations = res.relay_conversations || [];
        
        const index = conversations.findIndex(c => c.conversationId === state.conversationId);
        
        const convoData = {
          conversationId: state.conversationId,
          title: state.messages[0].text ? state.messages[0].text.substring(0, 40) + "..." : "New Conversation",
          owner: currentContext.owner,
          repository: currentContext.repository,
          model: ui["model-selector"]?.value || "auto",
          messages: state.messages,
          createdAt: index >= 0 ? conversations[index].createdAt : Date.now(),
          updatedAt: Date.now()
        };

        if (index >= 0) {
          conversations[index] = convoData;
        } else {
          conversations.push(convoData);
        }
        
        chrome.storage.local.set({ relay_conversations: conversations });
      });
    }
  }

  // Load Chat History
  function loadChatHistory() {
    const list = ui["history-list"];
    if (!list) return;
    list.replaceChildren();
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["relay_conversations"], (res) => {
        let conversations = res.relay_conversations || [];
        
        if (currentContext && currentContext.owner && currentContext.repository) {
          conversations = conversations.filter(c => c.owner === currentContext.owner && c.repository === currentContext.repository);
        }
        
        if (conversations.length === 0) {
          const emptyMsg = document.createElement("p");
          emptyMsg.style.color = "#8b949e";
          emptyMsg.style.textAlign = "center";
          emptyMsg.style.marginTop = "20px";
          emptyMsg.textContent = "No previous conversations found for this repository.";
          list.appendChild(emptyMsg);
          return;
        }
        
        conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const groups = {
          "Today": [],
          "Yesterday": [],
          "Older": []
        };
        
        conversations.forEach(c => {
          const updated = new Date(c.updatedAt);
          if (updated >= today) groups["Today"].push(c);
          else if (updated >= yesterday) groups["Yesterday"].push(c);
          else groups["Older"].push(c);
        });
        
        Object.keys(groups).forEach(groupName => {
          if (groups[groupName].length > 0) {
            const heading = document.createElement("h3");
            heading.textContent = groupName;
            heading.style.margin = "16px 0 8px";
            heading.style.fontSize = "12px";
            heading.style.color = "#8b949e";
            heading.style.textTransform = "uppercase";
            list.appendChild(heading);
            
            groups[groupName].forEach(c => {
              const item = document.createElement("div");
              item.className = "relay-ai-history-card";
              item.style.padding = "12px";
              item.style.border = "1px solid #30363d";
              item.style.borderRadius = "6px";
              item.style.marginBottom = "8px";
              item.style.cursor = "pointer";
              
              const title = document.createElement("div");
              title.textContent = c.title;
              title.style.fontWeight = "bold";
              title.style.color = "#c9d1d9";
              title.style.marginBottom = "4px";
              
              const meta = document.createElement("div");
              meta.textContent = new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " · " + c.messages.length + " messages";
              meta.style.fontSize = "12px";
              meta.style.color = "#8b949e";
              
              item.appendChild(title);
              item.appendChild(meta);
              
              item.addEventListener("click", () => {
                restoreConversation(c);
              });
              
              list.appendChild(item);
            });
          }
        });
      });
    }
  }

  function restoreConversation(convo) {
    state.conversationId = convo.conversationId;
    state.messages = [...convo.messages];
    state.files = []; 
    
    renderConversation(true);
    
    openView(null);
  }

})();


