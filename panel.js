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
    "logout",
    "auth-unauthenticated",
    "auth-authenticated",
    "close",
    "minimize",
    "status-dot",
    "model-selector",
    "custom-picker-trigger",
    "custom-picker-dropdown",
    "custom-picker-value",
    "gear",
    "gear-menu",
    "gear-history",
    "gear-models",
    "gear-profile",
    "gear-health",
    "gear-prefs",
    "gear-about",
    "history-view",
    "back-history",
    "history-list",
    "health-view",
    "back-health",
    "health-loading",
    "health-body",
    "gear-traceability",
    "traceability-view",
    "back-traceability",
    "traceability-loading",
    "traceability-body",
    "gear-reports",
    "reports-view",
    "back-reports",
    "reports-loading",
    "reports-body",
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

  function minimizePanel() {
    try {
      window.parent.postMessage(
        {
          type: "relay-ai-minimize"
        },
        "*"
      );
    } catch {
      // Ignore minimize errors.
    }
  }

  if (ui.minimize) {
    ui.minimize.addEventListener(
      "click",
      minimizePanel
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
        : message.role === "system"
          ? "✦ Relay System"
          : message.role === "error"
            ? "✦ Relay Notice"
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
      message.text || message.content || "";

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

      const cardsContainer = document.createElement("div");
      cardsContainer.className = "relay-ai-issue-cards";
      planContainer.append(cardsContainer);

      const bulkActions = document.createElement("div");
      bulkActions.className = "relay-ai-issue-actions";

      const bulkCancelBtn = document.createElement("button");
      bulkCancelBtn.className = "relay-ai-btn relay-ai-btn-secondary";
      bulkCancelBtn.textContent = "Cancel All";
      bulkCancelBtn.type = "button";

      const bulkCreateBtn = document.createElement("button");
      bulkCreateBtn.className = "relay-ai-btn relay-ai-btn-primary";
      bulkCreateBtn.type = "button";

      const bulkInfoMsg = document.createElement("div");
      bulkInfoMsg.className = "relay-ai-issue-info";
      bulkInfoMsg.hidden = true;

      function updateBulkControls() {
        const remainingIssues = (message.issuePlan.issues || []).filter(issue => !issue._created);
        const count = remainingIssues.length;
        if (count === 0) {
          bulkActions.hidden = true;
          bulkInfoMsg.hidden = true;
        } else {
          bulkActions.hidden = false;
          bulkCreateBtn.textContent = `Create ${count} Issue${count === 1 ? '' : 's'}`;
        }
      }

      function renderIssueCard(issue, issueIndex) {
        const card = document.createElement("div");
        card.className = "relay-ai-issue-card";
        card.dataset.issueId = issue.id || String(issueIndex);

        let isEditing = false;
        let isConfirmingCancel = false;

        function refreshCard() {
          card.replaceChildren();

          if (issue._created) {
            // Already created state
            const titleLink = document.createElement("a");
            titleLink.className = "relay-ai-issue-title";
            titleLink.href = issue._createdUrl || "#";
            titleLink.target = "_blank";
            titleLink.textContent = "✅ #" + (issue._createdNumber || "") + " " + (issue.title || "Untitled Issue");

            const createdStatus = document.createElement("div");
            createdStatus.className = "relay-ai-issue-card-status relay-ai-issue-card-status-success";
            createdStatus.textContent = "Created in GitHub";
            createdStatus.style.marginTop = "6px";

            card.append(titleLink, createdStatus);
            return;
          }

          if (isEditing) {
            // Edit form view
            const editForm = document.createElement("div");
            editForm.className = "relay-ai-issue-edit-form";

            // Title field
            const titleRow = document.createElement("div");
            titleRow.className = "relay-ai-issue-edit-label-row";
            const titleLabel = document.createElement("span");
            titleLabel.className = "relay-ai-issue-edit-label-text";
            titleLabel.textContent = "Title";
            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.className = "relay-ai-issue-edit-input";
            titleInput.value = issue.title || "";
            titleRow.append(titleLabel, titleInput);

            // Grid for Type & Priority
            const gridRow = document.createElement("div");
            gridRow.className = "relay-ai-issue-edit-grid";

            const typeRow = document.createElement("div");
            typeRow.className = "relay-ai-issue-edit-label-row";
            const typeLabel = document.createElement("span");
            typeLabel.className = "relay-ai-issue-edit-label-text";
            typeLabel.textContent = "Type";
            const typeInput = document.createElement("input");
            typeInput.type = "text";
            typeInput.className = "relay-ai-issue-edit-input";
            typeInput.value = issue.issue_type || "task";
            typeRow.append(typeLabel, typeInput);

            const prioRow = document.createElement("div");
            prioRow.className = "relay-ai-issue-edit-label-row";
            const prioLabel = document.createElement("span");
            prioLabel.className = "relay-ai-issue-edit-label-text";
            prioLabel.textContent = "Priority";
            const prioInput = document.createElement("input");
            prioInput.type = "text";
            prioInput.className = "relay-ai-issue-edit-input";
            prioInput.value = issue.priority || "Medium";
            prioRow.append(prioLabel, prioInput);

            gridRow.append(typeRow, prioRow);

            // Description / Body textarea
            const bodyRow = document.createElement("div");
            bodyRow.className = "relay-ai-issue-edit-label-row";
            const bodyLabel = document.createElement("span");
            bodyLabel.className = "relay-ai-issue-edit-label-text";
            bodyLabel.textContent = "Description / Acceptance Criteria";
            const bodyTextarea = document.createElement("textarea");
            bodyTextarea.className = "relay-ai-issue-edit-input relay-ai-issue-edit-textarea";
            bodyTextarea.value = issue.body || "";
            bodyRow.append(bodyLabel, bodyTextarea);

            // Labels field
            const labelsRow = document.createElement("div");
            labelsRow.className = "relay-ai-issue-edit-label-row";
            const labelsLabel = document.createElement("span");
            labelsLabel.className = "relay-ai-issue-edit-label-text";
            labelsLabel.textContent = "Labels (comma-separated)";
            const labelsInput = document.createElement("input");
            labelsInput.type = "text";
            labelsInput.className = "relay-ai-issue-edit-input";
            labelsInput.value = Array.isArray(issue.labels) ? issue.labels.join(", ") : "";
            labelsRow.append(labelsLabel, labelsInput);

            // Assignees field
            const assigneesRow = document.createElement("div");
            assigneesRow.className = "relay-ai-issue-edit-label-row";
            const assigneesLabel = document.createElement("span");
            assigneesLabel.className = "relay-ai-issue-edit-label-text";
            assigneesLabel.textContent = "Assignee (GitHub username)";
            const assigneesInput = document.createElement("input");
            assigneesInput.type = "text";
            assigneesInput.className = "relay-ai-issue-edit-input";
            assigneesInput.value = Array.isArray(issue.assignees) ? issue.assignees.join(", ") : (issue.assignee || "");
            assigneesRow.append(assigneesLabel, assigneesInput);

            // Dependencies field
            const depsRow = document.createElement("div");
            depsRow.className = "relay-ai-issue-edit-label-row";
            const depsLabel = document.createElement("span");
            depsLabel.className = "relay-ai-issue-edit-label-text";
            depsLabel.textContent = "Dependencies (comma-separated IDs)";
            const depsInput = document.createElement("input");
            depsInput.type = "text";
            depsInput.className = "relay-ai-issue-edit-input";
            depsInput.value = Array.isArray(issue.dependencies) ? issue.dependencies.join(", ") : "";
            depsRow.append(depsLabel, depsInput);

            // Form Action Buttons
            const formActions = document.createElement("div");
            formActions.className = "relay-ai-issue-edit-actions";

            const cancelEditBtn = document.createElement("button");
            cancelEditBtn.type = "button";
            cancelEditBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
            cancelEditBtn.textContent = "Cancel";
            cancelEditBtn.addEventListener("click", () => {
              isEditing = false;
              refreshCard();
            });

            const saveEditBtn = document.createElement("button");
            saveEditBtn.type = "button";
            saveEditBtn.className = "relay-ai-btn relay-ai-btn-primary relay-ai-btn-sm";
            saveEditBtn.textContent = "Save Changes";
            saveEditBtn.addEventListener("click", () => {
              issue.title = titleInput.value.trim() || issue.title;
              issue.issue_type = typeInput.value.trim() || issue.issue_type;
              issue.priority = prioInput.value.trim() || issue.priority;
              issue.body = bodyTextarea.value;

              const rawLabels = labelsInput.value.split(",").map(s => s.trim()).filter(Boolean);
              issue.labels = rawLabels;

              const rawAssignees = assigneesInput.value.split(",").map(s => s.trim()).filter(Boolean);
              issue.assignees = rawAssignees;
              issue.assignee = rawAssignees[0] || null;

              const rawDeps = depsInput.value.split(",").map(s => s.trim()).filter(Boolean);
              issue.dependencies = rawDeps;

              if (typeof saveConversation === "function") saveConversation();
              isEditing = false;
              refreshCard();
            });

            formActions.append(cancelEditBtn, saveEditBtn);
            editForm.append(titleRow, gridRow, bodyRow, labelsRow, assigneesRow, depsRow, formActions);
            card.append(editForm);
            return;
          }

          // Normal Display View
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

          // =========================================================
          // ASSIGNEE RECOMMENDATION SECTION (ADVISORY INTELLIGENCE)
          // =========================================================
          const assignmentSec = document.createElement("div");
          assignmentSec.className = "relay-ai-assignment-section";

          const effectiveContext = (message && message.context && message.context.owner && message.context.repository)
            ? message.context
            : currentContext;

          const assignHeader = document.createElement("div");
          assignHeader.className = "relay-ai-assignment-header";

          const assignTitle = document.createElement("div");
          assignTitle.className = "relay-ai-assignment-title";
          assignTitle.textContent = "Assignee Recommendation";

          const profileBtn = document.createElement("button");
          profileBtn.type = "button";
          profileBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
          profileBtn.textContent = "Edit Dev Profile";
          profileBtn.addEventListener("click", () => {
            const modalCtx = effectiveContext || currentContext;
            openProfileModal(modalCtx);
          });

          assignHeader.append(assignTitle, profileBtn);
          assignmentSec.append(assignHeader);

          // Warnings container
          const warningsDiv = document.createElement("div");
          warningsDiv.className = "relay-ai-assignment-warnings";
          warningsDiv.hidden = true;
          assignmentSec.append(warningsDiv);

          // Top recommended spotlight container
          const topRecContainer = document.createElement("div");
          topRecContainer.className = "relay-ai-assignment-top-container";
          assignmentSec.append(topRecContainer);

          // Candidates container (other recommendations)
          const candidatesDiv = document.createElement("div");
          candidatesDiv.className = "relay-ai-assignment-candidates";
          assignmentSec.append(candidatesDiv);

          // Selected assignee badge / status
          const currentAssigneeBox = document.createElement("div");
          currentAssigneeBox.className = "relay-ai-candidate-actions";
          const currentAssigneeLabel = document.createElement("span");
          currentAssigneeLabel.style.fontSize = "11px";
          currentAssigneeLabel.style.color = "#9cb3d8";
          const chosen = (issue.assignees && issue.assignees[0]) || issue.assignee;
          currentAssigneeLabel.textContent = chosen ? `Selected Assignee: @${chosen}` : "No assignee selected (advisory)";
          currentAssigneeBox.append(currentAssigneeLabel);

          // Manual assignee select dropdown ("Choose another developer")
          const manualSelect = document.createElement("select");
          manualSelect.className = "relay-ai-assignee-manual-select";
          const defaultOpt = document.createElement("option");
          defaultOpt.value = "";
          defaultOpt.textContent = "-- Choose another developer / Override --";
          manualSelect.append(defaultOpt);

          manualSelect.addEventListener("change", () => {
            const selectedUser = manualSelect.value;
            if (selectedUser) {
              const matchedCandidate = (issue._recommendations || []).find(r => r.githubUsername === selectedUser);
              const isOverloadedCand = matchedCandidate && (matchedCandidate.isOverloaded || (matchedCandidate.criteria?.workloadAndEffort?.score <= 15) || (matchedCandidate.missingDataWarnings && matchedCandidate.missingDataWarnings.some(w => w.includes('capacity'))));
              const isLowFitCand = matchedCandidate && (matchedCandidate.overallScore < 45 || matchedCandidate.fitLevel === 'weak' || matchedCandidate.isRecommended === false);
              
              if (isOverloadedCand || isLowFitCand) {
                // Require confirmation
                issue._pendingOverrideConfirm = selectedUser;
              } else {
                issue.assignee = selectedUser;
                issue.assignees = [selectedUser];
                delete issue._pendingOverrideConfirm;
              }
            } else {
              issue.assignee = null;
              issue.assignees = [];
              delete issue._pendingOverrideConfirm;
            }
            if (typeof saveConversation === "function") saveConversation();
            refreshCard();
          });

          assignmentSec.append(currentAssigneeBox, manualSelect);

          // Fetch recommendations if not cached or already loaded
          if (issue._recommendations) {
            renderRecommendationsUI(issue._recommendations, issue._recommendationWarnings || []);
          } else if (RelayAIAssistant?.getAssignmentRecommendations && effectiveContext?.owner && effectiveContext?.repository) {
            const loadingText = document.createElement("div");
            loadingText.className = "relay-ai-assignment-loading";
            loadingText.textContent = "Analyzing developer fit and workload...";
            candidatesDiv.append(loadingText);

            RelayAIAssistant.getAssignmentRecommendations({
              title: issue.title,
              description: issue.body,
              requiredSkills: issue.labels || [],
              priority: issue.priority || 'Medium',
              risk: 'Low'
            }, effectiveContext).then(async (res) => {
              let data = null;
              try {
                data = await res.json();
              } catch (_) {}
              loadingText.remove();
              if (res.ok && data?.recommendations) {
                issue._recommendations = data.recommendations;
                issue._recommendationWarnings = data.warnings || [];
                renderRecommendationsUI(data.recommendations, data.warnings || []);
              } else {
                const warnMsg = data?.error || (res.status === 403 ? "GitHub permissions or Relay login required" : `Could not load recommendations (${res.status || 'Network Error'})`);
                const warn = document.createElement("div");
                warn.className = "relay-ai-assignment-warning";
                warn.textContent = "⚠ " + warnMsg;
                warningsDiv.hidden = false;
                warningsDiv.append(warn);

                const diagnosticText = document.createElement("div");
                diagnosticText.className = "relay-ai-assignment-loading relay-ai-assignment-insufficient";
                diagnosticText.textContent = `Diagnostic: ${warnMsg}. You can still select an assignee manually below.`;
                candidatesDiv.append(diagnosticText);
              }
            }).catch((err) => {
              loadingText.remove();
              const warn = document.createElement("div");
              warn.className = "relay-ai-assignment-warning";
              warn.textContent = "⚠ Could not connect to assignment service. Ensure extension is connected.";
              warningsDiv.hidden = false;
              warningsDiv.append(warn);

              const diagnosticText = document.createElement("div");
              diagnosticText.className = "relay-ai-assignment-loading relay-ai-assignment-insufficient";
              diagnosticText.textContent = "Diagnostic: Backend connection failed. Manual selection is still available below.";
              candidatesDiv.append(diagnosticText);
            });
          }

          function renderRecommendationsUI(recommendations, warnings) {
            topRecContainer.replaceChildren();
            candidatesDiv.replaceChildren();
            warningsDiv.replaceChildren();

            if (warnings && warnings.length > 0) {
              warningsDiv.hidden = false;
              for (const w of warnings) {
                const warn = document.createElement("div");
                warn.className = "relay-ai-assignment-warning";
                warn.textContent = "⚠ " + w;
                warningsDiv.append(warn);
              }
            }

            // Populate manualSelect options
            while (manualSelect.children.length > 1) {
              manualSelect.removeChild(manualSelect.lastChild);
            }
            for (const r of recommendations) {
              const opt = document.createElement("option");
              opt.value = r.githubUsername;
              const statusTag = r.isOverloaded || (r.criteria?.workloadAndEffort?.score <= 15) ? ' - Overloaded' : (r.overallScore < 45 ? ' - Low Fit' : '');
              opt.textContent = `@${r.githubUsername} (${r.overallScore}% fit${statusTag})`;
              if (r.githubUsername === chosen) opt.selected = true;
              manualSelect.append(opt);
            }

            if (!recommendations || recommendations.length === 0) {
              const emptyText = document.createElement("div");
              emptyText.className = "relay-ai-assignment-loading relay-ai-assignment-insufficient";
              emptyText.textContent = "Insufficient evidence: No eligible repository assignees or recommendations found.";
              candidatesDiv.append(emptyText);
              return;
            }

            // Determine recommendation fitness and appropriate badge
            const topCandidate = recommendations[0];
            const isInsufficientEvidence = topCandidate.confidence === 'Low' && (topCandidate.overallScore <= 35 || (topCandidate.missingDataWarnings && topCandidate.missingDataWarnings.length >= 2));
            const isOverloaded = topCandidate.isOverloaded || (topCandidate.criteria?.workloadAndEffort?.score <= 15) || (topCandidate.missingDataWarnings && topCandidate.missingDataWarnings.some(w => w.includes('meets or exceeds capacity')));
            const isLowFit = topCandidate.overallScore < 45 || topCandidate.fitLevel === 'weak' || (topCandidate.isRecommended === false && !isOverloaded);

            // Render top recommendation spotlight
            const topSpotlight = document.createElement("div");
            topSpotlight.className = "relay-ai-top-recommendation";

            const topHeader = document.createElement("div");
            topHeader.className = "relay-ai-candidate-top";

            const recBadge = document.createElement("span");
            if (isInsufficientEvidence) {
              recBadge.className = "relay-ai-badge relay-ai-badge-insufficient";
              recBadge.textContent = "Insufficient Evidence";
            } else if (isOverloaded) {
              recBadge.className = "relay-ai-badge relay-ai-badge-danger";
              recBadge.textContent = "⚠ Overloaded (Capacity Exceeded)";
            } else if (isLowFit) {
              recBadge.className = "relay-ai-badge relay-ai-badge-warning";
              recBadge.textContent = "No Strong Match";
            } else {
              recBadge.className = "relay-ai-badge relay-ai-badge-recommended";
              recBadge.textContent = "★ Recommended";
            }

            const topUser = document.createElement("span");
            topUser.className = "relay-ai-candidate-user";
            topUser.textContent = `@${topCandidate.githubUsername}`;

            const topScoreBadge = document.createElement("span");
            topScoreBadge.className = "relay-ai-candidate-score-badge";
            topScoreBadge.title = `Fit Score: ${topCandidate.overallScore}%. Evidence completeness: ${topCandidate.confidence}`;
            topScoreBadge.textContent = `${topCandidate.overallScore}% fit (Evidence: ${topCandidate.confidence})`;

            topHeader.append(recBadge, topUser, topScoreBadge);

            const topExplanation = document.createElement("p");
            topExplanation.className = "relay-ai-candidate-rationale";
            topExplanation.textContent = topCandidate.rationale || "Evaluated based on balanced team criteria.";

            // Unified Confirmation Box Builder helper
            function createUnifiedOverrideConfirmBox(candidate) {
              const box = document.createElement("div");
              box.className = "relay-ai-assignment-override-confirm";

              const candOverloaded = candidate.isOverloaded || (candidate.criteria?.workloadAndEffort?.score <= 15) || (candidate.missingDataWarnings && candidate.missingDataWarnings.some(w => w.includes('capacity')));
              const openTasks = candidate.criteria?.workloadAndEffort?.openAssignedIssues != null ? candidate.criteria.workloadAndEffort.openAssignedIssues : 5;
              const maxTasks = candidate.criteria?.workloadAndEffort?.maxConcurrentTasks != null ? candidate.criteria.workloadAndEffort.maxConcurrentTasks : 3;
              const skillScore = candidate.criteria?.technicalSkills?.score != null ? candidate.criteria.technicalSkills.score : 0;

              const overloadMsg = candOverloaded ? `Candidate is overloaded (${openTasks} open tasks vs ${maxTasks} capacity).` : '';
              const skillMsg = skillScore < 40 ? `Skill match is low (${skillScore}%).` : '';

              const riskWarning = document.createElement("p");
              riskWarning.textContent = `⚠ Risk Warning: ${overloadMsg} ${skillMsg} Deliberate override may cause delivery delays or quality issues.`;

              const btnRow = document.createElement("div");
              btnRow.className = "relay-ai-assignment-override-actions";

              const cancelBtn = document.createElement("button");
              cancelBtn.type = "button";
              cancelBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
              cancelBtn.textContent = "Cancel";
              cancelBtn.addEventListener("click", (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                delete issue._pendingOverrideConfirm;
                refreshCard();
              });

              const confirmOverrideBtn = document.createElement("button");
              confirmOverrideBtn.type = "button";
              confirmOverrideBtn.className = "relay-ai-btn relay-ai-btn-danger-outline relay-ai-btn-sm";
              confirmOverrideBtn.textContent = "I Understand the Risks, Assign Anyway";
              confirmOverrideBtn.addEventListener("click", (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                delete issue._pendingOverrideConfirm;
                issue.assignee = candidate.githubUsername;
                issue.assignees = [candidate.githubUsername];
                if (typeof saveConversation === "function") saveConversation();
                refreshCard();
              });

              btnRow.append(cancelBtn, confirmOverrideBtn);
              box.append(riskWarning, btnRow);
              return box;
            }

            // Action row: Approve assignment button or Override Warning
            const topActionRow = document.createElement("div");
            topActionRow.className = "relay-ai-top-actions";

            // If the top candidate is overloaded or weak fit, ordinary "Approve Assignment" is blocked.
            // A PM may only assign via an explicit override action with a clear confirmation dialog.
            const isUnqualified = isOverloaded || isLowFit || topCandidate.isRecommended === false;

            if (isUnqualified) {
              if (issue._pendingOverrideConfirm === topCandidate.githubUsername) {
                // Render unified override confirmation dialog in top spotlight
                const overrideBox = createUnifiedOverrideConfirmBox(topCandidate);
                topActionRow.append(overrideBox);
              } else {
                const overrideBtn = document.createElement("button");
                overrideBtn.type = "button";
                if (chosen === topCandidate.githubUsername) {
                  overrideBtn.className = "relay-ai-btn relay-ai-btn-sm relay-ai-btn-approved";
                  overrideBtn.textContent = "✓ Assigned via Override (Withdraw)";
                  overrideBtn.addEventListener("click", () => {
                    issue.assignee = null;
                    issue.assignees = [];
                    delete issue._pendingOverrideConfirm;
                    if (typeof saveConversation === "function") saveConversation();
                    refreshCard();
                  });
                } else {
                  overrideBtn.className = "relay-ai-btn relay-ai-btn-sm relay-ai-btn-override-warning";
                  overrideBtn.textContent = "⚠ Override Warning & Assign...";
                  overrideBtn.title = "Candidate is overloaded or low fit. Requires explicit PM risk acknowledgment.";
                  overrideBtn.addEventListener("click", () => {
                    issue._pendingOverrideConfirm = topCandidate.githubUsername;
                    refreshCard();
                  });
                }
                topActionRow.append(overrideBtn);
              }
            } else {
              // Qualified candidate: standard approval button
              const approveBtn = document.createElement("button");
              approveBtn.type = "button";
              approveBtn.className = "relay-ai-btn relay-ai-btn-sm " + (chosen === topCandidate.githubUsername ? "relay-ai-btn-approved" : "relay-ai-btn-primary");
              approveBtn.textContent = chosen === topCandidate.githubUsername ? "✓ Assignment Approved" : "Approve Assignment";
              approveBtn.addEventListener("click", () => {
                if (chosen === topCandidate.githubUsername) {
                  // Deselect / withdraw approval
                  issue.assignee = null;
                  issue.assignees = [];
                } else {
                  // Approve top recommendation
                  issue.assignee = topCandidate.githubUsername;
                  issue.assignees = [topCandidate.githubUsername];
                }
                delete issue._pendingOverrideConfirm;
                if (typeof saveConversation === "function") saveConversation();
                refreshCard();
              });
              topActionRow.append(approveBtn);
            }

            topSpotlight.append(topHeader, topExplanation, topActionRow);
            topRecContainer.append(topSpotlight);

            // Render all candidates (including breakdown & warnings)
            recommendations.slice(0, 3).forEach((candidate) => {
              const candCard = document.createElement("div");
              candCard.className = "relay-ai-candidate-card";
              if (candidate.githubUsername === chosen) {
                candCard.classList.add("relay-ai-candidate-selected");
              }

              const topRow = document.createElement("div");
              topRow.className = "relay-ai-candidate-top";

              const userLabel = document.createElement("span");
              userLabel.className = "relay-ai-candidate-user";
              userLabel.textContent = `@${candidate.githubUsername}`;

              const scoreBadge = document.createElement("span");
              scoreBadge.className = "relay-ai-candidate-score-badge";
              scoreBadge.title = `Fit Score: ${candidate.overallScore}%. Evidence completeness: ${candidate.confidence}`;

              const scoreText = document.createElement("span");
              scoreText.textContent = `${candidate.overallScore}% fit`;

              const confSpan = document.createElement("span");
              confSpan.className = "relay-ai-candidate-conf";
              confSpan.textContent = ` (Evidence: ${candidate.confidence})`;
              scoreBadge.append(scoreText, confSpan);

              if (candidate.isOverloaded || (candidate.criteria?.workloadAndEffort?.score <= 15)) {
                const ovBadge = document.createElement("span");
                ovBadge.className = "relay-ai-badge relay-ai-badge-danger";
                ovBadge.style.marginLeft = "6px";
                ovBadge.textContent = "Overloaded";
                scoreBadge.append(ovBadge);
              }

              topRow.append(userLabel, scoreBadge);

              const rationale = document.createElement("p");
              rationale.className = "relay-ai-candidate-rationale";
              rationale.textContent = candidate.rationale || "";

              // Missing evidence warnings for this candidate
              const candWarnings = candidate.missingDataWarnings || [];
              const candWarnDiv = document.createElement("div");
              if (candWarnings.length > 0) {
                candWarnDiv.className = "relay-ai-assignment-warnings";
                candWarnDiv.style.marginTop = "4px";
                for (const cw of candWarnings) {
                  const cwElem = document.createElement("div");
                  cwElem.className = "relay-ai-assignment-warning";
                  cwElem.textContent = cw;
                  candWarnDiv.append(cwElem);
                }
              }

              // Breakdown Toggle & Container
              const breakdownToggle = document.createElement("button");
              breakdownToggle.type = "button";
              breakdownToggle.className = "relay-ai-candidate-breakdown-toggle";
              breakdownToggle.textContent = "View Criteria Breakdown ▼";

              const breakdownDiv = document.createElement("div");
              breakdownDiv.className = "relay-ai-candidate-breakdown";
              breakdownDiv.hidden = true;

              const c = candidate.criteria || {};
              const items = [
                { label: 'Skills (30%)', val: c.technicalSkills?.score },
                { label: 'Workload (25%)', val: c.workloadAndEffort?.score },
                { label: 'Familiarity (20%)', val: c.repositoryFamiliarity?.score },
                { label: 'Availability (15%)', val: c.availabilityAndDeadlines?.score },
                { label: 'Growth/Fairness (10%)', val: c.growthAndFairness?.score }
              ];
              for (const it of items) {
                const bItem = document.createElement("div");
                bItem.className = "relay-ai-breakdown-item";
                bItem.textContent = `${it.label}: `;
                const bStrong = document.createElement("strong");
                bStrong.textContent = `${it.val != null ? it.val : '-'}%`;
                bItem.append(bStrong);
                breakdownDiv.append(bItem);
              }

              breakdownToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                breakdownDiv.hidden = !breakdownDiv.hidden;
                breakdownToggle.textContent = breakdownDiv.hidden ? "View Criteria Breakdown ▼" : "Hide Criteria Breakdown ▲";
              });

              // Click to select this candidate (requires explicit override confirmation if overloaded or low fit)
              candCard.addEventListener("click", () => {
                if (issue.assignee === candidate.githubUsername) {
                  // Deselect
                  issue.assignee = null;
                  issue.assignees = [];
                  delete issue._pendingOverrideConfirm;
                } else {
                  const candOverloaded = candidate.isOverloaded || (candidate.criteria?.workloadAndEffort?.score <= 15) || (candidate.missingDataWarnings && candidate.missingDataWarnings.some(w => w.includes('capacity')));
                  const candLowFit = candidate.overallScore < 45 || candidate.fitLevel === 'weak' || candidate.isRecommended === false;
                  if (candOverloaded || candLowFit) {
                    // Activate override confirmation
                    issue._pendingOverrideConfirm = candidate.githubUsername;
                  } else {
                    issue.assignee = candidate.githubUsername;
                    issue.assignees = [candidate.githubUsername];
                    delete issue._pendingOverrideConfirm;
                  }
                }
                if (typeof saveConversation === "function") saveConversation();
                refreshCard();
              });

              // Only render card confirmation box if this candidate is NOT the top candidate
              // (because the top candidate already renders its confirmation in the spotlight above)
              const isTop = (candidate.githubUsername === topCandidate.githubUsername);
              if (!isTop && issue._pendingOverrideConfirm === candidate.githubUsername) {
                const cardOverrideBox = createUnifiedOverrideConfirmBox(candidate);
                candCard.append(cardOverrideBox);
              }

              candCard.append(topRow, rationale);
              if (candWarnings.length > 0) candCard.append(candWarnDiv);
              candCard.append(breakdownToggle, breakdownDiv);
              candidatesDiv.append(candCard);
            });
          }

          card.append(assignmentSec);

          // Individual Card Action Bar
          const cardActions = document.createElement("div");
          cardActions.className = "relay-ai-issue-card-actions";

          const cardStatus = document.createElement("span");
          cardStatus.className = "relay-ai-issue-card-status";
          cardActions.append(cardStatus);

          if (isConfirmingCancel) {
            const confirmBox = document.createElement("div");
            confirmBox.className = "relay-ai-issue-cancel-confirm";

            const confirmMsg = document.createElement("span");
            confirmMsg.textContent = "Cancel this issue?";

            const confirmYesBtn = document.createElement("button");
            confirmYesBtn.type = "button";
            confirmYesBtn.className = "relay-ai-btn relay-ai-btn-danger-outline relay-ai-btn-sm";
            confirmYesBtn.textContent = "Yes, Remove";
            confirmYesBtn.addEventListener("click", () => {
              const idx = message.issuePlan.issues.indexOf(issue);
              if (idx !== -1) {
                message.issuePlan.issues.splice(idx, 1);
              }
              card.remove();
              if (typeof saveConversation === "function") saveConversation();
              updateBulkControls();
              if (message.issuePlan.issues.length === 0) {
                planContainer.remove();
              }
            });

            const confirmNoBtn = document.createElement("button");
            confirmNoBtn.type = "button";
            confirmNoBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
            confirmNoBtn.textContent = "Keep";
            confirmNoBtn.addEventListener("click", () => {
              isConfirmingCancel = false;
              refreshCard();
            });

            confirmBox.append(confirmMsg, confirmYesBtn, confirmNoBtn);
            cardActions.append(confirmBox);
          } else {
            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
              isEditing = true;
              refreshCard();
            });

            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
            cancelBtn.textContent = "Cancel";
            cancelBtn.addEventListener("click", () => {
              isConfirmingCancel = true;
              refreshCard();
            });

            const createBtn = document.createElement("button");
            createBtn.type = "button";
            createBtn.className = "relay-ai-btn relay-ai-btn-primary relay-ai-btn-sm";
            createBtn.textContent = "Create";

            createBtn.addEventListener("click", async () => {
              if (issue._creating || issue._created) return;
              issue._creating = true;

              createBtn.disabled = true;
              editBtn.disabled = true;
              cancelBtn.disabled = true;
              cardStatus.className = "relay-ai-issue-card-status";
              cardStatus.textContent = "Creating...";

              try {
                const singlePlan = {
                  issues: [{
                    id: issue.id,
                    issue_type: issue.issue_type,
                    title: issue.title,
                    body: issue.body,
                    labels: issue.labels,
                    priority: issue.priority,
                    dependencies: issue.dependencies,
                    assignees: Array.isArray(issue.assignees) ? issue.assignees : (issue.assignee ? [issue.assignee] : [])
                  }]
                };

                const effectiveContext = (message && message.context && message.context.owner && message.context.repository)
                  ? message.context
                  : currentContext;

                if (!effectiveContext || !effectiveContext.owner || !effectiveContext.repository) {
                  throw new Error("No repository selected. Please open or select a repository first.");
                }

                const res = await RelayAIAssistant.createIssue(singlePlan, effectiveContext);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Server error " + res.status);

                const result = data.results && data.results[0];
                if (result && result.status === 'success') {
                  issue._created = true;
                  issue._creating = false;
                  issue._createdNumber = result.number;
                  issue._createdUrl = result.url;
                  if (typeof saveConversation === "function") saveConversation();
                  updateBulkControls();
                  refreshCard();
                } else {
                  throw new Error(result?.error || "Creation failed");
                }
              } catch (err) {
                issue._creating = false;
                createBtn.disabled = false;
                editBtn.disabled = false;
                cancelBtn.disabled = false;
                cardStatus.className = "relay-ai-issue-card-status relay-ai-issue-card-status-error";
                cardStatus.textContent = err.message || "Error";
              }
            });

            cardActions.append(editBtn, cancelBtn, createBtn);
          }

          card.append(cardActions);
        }

        refreshCard();
        return card;
      }



      // Render cards
      message.issuePlan.issues.forEach((issue, idx) => {
        cardsContainer.append(renderIssueCard(issue, idx));
      });

      bulkCreateBtn.addEventListener("click", async () => {
        const pendingIssues = (message.issuePlan.issues || []).filter(issue => !issue._created && !issue._creating);
        if (pendingIssues.length === 0) return;

        bulkInfoMsg.hidden = false;
        bulkInfoMsg.textContent = "Creating issues...";
        bulkInfoMsg.className = "relay-ai-issue-info";
        bulkCreateBtn.disabled = true;
        bulkCancelBtn.disabled = true;

        try {
          const bulkPlan = {
            issues: pendingIssues.map(issue => ({
              id: issue.id,
              issue_type: issue.issue_type,
              title: issue.title,
              body: issue.body,
              labels: issue.labels,
              priority: issue.priority,
              dependencies: issue.dependencies,
              assignees: Array.isArray(issue.assignees) ? issue.assignees : (issue.assignee ? [issue.assignee] : [])
            }))
          };
          const effectiveContext = (message && message.context && message.context.owner && message.context.repository)
            ? message.context
            : currentContext;

          if (!effectiveContext || !effectiveContext.owner || !effectiveContext.repository) {
            throw new Error("No repository selected. Please open or select a repository first.");
          }

          const res = await RelayAIAssistant.createIssue(bulkPlan, effectiveContext);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Server error " + res.status);

          for (const result of data.results || []) {
            const matched = pendingIssues.find(i => i.title === result.title);
            if (matched) {
              if (result.status === 'success') {
                matched._created = true;
                matched._createdNumber = result.number;
                matched._createdUrl = result.url;
              }
            }
          }

          if (typeof saveConversation === "function") saveConversation();

          cardsContainer.replaceChildren();
          for (const issue of message.issuePlan.issues) {
            cardsContainer.append(renderIssueCard(issue, message.issuePlan.issues.indexOf(issue)));
          }

          bulkInfoMsg.hidden = true;
          updateBulkControls();
        } catch (err) {
          bulkInfoMsg.textContent = "Failed to create issues: " + err.message;
          bulkInfoMsg.style.color = "var(--relay-ai-danger)";
          bulkCreateBtn.disabled = false;
          bulkCancelBtn.disabled = false;
        }
      });

      bulkCancelBtn.addEventListener("click", () => {
        planContainer.remove();
      });

      bulkActions.append(bulkCancelBtn, bulkCreateBtn);
      planContainer.append(bulkActions, bulkInfoMsg);
      updateBulkControls();

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
    .then(async r => {
      if (!r.ok) {
        let msg = "Unable to load repositories";
        try {
          const errData = await r.json();
          if (errData && errData.error) msg = errData.error;
        } catch { /* use default message */ }
        throw new Error(msg);
      }
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
    .catch((err) => {
      loadingState.remove();
      const errorState = document.createElement("div");
      errorState.className = "relay-ai-repository-error";
      errorState.textContent = (err && err.message) ? err.message : "Unable to load repositories";
      
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
      "You can paste a GitHub repository URL, for example github.com/your-username/your-repository";


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

  function setAuthState(isAuthenticated) {
    if (ui["auth-unauthenticated"] && ui["auth-authenticated"]) {
      ui["auth-unauthenticated"].hidden = isAuthenticated;
      ui["auth-authenticated"].hidden = !isAuthenticated;
    }
    if (ui["status-dot"]) {
      if (isAuthenticated) {
        ui["status-dot"].classList.add("relay-ai-status-dot-active");
      } else {
        ui["status-dot"].classList.remove("relay-ai-status-dot-active");
      }
    }
  }

  // Restore cached auth state immediately to avoid UI flicker on panel reopen
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.get(["relay_auth_connected"], (res) => {
      if (res?.relay_auth_connected) {
        setAuthState(true);
      }
    });
  }

  if (ui.connect) {
    ui.connect.addEventListener('click', async (e) => {
      e.preventDefault();
      if (ui["auth-authenticated"] && !ui["auth-authenticated"].hidden) {
        return;
      }
      if (globalThis.chrome?.storage?.local) {
        const cached = await new Promise(r => chrome.storage.local.get(["relay_auth_connected"], r));
        if (cached?.relay_auth_connected) {
          setAuthState(true);
          return;
        }
      }
      if (typeof RelayAIAssistant?.checkAuth === 'function') {
        try {
          const isAuthed = await RelayAIAssistant.checkAuth();
          if (isAuthed) {
            setAuthState(true);
            if (globalThis.chrome?.storage?.local) {
              chrome.storage.local.set({ relay_auth_connected: true });
            }
            return;
          }
        } catch {
          // If checkAuth fails with temporary network issue, proceed to login attempt
        }
      }
      try {
        const result = await RelayAIAssistant.login();
        appendMessage({ role: 'system', content: 'Successfully signed in as ' + result.username + '. Relay is connected.' });
        setAuthState(true);
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.set({ relay_auth_connected: true });
        }
      } catch (err) {
        appendMessage({ role: 'error', content: err.message });
      }
    });
  }

  if (ui.logout) {
    ui.logout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await RelayAIAssistant.logout();
        setAuthState(false);
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.remove("relay_auth_connected");
        }
      } catch (err) {
        appendMessage({ role: 'error', content: err.message });
      }
    });
  }

  // Validate actual backend session or valid session cookie
  if (typeof RelayAIAssistant?.checkAuth === 'function') {
    RelayAIAssistant.checkAuth().then(isAuthenticated => {
      if (isAuthenticated === true) {
        setAuthState(true);
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.set({ relay_auth_connected: true });
        }
      } else if (isAuthenticated === false) {
        // Only clear state if explicitly reported as unauthenticated (e.g. 401 Unauthorized)
        setAuthState(false);
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.remove("relay_auth_connected");
        }
      }
    }).catch(() => {
      // Do not treat temporary network check failures or API errors as Logout
    });
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
    ["history-view", "health-view", "traceability-view", "reports-view", "preferences-view", "about-view"].forEach(id => {
      if (ui[id]) ui[id].classList.add("hidden");
    });
    
    if (viewElement) {
      viewElement.classList.remove("hidden");
    }
  }

  // Traceability Matrix View
  if (ui["gear-traceability"]) {
    ui["gear-traceability"].addEventListener("click", async () => {
      openView(ui["traceability-view"]);
      await loadTraceability();
    });
  }
  if (ui["back-traceability"]) {
    ui["back-traceability"].addEventListener("click", () => openView(null));
  }

  // PM Reports & Delivery Forecasting View
  if (ui["gear-reports"]) {
    ui["gear-reports"].addEventListener("click", async () => {
      openView(ui["reports-view"]);
      await loadPmReports();
    });
  }
  if (ui["back-reports"]) {
    ui["back-reports"].addEventListener("click", () => openView(null));
  }

  // Project Health Intelligence View
  if (ui["gear-health"]) {
    ui["gear-health"].addEventListener("click", async () => {
      openView(ui["health-view"]);
      await loadProjectHealth();
    });
  }
  if (ui["back-health"]) {
    ui["back-health"].addEventListener("click", () => openView(null));
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

  // Developer Profile Settings
  if (ui["gear-profile"]) {
    ui["gear-profile"].addEventListener("click", () => {
      if (ui["gear-menu"]) ui["gear-menu"].classList.add("hidden");
      if (ui["gear"]) ui["gear"].classList.remove("active");
      openProfileModal(currentContext);
    });
  }

  // Modal helper for editing developer profile
  function openProfileModal(context) {
    const overlay = document.createElement("div");
    overlay.className = "relay-ai-profile-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "relay-ai-profile-modal";

    const mTitle = document.createElement("h4");
    mTitle.textContent = "Developer Profile Settings";

    const form = document.createElement("div");
    form.className = "relay-ai-issue-edit-form";

    // Skills row
    const sRow = document.createElement("div");
    sRow.className = "relay-ai-issue-edit-label-row";
    const sLabel = document.createElement("span");
    sLabel.className = "relay-ai-issue-edit-label-text";
    sLabel.textContent = "Declared Skills (comma-separated)";
    const skillsIn = document.createElement("input");
    skillsIn.type = "text";
    skillsIn.className = "relay-ai-issue-edit-input";
    skillsIn.placeholder = "e.g. react, node.js, postgresql";
    sRow.append(sLabel, skillsIn);

    // Capacity and tasks grid
    const grid = document.createElement("div");
    grid.className = "relay-ai-issue-edit-grid";

    const capRow = document.createElement("div");
    capRow.className = "relay-ai-issue-edit-label-row";
    const capLabel = document.createElement("span");
    capLabel.className = "relay-ai-issue-edit-label-text";
    capLabel.textContent = "Weekly Capacity (hours)";
    const capIn = document.createElement("input");
    capIn.type = "number";
    capIn.className = "relay-ai-issue-edit-input";
    capIn.value = "40";
    capRow.append(capLabel, capIn);

    const tasksRow = document.createElement("div");
    tasksRow.className = "relay-ai-issue-edit-label-row";
    const tasksLabel = document.createElement("span");
    tasksLabel.className = "relay-ai-issue-edit-label-text";
    tasksLabel.textContent = "Max Concurrent Tasks";
    const maxTasksIn = document.createElement("input");
    maxTasksIn.type = "number";
    maxTasksIn.className = "relay-ai-issue-edit-input";
    maxTasksIn.value = "3";
    tasksRow.append(tasksLabel, maxTasksIn);

    grid.append(capRow, tasksRow);

    // Availability row
    const availRow = document.createElement("div");
    availRow.className = "relay-ai-issue-edit-label-row";
    const availLabel = document.createElement("span");
    availLabel.className = "relay-ai-issue-edit-label-text";
    availLabel.textContent = "Availability";
    const availIn = document.createElement("select");
    availIn.className = "relay-ai-issue-edit-input";
    const optAvail = document.createElement("option");
    optAvail.value = "true";
    optAvail.textContent = "Available for Tasks";
    const optUnavail = document.createElement("option");
    optUnavail.value = "false";
    optUnavail.textContent = "Unavailable / Away";
    availIn.append(optAvail, optUnavail);
    availRow.append(availLabel, availIn);

    // Focus row
    const fRow = document.createElement("div");
    fRow.className = "relay-ai-issue-edit-label-row";
    const fLabel = document.createElement("span");
    fLabel.className = "relay-ai-issue-edit-label-text";
    fLabel.textContent = "Current Focus";
    const focusIn = document.createElement("input");
    focusIn.type = "text";
    focusIn.className = "relay-ai-issue-edit-input";
    focusIn.placeholder = "e.g. Backend API";
    fRow.append(fLabel, focusIn);

    // Status
    const statusSpan = document.createElement("div");
    statusSpan.className = "relay-ai-issue-card-status";
    statusSpan.style.marginTop = "4px";

    // Action buttons
    const modalActions = document.createElement("div");
    modalActions.className = "relay-ai-issue-edit-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "relay-ai-btn relay-ai-btn-secondary relay-ai-btn-sm";
    cancelBtn.textContent = "Cancel";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "relay-ai-btn relay-ai-btn-primary relay-ai-btn-sm";
    saveBtn.textContent = "Save Profile";

    modalActions.append(cancelBtn, saveBtn);
    form.append(sRow, grid, availRow, fRow, statusSpan, modalActions);
    modal.append(mTitle, form);

    overlay.append(modal);
    document.body.append(overlay);

    cancelBtn.addEventListener("click", () => overlay.remove());

    // Preload current profile
    const effectiveModalContext = context || currentContext;
    if (!effectiveModalContext?.owner || !effectiveModalContext?.repository) {
      statusSpan.className = "relay-ai-issue-card-status";
      statusSpan.textContent = "Default profile values shown (no repository selected).";
    } else if (RelayAIAssistant?.getDeveloperProfile) {
      statusSpan.className = "relay-ai-issue-card-status";
      statusSpan.textContent = "Loading current profile...";
      RelayAIAssistant.getDeveloperProfile(effectiveModalContext).then(async (res) => {
        let data = null;
        try {
          data = await res.json();
        } catch (_) {}

        if (!res.ok) {
          statusSpan.className = "relay-ai-issue-card-status relay-ai-issue-card-status-error";
          statusSpan.textContent = data?.error || `Unable to load profile (HTTP ${res.status}). Using defaults.`;
          return;
        }

        if (data?.profile) {
          const p = data.profile;
          if (Array.isArray(p.declared_skills)) skillsIn.value = p.declared_skills.join(", ");
          if (p.weekly_capacity_hours != null) capIn.value = String(p.weekly_capacity_hours);
          if (p.max_concurrent_tasks != null) maxTasksIn.value = String(p.max_concurrent_tasks);
          availIn.value = p.is_available ? "true" : "false";
          if (p.current_focus) focusIn.value = p.current_focus;
          statusSpan.className = "relay-ai-issue-card-status relay-ai-issue-card-status-success";
          statusSpan.textContent = "Profile loaded.";
        } else {
          // Valid empty/default profile state
          statusSpan.className = "relay-ai-issue-card-status";
          statusSpan.textContent = "No saved profile found for this project. Set your skills below.";
        }
      }).catch((err) => {
        statusSpan.className = "relay-ai-issue-card-status relay-ai-issue-card-status-error";
        statusSpan.textContent = `Could not connect to profile service (${err.message || 'Network error'}). Using defaults.`;
      });
    }

    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      statusSpan.className = "relay-ai-issue-card-status";
      statusSpan.textContent = "Saving...";

      const declaredSkills = skillsIn.value.split(",").map(s => s.trim()).filter(Boolean);
      const weeklyCapacityHours = parseInt(capIn.value, 10) || 40;
      const maxConcurrentTasks = parseInt(maxTasksIn.value, 10) || 3;
      const isAvailable = availIn.value === "true";
      const currentFocus = focusIn.value.trim() || null;

      try {
        const res = await RelayAIAssistant.upsertDeveloperProfile({
          declaredSkills,
          weeklyCapacityHours,
          maxConcurrentTasks,
          isAvailable,
          currentFocus
        }, effectiveModalContext);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Save failed");

        statusSpan.className = "relay-ai-issue-card-status relay-ai-issue-card-status-success";
        statusSpan.textContent = "Profile saved successfully!";

        // Invalidate stale recommendation cache on any open issue plans so new profile takes effect immediately
        for (const msg of state.messages) {
          if (msg.issuePlan?.issues) {
            for (const issue of msg.issuePlan.issues) {
              delete issue._recommendations;
              delete issue._recommendationWarnings;
            }
          }
        }
        renderConversation(true);

        setTimeout(() => {
          overlay.remove();
        }, 800);
      } catch (err) {
        saveBtn.disabled = false;
        statusSpan.className = "relay-ai-issue-card-status relay-ai-issue-card-status-error";
        statusSpan.textContent = err.message || "Failed to save profile";
      }
    });
  }

  // Project Health Intelligence fetch and render
  async function loadProjectHealth() {
    if (!ui["health-loading"] || !ui["health-body"]) return;

    ui["health-loading"].classList.remove("hidden");
    ui["health-loading"].textContent = "Analyzing project health…";
    ui["health-body"].classList.add("hidden");
    ui["health-body"].replaceChildren();

    const effectiveContext = currentContext;
    if (!effectiveContext?.owner || !effectiveContext?.repository) {
      ui["health-loading"].textContent = "Please select or navigate to a GitHub repository to evaluate project health.";
      return;
    }

    if (!RelayAIAssistant?.getProjectHealth) {
      ui["health-loading"].textContent = "Health service client is unavailable.";
      return;
    }

    try {
      const res = await RelayAIAssistant.getProjectHealth(effectiveContext);
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}

      if (!res.ok) {
        ui["health-loading"].textContent = data?.error || `Unable to load project health (HTTP ${res.status}).`;
        return;
      }

      ui["health-loading"].classList.add("hidden");
      ui["health-body"].classList.remove("hidden");

      const health = data.health;
      if (!health) {
        ui["health-body"].textContent = "No project health data returned.";
        return;
      }

      // Container
      const container = document.createElement("div");
      container.className = "relay-ai-health-container";

      // 1. Overall Status Banner
      const banner = document.createElement("div");
      const statusClass = health.overallStatus === "healthy" ? "healthy" :
                          health.overallStatus === "needs_attention" ? "attention" : "risk";
      banner.className = `relay-ai-health-banner relay-ai-health-banner-${statusClass}`;

      const bannerTop = document.createElement("div");
      bannerTop.className = "relay-ai-health-banner-top";
      const badge = document.createElement("span");
      badge.className = `relay-ai-health-status-badge relay-ai-health-status-badge-${statusClass}`;
      badge.textContent = health.overallStatus === "healthy" ? "HEALTHY" :
                          health.overallStatus === "needs_attention" ? "NEEDS ATTENTION" : "AT RISK";

      const repoSpan = document.createElement("span");
      repoSpan.className = "relay-ai-health-repo-label";
      repoSpan.textContent = `${effectiveContext.owner}/${effectiveContext.repository}`;
      bannerTop.append(badge, repoSpan);

      const bannerSummary = document.createElement("div");
      bannerSummary.className = "relay-ai-health-summary-metrics";
      const s = health.summary || {};

      const metrics = [
        { count: s.totalOpenIssues || 0, label: "Open Issues", cls: "" },
        { count: s.totalOpenPulls || 0, label: "Open PRs", cls: "" },
        { count: s.overdueCount || 0, label: "Overdue", cls: s.overdueCount > 0 ? "text-danger" : "" },
        { count: s.stalledCount || 0, label: "Stalled", cls: s.stalledCount > 0 ? "text-warning" : "" },
        { count: s.blockedCount || 0, label: "Blocked", cls: s.blockedCount > 0 ? "text-danger" : "" }
      ];

      for (const m of metrics) {
        const item = document.createElement("div");
        item.className = `relay-ai-metric-item ${m.cls}`.trim();
        const strong = document.createElement("strong");
        strong.textContent = String(m.count);
        const labelSpan = document.createElement("span");
        labelSpan.textContent = " " + m.label;
        item.append(strong, labelSpan);
        bannerSummary.append(item);
      }
      banner.append(bannerTop, bannerSummary);
      container.append(banner);

      // 2. Risk Explanations
      if (Array.isArray(health.riskExplanations) && health.riskExplanations.length > 0) {
        const riskSec = document.createElement("div");
        riskSec.className = "relay-ai-health-section";
        const rTitle = document.createElement("h3");
        rTitle.textContent = "Risk Analysis";
        const rList = document.createElement("ul");
        rList.className = "relay-ai-health-risk-list";
        for (const exp of health.riskExplanations) {
          const li = document.createElement("li");
          li.textContent = exp;
          rList.append(li);
        }
        riskSec.append(rTitle, rList);
        container.append(riskSec);
      }

      // 3. Recommended Next Actions
      if (Array.isArray(health.recommendedActions) && health.recommendedActions.length > 0) {
        const recSec = document.createElement("div");
        recSec.className = "relay-ai-health-section";
        const recTitle = document.createElement("h3");
        recTitle.textContent = "Recommended Next Actions";
        const recList = document.createElement("div");
        recList.className = "relay-ai-health-actions-list";

        for (const action of health.recommendedActions) {
          const card = document.createElement("div");
          card.className = "relay-ai-action-card";

          const cardHeader = document.createElement("div");
          cardHeader.className = "relay-ai-action-header";
          const aTitle = document.createElement("strong");
          aTitle.textContent = action.title;
          cardHeader.append(aTitle);

          const aReason = document.createElement("p");
          aReason.className = "relay-ai-action-reason";
          aReason.textContent = action.reason;

          const inspectLink = document.createElement("a");
          inspectLink.className = "relay-ai-action-link";
          inspectLink.href = action.url;
          inspectLink.target = "_blank";
          inspectLink.rel = "noopener noreferrer";
          inspectLink.textContent = "Inspect on GitHub ↗";

          card.append(cardHeader, aReason, inspectLink);
          recList.append(card);
        }
        recSec.append(recTitle, recList);
        container.append(recSec);
      }

      // 4. Critical & Stalled Issues Table
      if (Array.isArray(health.criticalIssues) && health.criticalIssues.length > 0) {
        const issuesSec = document.createElement("div");
        issuesSec.className = "relay-ai-health-section";
        const iTitle = document.createElement("h3");
        iTitle.textContent = "Flagged Issues & Tasks";
        const iList = document.createElement("div");
        iList.className = "relay-ai-health-items-list";

        for (const item of health.criticalIssues) {
          const iCard = document.createElement("div");
          iCard.className = `relay-ai-health-item-card severity-${item.severity || 'medium'}`;

          const iHeader = document.createElement("div");
          iHeader.className = "relay-ai-health-item-header";
          const iName = document.createElement("strong");
          iName.textContent = `#${item.number}: ${item.title}`;
          const iBadge = document.createElement("span");
          iBadge.className = `relay-ai-badge relay-ai-badge-${item.type === 'overdue_issue' ? 'danger' : 'warning'}`;
          iBadge.textContent = item.type === 'overdue_issue' ? 'Overdue' :
                               item.type === 'stalled_issue' ? 'Stalled' : 'Blocked';
          iHeader.append(iName, iBadge);

          const iExp = document.createElement("p");
          iExp.className = "relay-ai-health-item-exp";
          iExp.textContent = item.explanation;

          const iLink = document.createElement("a");
          iLink.className = "relay-ai-action-link";
          iLink.href = item.url;
          iLink.target = "_blank";
          iLink.rel = "noopener noreferrer";
          iLink.textContent = `Inspect Issue #${item.number} ↗`;

          iCard.append(iHeader, iExp, iLink);
          iList.append(iCard);
        }
        issuesSec.append(iTitle, iList);
        container.append(issuesSec);
      }

      // 5. Workload Concerns
      if (Array.isArray(health.workloadConcerns) && health.workloadConcerns.length > 0) {
        const wSec = document.createElement("div");
        wSec.className = "relay-ai-health-section";
        const wTitle = document.createElement("h3");
        wTitle.textContent = "Workload & Capacity";
        const wList = document.createElement("div");
        wList.className = "relay-ai-health-items-list";

        for (const w of health.workloadConcerns) {
          const wCard = document.createElement("div");
          wCard.className = `relay-ai-health-item-card severity-${w.severity || 'medium'}`;
          const wHeader = document.createElement("div");
          wHeader.className = "relay-ai-health-item-header";
          const wName = document.createElement("strong");
          wName.textContent = `@${w.username}`;
          const wBadge = document.createElement("span");
          wBadge.className = "relay-ai-badge relay-ai-badge-warning";
          wBadge.textContent = w.type === 'overallocated' ? 'Overallocated' : 'Unavailable';
          wHeader.append(wName, wBadge);

          const wExp = document.createElement("p");
          wExp.className = "relay-ai-health-item-exp";
          wExp.textContent = w.explanation;

          wCard.append(wHeader, wExp);
          wList.append(wCard);
        }
        wSec.append(wTitle, wList);
        container.append(wSec);
      }

      // 6. Pull Request Attention
      if (Array.isArray(health.prConcerns) && health.prConcerns.length > 0) {
        const prSec = document.createElement("div");
        prSec.className = "relay-ai-health-section";
        const prTitle = document.createElement("h3");
        prTitle.textContent = "Pull Requests Requiring Attention";
        const prList = document.createElement("div");
        prList.className = "relay-ai-health-items-list";

        for (const pr of health.prConcerns) {
          const prCard = document.createElement("div");
          prCard.className = `relay-ai-health-item-card severity-${pr.severity || 'medium'}`;
          const prHeader = document.createElement("div");
          prHeader.className = "relay-ai-health-item-header";
          const prName = document.createElement("strong");
          prName.textContent = `PR #${pr.number}: ${pr.title}`;
          const prBadge = document.createElement("span");
          prBadge.className = `relay-ai-badge relay-ai-badge-${pr.type === 'ci_failed' ? 'danger' : 'warning'}`;
          prBadge.textContent = pr.type === 'ci_failed' ? 'CI Checks Failing' : 'Awaiting Review';
          prHeader.append(prName, prBadge);

          const prExp = document.createElement("p");
          prExp.className = "relay-ai-health-item-exp";
          prExp.textContent = pr.explanation;

          const prLink = document.createElement("a");
          prLink.className = "relay-ai-action-link";
          prLink.href = pr.url;
          prLink.target = "_blank";
          prLink.rel = "noopener noreferrer";
          prLink.textContent = `Inspect PR #${pr.number} ↗`;

          prCard.append(prHeader, prExp, prLink);
          prList.append(prCard);
        }
        prSec.append(prTitle, prList);
        container.append(prSec);
      }

      ui["health-body"].append(container);

    } catch (err) {
      ui["health-loading"].classList.remove("hidden");
      ui["health-loading"].textContent = `Health check request failed: ${err.message || 'Network error'}`;
    }
  }

  // Traceability Matrix fetch and render
  async function loadTraceability() {
    if (!ui["traceability-loading"] || !ui["traceability-body"]) return;

    ui["traceability-loading"].classList.remove("hidden");
    ui["traceability-loading"].hidden = false;
    ui["traceability-loading"].textContent = "Building requirements traceability matrix…";
    ui["traceability-body"].classList.add("hidden");
    ui["traceability-body"].hidden = true;
    ui["traceability-body"].replaceChildren();

    const effectiveContext = currentContext;
    if (!effectiveContext?.owner || !effectiveContext?.repository) {
      ui["traceability-loading"].textContent = "Please select or navigate to a GitHub repository to inspect traceability.";
      return;
    }

    if (!RelayAIAssistant?.getTraceability) {
      ui["traceability-loading"].textContent = "Traceability service client is unavailable.";
      return;
    }

    try {
      const res = await RelayAIAssistant.getTraceability(effectiveContext);
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}

      if (!res.ok) {
        ui["traceability-loading"].textContent = data?.error || `Unable to load traceability matrix (HTTP ${res.status}).`;
        return;
      }

      ui["traceability-loading"].classList.add("hidden");
      ui["traceability-loading"].hidden = true;
      ui["traceability-body"].classList.remove("hidden");
      ui["traceability-body"].hidden = false;

      const reqs = data.traceability || [];
      const gaps = data.gaps || {};
      const summary = data.summary || {};

      const container = document.createElement("div");
      container.className = "relay-ai-traceability-container";

      // 1. Overall Traceability Summary Banner
      const banner = document.createElement("div");
      banner.className = "relay-ai-traceability-banner";

      const bannerTop = document.createElement("div");
      bannerTop.className = "relay-ai-traceability-banner-top";

      const badge = document.createElement("span");
      const isHealthyVerification = (summary.verificationRate || 0) >= 70;
      badge.className = `relay-ai-traceability-status-badge ${isHealthyVerification ? 'verified' : summary.totalGaps > 0 ? 'gap' : 'in_progress'}`;
      badge.textContent = `${summary.verificationRate || 0}% VERIFIED`;

      const repoSpan = document.createElement("span");
      repoSpan.className = "relay-ai-health-repo-label";
      repoSpan.textContent = `${effectiveContext.owner}/${effectiveContext.repository}`;
      bannerTop.append(badge, repoSpan);

      const bannerSummary = document.createElement("div");
      bannerSummary.className = "relay-ai-traceability-summary-metrics";

      const metrics = [
        { count: summary.totalRequirements || 0, label: "Requirements", cls: "" },
        { count: summary.verifiedCount || 0, label: "Verified", cls: "text-success" },
        { count: summary.deliveredUnverifiedCount || 0, label: "Unverified", cls: "text-warning" },
        { count: summary.inProgressCount || 0, label: "In Progress", cls: "" },
        { count: summary.totalGaps || 0, label: "Delivery Gaps", cls: summary.totalGaps > 0 ? "text-danger" : "" }
      ];

      for (const m of metrics) {
        const item = document.createElement("div");
        item.className = `relay-ai-metric-item ${m.cls}`.trim();
        const strong = document.createElement("strong");
        strong.textContent = String(m.count);
        const labelSpan = document.createElement("span");
        labelSpan.textContent = " " + m.label;
        item.append(strong, labelSpan);
        bannerSummary.append(item);
      }

      banner.append(bannerTop, bannerSummary);
      container.append(banner);

      // 2. Delivery Gaps Section (if any gaps exist)
      if (summary.totalGaps > 0) {
        const gapSec = document.createElement("div");
        gapSec.className = "relay-ai-traceability-section";

        const gTitle = document.createElement("h3");
        gTitle.className = "relay-ai-traceability-section-title";
        gTitle.textContent = `Delivery Gaps (${summary.totalGaps})`;
        gapSec.append(gTitle);

        const gList = document.createElement("div");
        gList.className = "relay-ai-health-actions-list";

        // Requirements without issues
        if (Array.isArray(gaps.requirementsWithoutIssues)) {
          for (const gap of gaps.requirementsWithoutIssues) {
            const card = document.createElement("div");
            card.className = "relay-ai-gap-card";
            const gCardTitle = document.createElement("div");
            gCardTitle.className = "relay-ai-gap-title";
            gCardTitle.textContent = `Requirement Missing Issue: ${gap.reqId || ''} ${gap.title}`;
            const gCardDesc = document.createElement("div");
            gCardDesc.className = "relay-ai-gap-desc";
            gCardDesc.textContent = gap.reason;
            card.append(gCardTitle, gCardDesc);
            gList.append(card);
          }
        }

        // Issues without PRs
        if (Array.isArray(gaps.issuesWithoutPrs)) {
          for (const gap of gaps.issuesWithoutPrs) {
            const card = document.createElement("div");
            card.className = "relay-ai-gap-card";
            const gCardTitle = document.createElement("div");
            gCardTitle.className = "relay-ai-gap-title";
            gCardTitle.textContent = `Issue Missing PR: #${gap.issueNumber} - ${gap.title}`;
            const gCardDesc = document.createElement("div");
            gCardDesc.className = "relay-ai-gap-desc";
            gCardDesc.textContent = gap.reason;
            if (gap.issueUrl) {
              const link = document.createElement("a");
              link.className = "relay-ai-gh-link";
              link.href = gap.issueUrl;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = `Open Issue #${gap.issueNumber} ↗`;
              card.append(gCardTitle, gCardDesc, link);
            } else {
              card.append(gCardTitle, gCardDesc);
            }
            gList.append(card);
          }
        }

        // PRs without Requirements
        if (Array.isArray(gaps.prsWithoutRequirements)) {
          for (const gap of gaps.prsWithoutRequirements) {
            const card = document.createElement("div");
            card.className = "relay-ai-gap-card";
            const gCardTitle = document.createElement("div");
            gCardTitle.className = "relay-ai-gap-title";
            gCardTitle.textContent = `Unlinked PR: #${gap.prNumber} - ${gap.title}`;
            const gCardDesc = document.createElement("div");
            gCardDesc.className = "relay-ai-gap-desc";
            gCardDesc.textContent = gap.reason;
            if (gap.html_url) {
              const link = document.createElement("a");
              link.className = "relay-ai-gh-link";
              link.href = gap.html_url;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = `Open PR #${gap.prNumber} ↗`;
              card.append(gCardTitle, gCardDesc, link);
            } else {
              card.append(gCardTitle, gCardDesc);
            }
            gList.append(card);
          }
        }

        gapSec.append(gList);
        container.append(gapSec);
      }

      // 3. Traceability Matrix Flow Cards (Requirements -> Tasks/Issues -> PRs -> Evidence)
      const matrixSec = document.createElement("div");
      matrixSec.className = "relay-ai-traceability-section";

      const mTitle = document.createElement("h3");
      mTitle.className = "relay-ai-traceability-section-title";
      mTitle.textContent = "Requirements-to-Delivery Matrix";
      matrixSec.append(mTitle);

      if (reqs.length === 0) {
        const emptyNotice = document.createElement("p");
        emptyNotice.className = "relay-ai-about-desc";
        emptyNotice.textContent = "No requirements registered yet. Propose issues with Relay to begin tracking traceability.";
        matrixSec.append(emptyNotice);
      } else {
        const mList = document.createElement("div");
        mList.className = "relay-ai-matrix-list";

        for (const req of reqs) {
          const reqCard = document.createElement("div");
          reqCard.className = "relay-ai-req-card";

          // Requirement Header
          const rHeader = document.createElement("div");
          rHeader.className = "relay-ai-req-header";

          const titleGrp = document.createElement("div");
          titleGrp.className = "relay-ai-req-title-group";

          const rIdSpan = document.createElement("span");
          rIdSpan.className = "relay-ai-req-id";
          rIdSpan.textContent = req.reqId || 'REQ';

          const rTitle = document.createElement("strong");
          rTitle.className = "relay-ai-req-title";
          rTitle.textContent = req.title;

          titleGrp.append(rIdSpan, rTitle);

          const rBadge = document.createElement("span");
          const badgeCls = req.deliveryStatus?.badgeClass || 'in_progress';
          rBadge.className = `relay-ai-traceability-status-badge ${badgeCls}`;
          rBadge.textContent = req.deliveryStatus?.label || 'In Progress';

          rHeader.append(titleGrp, rBadge);
          reqCard.append(rHeader);

          // Acceptance Criteria (if available)
          if (Array.isArray(req.acceptanceCriteria) && req.acceptanceCriteria.length > 0) {
            const critBox = document.createElement("div");
            critBox.className = "relay-ai-criteria-box";

            const critTitle = document.createElement("div");
            critTitle.className = "relay-ai-criteria-title";
            critTitle.textContent = "Acceptance Criteria";
            critBox.append(critTitle);

            for (const crit of req.acceptanceCriteria) {
              const item = document.createElement("div");
              item.className = "relay-ai-criteria-item";
              item.textContent = `${crit.completed ? '☑' : '☐'} ${crit.text}`;
              critBox.append(item);
            }
            reqCard.append(critBox);
          }

          // Work Items / Tasks Flow Chain
          const workItems = req.workItems || [];
          if (workItems.length > 0) {
            const chain = document.createElement("div");
            chain.className = "relay-ai-flow-chain";

            for (const item of workItems) {
              const node = document.createElement("div");
              node.className = "relay-ai-chain-node";

              const nHeader = document.createElement("div");
              nHeader.className = "relay-ai-chain-node-header";

              const leftGrp = document.createElement("div");
              leftGrp.style.display = "flex";
              leftGrp.style.alignItems = "center";
              leftGrp.style.gap = "6px";

              const itemIdSpan = document.createElement("span");
              itemIdSpan.className = "relay-ai-chain-item-id";
              itemIdSpan.textContent = item.itemId || item.type || 'TASK';

              const itemTitle = document.createElement("span");
              itemTitle.className = "relay-ai-chain-title";
              itemTitle.textContent = item.title;

              leftGrp.append(itemIdSpan, itemTitle);
              nHeader.append(leftGrp);

              // Issue Link (if published)
              if (item.githubIssueNumber) {
                const issueLink = document.createElement("a");
                issueLink.className = "relay-ai-gh-link";
                issueLink.href = item.githubIssueUrl || `https://github.com/${effectiveContext.owner}/${effectiveContext.repository}/issues/${item.githubIssueNumber}`;
                issueLink.target = "_blank";
                issueLink.rel = "noopener noreferrer";
                issueLink.textContent = `Issue #${item.githubIssueNumber} ↗`;
                nHeader.append(issueLink);
              } else {
                const draftSpan = document.createElement("span");
                draftSpan.className = "relay-ai-evidence-badge unverified";
                draftSpan.textContent = "Not Published";
                nHeader.append(draftSpan);
              }

              node.append(nHeader);

              // Linked Pull Requests & Verification Evidence
              const prs = item.pullRequests || [];
              if (prs.length > 0) {
                const prContainer = document.createElement("div");
                prContainer.style.marginTop = "6px";
                prContainer.style.display = "flex";
                prContainer.style.flexDirection = "column";
                prContainer.style.gap = "4px";

                for (const pr of prs) {
                  const prRow = document.createElement("div");
                  prRow.style.display = "flex";
                  prRow.style.alignItems = "center";
                  prRow.style.justifyContent = "space-between";
                  prRow.style.gap = "6px";

                  const prLink = document.createElement("a");
                  prLink.className = "relay-ai-gh-link";
                  prLink.href = pr.html_url;
                  prLink.target = "_blank";
                  prLink.rel = "noopener noreferrer";
                  prLink.textContent = `PR #${pr.number}: ${pr.title}`;

                  const evBadge = document.createElement("span");
                  const evState = pr.evidence?.verificationState || 'unverified';
                  evBadge.className = `relay-ai-evidence-badge ${evState}`;
                  evBadge.textContent = pr.evidence?.verificationLabel || 'Unverified';

                  prRow.append(prLink, evBadge);
                  prContainer.append(prRow);
                }
                node.append(prContainer);
              }

              chain.append(node);
            }
            reqCard.append(chain);
          }

          mList.append(reqCard);
        }
        matrixSec.append(mList);
      }

      container.append(matrixSec);
      ui["traceability-body"].append(container);

    } catch (err) {
      ui["traceability-loading"].classList.remove("hidden");
      ui["traceability-loading"].hidden = false;
      ui["traceability-loading"].textContent = `Traceability request failed: ${err.message || 'Network error'}`;
    }
  }

  // PM Reports & Delivery Forecasting fetch and render
  async function loadPmReports() {
    if (!ui["reports-loading"] || !ui["reports-body"]) return;

    ui["reports-loading"].classList.remove("hidden");
    ui["reports-loading"].hidden = false;
    ui["reports-loading"].textContent = "Generating PM reports and delivery forecast…";
    ui["reports-body"].classList.add("hidden");
    ui["reports-body"].hidden = true;
    ui["reports-body"].replaceChildren();

    const effectiveContext = currentContext;
    if (!effectiveContext?.owner || !effectiveContext?.repository) {
      ui["reports-loading"].textContent = "Please select or navigate to a GitHub repository to generate PM reports.";
      return;
    }

    if (!RelayAIAssistant?.getPmReports) {
      ui["reports-loading"].textContent = "PM Reports service client is unavailable.";
      return;
    }

    try {
      const res = await RelayAIAssistant.getPmReports(effectiveContext);
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}

      if (!res.ok) {
        ui["reports-loading"].textContent = data?.error || `Unable to load PM reports (HTTP ${res.status}).`;
        return;
      }

      ui["reports-loading"].classList.add("hidden");
      ui["reports-loading"].hidden = true;
      ui["reports-body"].classList.remove("hidden");
      ui["reports-body"].hidden = false;

      const reports = data.reports || {};
      const statusReport = reports.projectStatusReport || {};
      const milestoneReport = reports.milestoneReport || {};
      const deliveryForecast = reports.deliveryForecast || {};
      const teamWorkload = reports.teamWorkload || {};
      const stakeholderUpdate = reports.stakeholderUpdate || {};

      const container = document.createElement("div");
      container.className = "relay-ai-reports-container";

      // 1. Project Status Report Section
      const statusSec = document.createElement("div");
      statusSec.className = "relay-ai-report-section";

      const statusHeader = document.createElement("div");
      statusHeader.className = "relay-ai-report-header";
      const statusTitle = document.createElement("h3");
      statusTitle.textContent = "1. Project Status Report";
      const statusBadge = document.createElement("span");
      const healthCls = statusReport.overallStatus === 'healthy' ? 'verified' : statusReport.overallStatus === 'at_risk' ? 'gap' : 'in_progress';
      statusBadge.className = `relay-ai-traceability-status-badge ${healthCls}`;
      statusBadge.textContent = (statusReport.overallStatus || 'active').replace('_', ' ').toUpperCase();
      statusHeader.append(statusTitle, statusBadge);

      const statusMetrics = document.createElement("div");
      statusMetrics.className = "relay-ai-traceability-summary-metrics";
      const metricsList = [
        { count: statusReport.metrics?.totalIssues || 0, label: "Total Issues" },
        { count: statusReport.metrics?.openIssues || 0, label: "Open Issues" },
        { count: statusReport.metrics?.closedIssues || 0, label: "Closed Issues", cls: "text-success" },
        { count: `${statusReport.completionRate || 0}%`, label: "Completion Rate" },
        { count: statusReport.metrics?.overdueCount || 0, label: "Overdue", cls: statusReport.metrics?.overdueCount > 0 ? "text-danger" : "" },
        { count: statusReport.metrics?.stalledCount || 0, label: "Stalled", cls: statusReport.metrics?.stalledCount > 0 ? "text-warning" : "" },
        { count: statusReport.metrics?.totalGaps || 0, label: "Delivery Gaps", cls: statusReport.metrics?.totalGaps > 0 ? "text-danger" : "" }
      ];

      for (const m of metricsList) {
        const item = document.createElement("div");
        item.className = `relay-ai-metric-item ${m.cls || ''}`.trim();
        const strong = document.createElement("strong");
        strong.textContent = String(m.count);
        const label = document.createElement("span");
        label.textContent = " " + m.label;
        item.append(strong, label);
        statusMetrics.append(item);
      }
      statusSec.append(statusHeader, statusMetrics);

      // Overdue issues list if any
      if (Array.isArray(statusReport.overdueIssues) && statusReport.overdueIssues.length > 0) {
        const odList = document.createElement("div");
        odList.className = "relay-ai-report-sublist";
        for (const od of statusReport.overdueIssues) {
          const odCard = document.createElement("div");
          odCard.className = "relay-ai-gap-card";
          const title = document.createElement("strong");
          title.className = "relay-ai-gap-title";
          title.textContent = `Overdue #${od.number}: ${od.title}`;
          const exp = document.createElement("p");
          exp.className = "relay-ai-gap-desc";
          exp.textContent = od.explanation;
          odCard.append(title, exp);
          if (od.url) {
            const link = document.createElement("a");
            link.className = "relay-ai-gh-link";
            link.href = od.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = `View Issue #${od.number} ↗`;
            odCard.append(link);
          }
          odList.append(odCard);
        }
        statusSec.append(odList);
      }
      container.append(statusSec);

      // 2. Sprint & Milestone Report Section
      const msSec = document.createElement("div");
      msSec.className = "relay-ai-report-section";
      const msTitle = document.createElement("h3");
      msTitle.className = "relay-ai-traceability-section-title";
      msTitle.textContent = `2. Sprint & Milestone Progress (${milestoneReport.totalMilestones || 0})`;
      msSec.append(msTitle);

      const msList = milestoneReport.milestones || [];
      if (msList.length === 0) {
        const emptyMs = document.createElement("p");
        emptyMs.className = "relay-ai-about-desc";
        emptyMs.textContent = "No milestones registered in Relay or GitHub for this repository.";
        msSec.append(emptyMs);
      } else {
        const mCards = document.createElement("div");
        mCards.className = "relay-ai-matrix-list";
        for (const ms of msList) {
          const card = document.createElement("div");
          card.className = "relay-ai-req-card";
          const cHeader = document.createElement("div");
          cHeader.className = "relay-ai-req-header";
          const titleGrp = document.createElement("div");
          titleGrp.className = "relay-ai-req-title-group";
          const idSpan = document.createElement("span");
          idSpan.className = "relay-ai-req-id";
          idSpan.textContent = ms.milestoneId || 'MS';
          const tText = document.createElement("strong");
          tText.className = "relay-ai-req-title";
          tText.textContent = ms.title;
          titleGrp.append(idSpan, tText);

          const mBadge = document.createElement("span");
          const mBadgeCls = ms.healthStatus === 'on_track' ? 'verified' : 'gap';
          mBadge.className = `relay-ai-traceability-status-badge ${mBadgeCls}`;
          mBadge.textContent = ms.healthStatus.replace('_', ' ').toUpperCase();
          cHeader.append(titleGrp, mBadge);

          const desc = document.createElement("p");
          desc.className = "relay-ai-req-body";
          const closedCount = ms.closedIssues ?? ms.completedIssues ?? 0;
          desc.textContent = `${closedCount}/${ms.totalIssues} issues closed (${ms.completionRate}% complete). Target: ${ms.targetDate || 'None set'}`;

          card.append(cHeader, desc);
          mCards.append(card);
        }
        msSec.append(mCards);
      }
      container.append(msSec);

      // 3. Delivery Forecast Section
      const fcSec = document.createElement("div");
      fcSec.className = "relay-ai-report-section";
      const fcTitle = document.createElement("h3");
      fcTitle.className = "relay-ai-traceability-section-title";
      fcTitle.textContent = "3. Delivery Forecast (Critical Path)";

      const fcCard = document.createElement("div");
      fcCard.className = "relay-ai-forecast-card";

      const fcHeader = document.createElement("div");
      fcHeader.className = "relay-ai-forecast-header";
      const estDate = document.createElement("strong");
      estDate.className = "relay-ai-forecast-date";
      estDate.textContent = deliveryForecast.estimatedCompletionDate 
        ? `Target Completion: ${deliveryForecast.estimatedCompletionDate}` 
        : "Estimated Completion: Pending Schedule Inputs";

      const confBadge = document.createElement("span");
      const confCls = deliveryForecast.confidence === 'high' ? 'verified' : deliveryForecast.confidence === 'medium' ? 'in_progress' : 'gap';
      confBadge.className = `relay-ai-traceability-status-badge ${confCls}`;
      confBadge.textContent = `${(deliveryForecast.confidence || 'low').toUpperCase()} CONFIDENCE`;
      fcHeader.append(estDate, confBadge);

      const fcNotes = document.createElement("div");
      fcNotes.className = "relay-ai-forecast-notes";
      if (deliveryForecast.criticalPathDurationDays) {
        const cpInfo = document.createElement("p");
        cpInfo.textContent = `Critical path duration: ${deliveryForecast.criticalPathDurationDays} working days across ${deliveryForecast.criticalPathItems?.length || 0} sequential tasks.`;
        fcNotes.append(cpInfo);
      }
      if (deliveryForecast.limitations) {
        const lim = document.createElement("p");
        lim.className = "relay-ai-forecast-limitation";
        lim.textContent = `Assumption note: ${deliveryForecast.limitations}`;
        fcNotes.append(lim);
      }
      fcCard.append(fcHeader, fcNotes);
      fcSec.append(fcTitle, fcCard);
      container.append(fcSec);

      // 4. Team Workload Summary Section
      const wlSec = document.createElement("div");
      wlSec.className = "relay-ai-report-section";
      const wlTitle = document.createElement("h3");
      wlTitle.className = "relay-ai-traceability-section-title";
      wlTitle.textContent = `4. Team Workload (${teamWorkload.totalMembers || 0} Members)`;
      wlSec.append(wlTitle);

      const membersList = teamWorkload.members || [];
      if (membersList.length === 0) {
        const emptyWl = document.createElement("p");
        emptyWl.className = "relay-ai-about-desc";
        emptyWl.textContent = "No assigned developers or profiles registered.";
        wlSec.append(emptyWl);
      } else {
        const wGrid = document.createElement("div");
        wGrid.className = "relay-ai-matrix-list";
        for (const m of membersList) {
          const mCard = document.createElement("div");
          mCard.className = "relay-ai-req-card";
          const mHead = document.createElement("div");
          mHead.className = "relay-ai-req-header";
          const mName = document.createElement("strong");
          mName.className = "relay-ai-req-title";
          mName.textContent = `@${m.username}`;

          const wBadge = document.createElement("span");
          const wBadgeCls = m.workloadStatus === 'healthy' || m.workloadStatus === 'available' ? 'verified' : m.workloadStatus === 'overloaded' ? 'gap' : 'unverified';
          wBadge.className = `relay-ai-traceability-status-badge ${wBadgeCls}`;
          wBadge.textContent = m.workloadStatus.replace('_', ' ').toUpperCase();
          mHead.append(mName, wBadge);

          const mDetails = document.createElement("p");
          mDetails.className = "relay-ai-req-body";
          if (m.weeklyCapacityHours !== null) {
            mDetails.textContent = `${m.openAssignedIssuesCount} open task(s) (Max concurrent: ${m.maxConcurrentTasks}, Weekly capacity: ${m.weeklyCapacityHours}h). Focus: ${m.currentFocus || 'General'}`;
          } else {
            mDetails.textContent = `${m.openAssignedIssuesCount} open task(s). ${m.notice || ''}`;
          }
          mCard.append(mHead, mDetails);
          wGrid.append(mCard);
        }
        wlSec.append(wGrid);
      }
      container.append(wlSec);

      // 5. Stakeholder Update (Editable Draft) Section
      const suSec = document.createElement("div");
      suSec.className = "relay-ai-report-section";
      const suTitle = document.createElement("h3");
      suTitle.className = "relay-ai-traceability-section-title";
      suTitle.textContent = "5. Stakeholder Update (Editable Draft)";

      const suDesc = document.createElement("p");
      suDesc.className = "relay-ai-about-desc";
      suDesc.textContent = "Review and copy or edit the status update for your team standup or stakeholder sync:";

      const suTextarea = document.createElement("textarea");
      suTextarea.className = "relay-ai-reports-textarea";
      suTextarea.rows = 12;
      suTextarea.value = stakeholderUpdate.draftText || "";
      suTextarea.textContent = stakeholderUpdate.draftText || "";

      const suActions = document.createElement("div");
      suActions.className = "relay-ai-report-actions";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "relay-ai-btn relay-ai-btn-primary relay-ai-btn-sm";
      copyBtn.textContent = "Copy Update to Clipboard";
      copyBtn.addEventListener("click", () => {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(suTextarea.value);
        }
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy Update to Clipboard"; }, 2000);
      });
      suActions.append(copyBtn);

      suSec.append(suTitle, suDesc, suTextarea, suActions);
      container.append(suSec);

      ui["reports-body"].append(container);

    } catch (err) {
      ui["reports-loading"].classList.remove("hidden");
      ui["reports-loading"].hidden = false;
      ui["reports-loading"].textContent = `PM Reports request failed: ${err.message || 'Network error'}`;
    }
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


