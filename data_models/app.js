(function () {
  const FILES = {
    dataModels: "./data_model_documentation.csv",
    tables: "./table_documentation.csv",
    fields: "./field_documentation.csv",
    credibleLinks: "./credible_links.csv",
  };

  const params = new URLSearchParams(window.location.search);
  const mode = detectMode();
  const view = normalize(params.get("view"));

  const statusBanner = document.getElementById("statusBanner");
  const rowCountEl = document.getElementById("rowCount");
  const copyEmbedBtn = document.getElementById("copyEmbedBtn");

  const embeddedTitle = document.getElementById("embeddedTitle");
  const embeddedDescription = document.getElementById("embeddedDescription");
  const tableSearch = document.getElementById("tableSearch");
  const exportCsvBtn = document.getElementById("exportCsvBtn");

  const modelSelect = document.getElementById("modelSelect");
  const embedUrl = document.getElementById("embedUrl");
  const embedCode = document.getElementById("embedCode");
  const copyUrlBtn = document.getElementById("copyUrlBtn");
  const copyCodeBtn = document.getElementById("copyCodeBtn");
  const embedStatus = document.getElementById("embedStatus");

  const collapsedModels = new Set();
  const collapsedTables = new Set();
  const defaultModelCollapsed = normalize(params.get("expand")) === "none";
  const defaultTableCollapsed =
    normalize(params.get("expand")) === "none" || normalize(params.get("expand")) === "model";
  const expandedModelOverrides = new Set();
  const expandedTableOverrides = new Set();

  init();

  async function init() {
    if (mode === "embedded" && view === "links") {
      try {
        initLinksView(await loadCsv(FILES.credibleLinks));
      } catch (error) {
        setStatus("Failed to load the Credible links.", true);
        console.error(error);
      }
      return;
    }

    if (mode === "embedded" && view === "builder") {
      try {
        initBuilderView(await loadCsv(FILES.credibleLinks));
      } catch (error) {
        showBuilder();
        setBuilderStatus("Failed to load the Credible links.");
        console.error(error);
      }
      return;
    }

    try {
      const [dmRows, tableRows, fieldRows] = await Promise.all([
        loadCsv(FILES.dataModels),
        loadCsv(FILES.tables),
        loadCsv(FILES.fields),
      ]);

      const context = buildContext(dmRows, tableRows, fieldRows);

      if (mode === "embedded") {
        initEmbeddedPage(context);
      } else if (mode === "embed") {
        initEmbedGeneratorPage(context);
      } else {
        initExplorerPage(context);
      }
    } catch (error) {
      if (statusBanner) {
        setStatus("Failed to load table data.", true);
      }
      console.error(error);
    }
  }

  function detectMode() {
    if (document.getElementById("modelSelect")) return "embed";
    if (document.getElementById("embeddedTitle")) return "embedded";
    return "explorer";
  }

  function loadCsv(path) {
    return new Promise((resolve, reject) => {
      Papa.parse(path, {
        download: true,
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => clean(header).replace(/^﻿/, ""),
        complete: (results) => resolve(results.data || []),
        error: reject,
      });
    });
  }

  function buildContext(dmRows, tableRows, fieldRows) {
    const modelDescriptions = new Map();
    dmRows.forEach((row) => {
      const modelName = clean(row["Data Model Name"]);
      if (!modelName) return;
      modelDescriptions.set(modelName, clean(row["Data Model Description"]));
    });

    const tableInfoByTable = new Map();
    tableRows.forEach((row) => {
      const tableName = clean(row["Table Name"]);
      if (!tableName) return;
      tableInfoByTable.set(tableName, {
        dataModelName: clean(row["Data Model Name"]),
        tableDescription: clean(row["Table Description"]),
      });
    });

    const rows = [];
    fieldRows.forEach((row) => {
      const tableName = clean(row["Table Name"]);
      const tableInfo = tableInfoByTable.get(tableName);
      if (!tableInfo) return;

      const dataModelName = tableInfo.dataModelName;
      rows.push({
        data_model_name: dataModelName,
        table_name: tableName,
        field_name: clean(row["Field Name"]),
        data_model_description: modelDescriptions.get(dataModelName) || "",
        table_description: tableInfo.tableDescription,
        field_description: clean(row["Field Description"]),
      });
    });

    const modelNames = Array.from(modelDescriptions.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return {
      rows,
      modelDescriptions,
      modelNames,
    };
  }

  function initExplorerPage(context) {
    const filtered = applyFilters(context.rows);
    if (!filtered.length) {
      setStatus("No matching rows found for current URL filters.");
    } else {
      setStatus("");
    }

    const table = createExplorerTable(filtered);
    updateVisibleColumns(table);
    bindEmbedCopy();
    updateCount(table.rows({ search: "applied" }).count());
    table.on("draw", function () {
      decorateGroups(table);
      updateCount(table.rows({ search: "applied" }).count());
    });
    decorateGroups(table);
  }

  function initEmbeddedPage(context) {
    const selectedModel = clean(params.get("data_model_name"));
    const normalizedSelectedModel = normalize(selectedModel);
    const modelRows = selectedModel
      ? context.rows.filter((row) => normalize(row.data_model_name) === normalizedSelectedModel)
      : [];

    const modelName = modelRows[0]?.data_model_name || selectedModel;
    const modelDescription =
      (modelName && context.modelDescriptions.get(modelName)) ||
      (modelRows[0]?.data_model_description || "");

    if (embeddedTitle) {
      embeddedTitle.textContent = modelName || "Select a data model";
    }
    if (embeddedDescription) {
      embeddedDescription.textContent =
        modelDescription ||
        "Provide a data_model_name URL parameter to show a single model's table and field documentation.";
    }
    document.title = modelName ? `${modelName} - Embedded Data Model` : "Embedded Data Model";

    if (!selectedModel) {
      setStatus("No data_model_name URL parameter was supplied.", true);
    } else if (!modelRows.length) {
      setStatus(`No rows found for data model "${selectedModel}".`, true);
    } else {
      setStatus("");
    }

    const table = createEmbeddedTable(modelRows);
    updateEmbeddedCount(table);
    table.on("draw", function () {
      updateEmbeddedCount(table);
    });

    tableSearch?.addEventListener("input", () => {
      table.search(tableSearch.value, false, false).draw();
    });

    exportCsvBtn?.addEventListener("click", () => {
      exportEmbeddedCsv(table, modelName);
    });
  }

  function updateEmbeddedCount(table) {
    const count = table.rows({ search: "applied" }).count();
    updateCount(count);
    if (exportCsvBtn) {
      exportCsvBtn.disabled = count === 0;
    }
  }

  function exportEmbeddedCsv(table, modelName) {
    const rows = table.rows({ search: "applied", order: "applied" }).data().toArray();
    if (!rows.length) return;

    const lines = [["Table Name", "Field Name", "Field Description"]];
    rows.forEach((row) => {
      lines.push([row.table_name, row.field_name, row.field_description]);
    });

    const baseName = modelName || "data_model";
    const fileName = clean(table.search()) ? `${baseName}_filtered.csv` : `${baseName}.csv`;
    downloadCsv(lines, fileName);
  }

  // view=links: the Credible links list, read from credible_links.csv, which
  // publish_documentation.py in JCT writes on every release. Names and descriptions are
  // cleaned up here at display time; the CSV and the URLs are never changed.
  function initLinksView(csvRows) {
    const rows = csvRows
      .map((row) => ({
        name: cleanLinkName(row["Link Name"]),
        link: clean(row["Link"]),
        description: appointmentToService(clean(row["Description"])),
      }))
      .filter((row) => row.name && row.link);

    if (embeddedTitle) {
      embeddedTitle.textContent = "Credible Links";
    }
    if (embeddedDescription) {
      embeddedDescription.textContent =
        "Links into Credible that Janet builds. Replace each {placeholder} with the record's Credible id.";
    }
    document.title = "Credible Links";
    if (tableSearch) {
      tableSearch.placeholder = "Search name, link or description";
      tableSearch.setAttribute("aria-label", "Search name, link or description");
    }

    setStatus(rows.length ? "" : "No Credible links were found.", !rows.length);

    const table = createLinksTable(rows);
    updateEmbeddedCount(table);
    table.on("draw", function () {
      updateEmbeddedCount(table);
    });

    tableSearch?.addEventListener("input", () => {
      table.search(tableSearch.value, false, false).draw();
    });

    exportCsvBtn?.addEventListener("click", () => {
      exportLinksCsv(table);
    });
  }

  function createLinksTable(rows) {
    return new DataTable("#modelTable", {
      data: rows,
      columns: [
        { data: "name", name: "name", title: "Name" },
        { data: "link", name: "link", title: "Link", className: "link-cell" },
        { data: "description", name: "description", title: "Description" },
      ],
      order: [[0, "asc"]],
      searching: true,
      layout: {
        topStart: "pageLength",
        topEnd: null,
      },
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250, 500],
      autoWidth: false,
      deferRender: true,
    });
  }

  function exportLinksCsv(table) {
    const rows = table.rows({ search: "applied", order: "applied" }).data().toArray();
    if (!rows.length) return;

    const lines = [["Name", "Link", "Description"]];
    rows.forEach((row) => {
      lines.push([row.name, row.link, row.description]);
    });

    const fileName = clean(table.search()) ? "credible_links_filtered.csv" : "credible_links.csv";
    downloadCsv(lines, fileName);
  }

  // "Client Link Allergies" becomes "Client Allergies" and "Appointment Link (Completed)"
  // becomes "Service (Completed)".
  function cleanLinkName(value) {
    const withoutLink = clean(value).replace(/\blink\b/gi, "").replace(/\s{2,}/g, " ").trim();
    return appointmentToService(withoutLink);
  }

  function appointmentToService(value) {
    return value.replace(/\b(appointment)(s?)\b/gi, (match, word, plural) => {
      let service = "service";
      if (word === word.toUpperCase()) {
        service = "SERVICE";
      } else if (word[0] === word[0].toUpperCase()) {
        service = "Service";
      }
      return service + (plural ? (plural === "S" ? "S" : "s") : "");
    });
  }

  // view=builder: the Credible Link Builder. The reader picks a link from credible_links.csv,
  // names their table and the field that holds each {placeholder} id, and copies a SQL SELECT or
  // a DAX calculated column that builds the link for every row.
  const DEFAULT_TABLE = "dbo.mytable";
  const PLACEHOLDER_MEANINGS = {
    client_id: "Credible client id",
    emp_id: "Credible staff (employee) id",
    clientvisit_id: "Credible service (visit) id",
    plan_id: "Credible planner id",
    episode_id: "Credible enrollment (episode) id",
    form_ver_id: "Credible form version id",
  };
  const BUILDER_TIPS = {
    sql: "Run it as is, or paste the link expression into your own SELECT. It adds one column with a working Credible link for each row.",
    dax: "In Power BI Desktop, select the table, choose New column, and paste this. Then set the column's Data category to Web URL so it shows as a link.",
  };

  function initBuilderView(csvRows) {
    const rows = csvRows
      .map((row) => ({
        name: cleanLinkName(row["Link Name"]),
        link: clean(row["Link"]),
        description: appointmentToService(clean(row["Description"])),
      }))
      .filter((row) => row.name && row.link)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    showBuilder();
    if (embeddedTitle) {
      embeddedTitle.textContent = "Credible Link Builder";
    }
    if (embeddedDescription) {
      embeddedDescription.textContent =
        "Pick a link, tell us where your ids live, and copy the SQL or DAX that builds it.";
    }
    document.title = "Credible Link Builder";
    if (rowCountEl) {
      rowCountEl.textContent = `${rows.length} link types`;
    }
    setBuilderStatus(rows.length ? "" : "No Credible links were found.");
    if (!rows.length) return;

    const linkSelect = document.getElementById("builderLink");
    const linkDescription = document.getElementById("builderLinkDescription");
    const tableInput = document.getElementById("builderTable");
    const fieldsEl = document.getElementById("builderFields");
    const sqlBtn = document.getElementById("builderSqlBtn");
    const daxBtn = document.getElementById("builderDaxBtn");
    const copyBtn = document.getElementById("builderCopyBtn");
    const output = document.getElementById("builderOutput");
    const tip = document.getElementById("builderTip");
    const pattern = document.getElementById("builderPattern");

    // What the reader typed for each placeholder, kept across link types.
    const fieldValues = new Map();
    let outputType = "sql";
    let copyTimer = 0;

    rows.forEach((row, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = row.name;
      linkSelect.appendChild(option);
    });

    function currentRow() {
      return rows[Number(linkSelect.value)] || rows[0];
    }

    function renderFields() {
      fieldsEl.innerHTML = "";
      linkPlaceholders(currentRow().link).forEach((placeholder) => {
        const id = `builderField-${placeholder}`;
        const wrap = document.createElement("div");
        wrap.className = "builder-field";

        const label = document.createElement("label");
        label.htmlFor = id;
        const code = document.createElement("code");
        code.textContent = `{${placeholder}}`;
        const meaning = document.createElement("span");
        meaning.textContent = PLACEHOLDER_MEANINGS[placeholder] || "Credible id";
        label.append(code, meaning);

        const input = document.createElement("input");
        input.id = id;
        input.type = "text";
        input.className = "form-control builder-control";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.dataset.placeholder = placeholder;
        input.value = fieldValues.has(placeholder) ? fieldValues.get(placeholder) : placeholder;
        input.addEventListener("input", () => {
          fieldValues.set(placeholder, input.value);
          renderOutput();
        });

        wrap.append(label, input);
        fieldsEl.appendChild(wrap);
      });
    }

    function renderOutput() {
      const row = currentRow();
      const fields = {};
      fieldsEl.querySelectorAll("input[data-placeholder]").forEach((input) => {
        fields[input.dataset.placeholder] = clean(input.value) || input.dataset.placeholder;
      });
      const table = clean(tableInput.value) || DEFAULT_TABLE;
      const columnName = `${row.name} Link`;
      output.textContent =
        outputType === "dax"
          ? buildDaxColumn(row.link, table, fields, columnName)
          : buildSqlSelect(row.link, table, fields, columnName);
      tip.textContent = BUILDER_TIPS[outputType];
      pattern.textContent = row.link;
    }

    function selectLink() {
      linkDescription.textContent = currentRow().description;
      renderFields();
      renderOutput();
    }

    function setOutputType(type) {
      outputType = type;
      sqlBtn.setAttribute("aria-pressed", String(type === "sql"));
      daxBtn.setAttribute("aria-pressed", String(type === "dax"));
      renderOutput();
    }

    function flashCopyLabel(text) {
      copyBtn.textContent = text;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1600);
    }

    linkSelect.addEventListener("change", selectLink);
    tableInput.addEventListener("input", renderOutput);
    sqlBtn.addEventListener("click", () => setOutputType("sql"));
    daxBtn.addEventListener("click", () => setOutputType("dax"));
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(output.textContent);
        flashCopyLabel("Copied");
      } catch (err) {
        // The clipboard can be blocked inside an iframe. Select the text so the reader can copy it.
        const range = document.createRange();
        range.selectNodeContents(output);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        let copied = false;
        try {
          copied = document.execCommand("copy");
        } catch (ignored) {
          copied = false;
        }
        flashCopyLabel(copied ? "Copied" : "Selected");
      }
    });

    selectLink();
  }

  function showBuilder() {
    document.body.classList.add("builder-mode");
    const tableCard = document.getElementById("tableCard");
    const builderView = document.getElementById("builderView");
    if (tableCard) tableCard.hidden = true;
    if (builderView) builderView.hidden = false;
  }

  function setBuilderStatus(message) {
    const builderStatus = document.getElementById("builderStatus");
    if (!builderStatus) return;
    builderStatus.textContent = message || "";
    builderStatus.classList.toggle("error", !!message);
  }

  // Distinct placeholder names in the order they first appear: "...?client_id={client_id}&plan_id={plan_id}"
  // gives ["client_id", "plan_id"].
  function linkPlaceholders(link) {
    const names = [];
    for (const match of link.matchAll(/\{(\w+)\}/g)) {
      if (!names.includes(match[1])) names.push(match[1]);
    }
    return names;
  }

  // Splits a link into literal text and placeholders, dropping empty literals.
  function linkPieces(link) {
    return link
      .split(/(\{\w+\})/)
      .filter((piece) => piece !== "")
      .map((piece) => {
        const match = /^\{(\w+)\}$/.exec(piece);
        return match ? { placeholder: match[1] } : { literal: piece };
      });
  }

  // "dbo.mytable" gives ["dbo", "mytable"]; a part already in brackets keeps its brackets and dots.
  function identifierParts(value) {
    return clean(value).match(/\[(?:[^\]]|\]\])*\]|[^.]+/g) || [];
  }

  function sqlBracket(part) {
    const trimmed = part.trim();
    if (/^\[.*\]$/.test(trimmed)) return trimmed;
    return `[${trimmed.replaceAll("]", "]]")}]`;
  }

  function unbracket(part) {
    const trimmed = part.trim();
    return /^\[.*\]$/.test(trimmed) ? trimmed.slice(1, -1).replaceAll("]]", "]") : trimmed;
  }

  function buildSqlSelect(link, table, fields, columnName) {
    const tableRef = identifierParts(table).map(sqlBracket).join(".");
    const terms = linkPieces(link).map((piece) =>
      piece.literal !== undefined
        ? `'${piece.literal.replaceAll("'", "''")}'`
        : `CAST(${tableRef}.${sqlBracket(fields[piece.placeholder])} AS VARCHAR(20))`
    );
    const lines = ["SELECT", `    ${tableRef}.*`, `    ,${terms[0]}`];
    terms.slice(1).forEach((term) => lines.push(`        + ${term}`));
    lines.push(`        AS [${columnName.replaceAll("]", "]]")}]`);
    lines.push(`FROM ${tableRef}`);
    return lines.join("\n");
  }

  function buildDaxColumn(link, table, fields, columnName) {
    const parts = identifierParts(table).map(unbracket);
    if (parts.length > 1 && parts[0].toLowerCase() === "dbo") parts.shift();
    const tableRef = `'${parts.join(".").replaceAll("'", "''")}'`;
    const terms = linkPieces(link).map((piece) =>
      piece.literal !== undefined
        ? `"${piece.literal.replaceAll('"', '""')}"`
        : `${tableRef}[${unbracket(fields[piece.placeholder]).replaceAll("]", "]]")}]`
    );
    const lines = [`${columnName} =`, terms[0]];
    terms.slice(1).forEach((term) => lines.push(`    & ${term}`));
    return lines.join("\n");
  }

  function downloadCsv(lines, fileName) {
    const csv = lines.map((values) => values.map(csvQuote).join(",")).join("\r\n") + "\r\n";

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function csvQuote(value) {
    return `"${(value ?? "").toString().replaceAll('"', '""')}"`;
  }

  function initEmbedGeneratorPage(context) {
    populateModelSelect(context.modelNames);

    const preferredModel = clean(params.get("data_model_name")) || context.modelNames[0] || "";
    if (preferredModel) {
      modelSelect.value = preferredModel;
    }

    modelSelect.addEventListener("change", () => {
      updateEmbedOutputs();
    });

    copyUrlBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(embedUrl.value);
        setEmbedStatus("Embed URL copied to clipboard.");
      } catch (err) {
        setEmbedStatus("Could not copy the URL automatically.");
        console.log(embedUrl.value);
      }
    });

    copyCodeBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(embedCode.value);
        setEmbedStatus("Embed code copied to clipboard.");
      } catch (err) {
        setEmbedStatus("Could not copy the embed code automatically.");
        console.log(embedCode.value);
      }
    });

    updateEmbedOutputs();
  }

  function populateModelSelect(modelNames) {
    if (!modelSelect) return;
    modelSelect.innerHTML = "";

    modelNames.forEach((modelName) => {
      const option = document.createElement("option");
      option.value = modelName;
      option.textContent = modelName;
      modelSelect.appendChild(option);
    });
  }

  function updateEmbedOutputs() {
    const selectedModel = modelSelect?.value || "";
    const url = buildEmbeddedUrl(selectedModel);
    const iframe = buildEmbedCode(url, selectedModel);

    if (embedUrl) {
      embedUrl.value = url;
    }
    if (embedCode) {
      embedCode.value = iframe;
    }
    if (embedStatus) {
      setEmbedStatus(
        selectedModel
          ? `Generating embed code for ${selectedModel}.`
          : "Select a data model to generate embed code."
      );
    }
  }

  function buildEmbeddedUrl(modelName) {
    const url = new URL("embedded.html", window.location.href);
    if (modelName) {
      url.searchParams.set("data_model_name", modelName);
    }
    return url.toString();
  }

  function buildEmbedCode(url, modelName) {
    const safeTitle = modelName ? `${escapeAttribute(modelName)} data model` : "Embedded data model";
    return `<iframe src="${escapeAttribute(url)}" title="${safeTitle}" width="100%" height="720" style="border:0;border-radius:12px;" loading="lazy"></iframe>`;
  }

  function createExplorerTable(rows) {
    return new DataTable("#modelTable", {
      data: rows,
      columns: [
        { data: "data_model_name", name: "data_model_name" },
        { data: "table_name", name: "table_name" },
        {
          data: "field_name",
          name: "field_name",
          render: (value, type) => {
            if (type !== "display") return value;
            return `<span class="field-cell">${escapeHtml(value)}</span>`;
          },
        },
        { data: "data_model_description", name: "data_model_description" },
        { data: "table_description", name: "table_description" },
        { data: "field_description", name: "field_description" },
      ],
      order: [
        [0, "asc"],
        [1, "asc"],
        [2, "asc"],
      ],
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250, 500],
      autoWidth: false,
      deferRender: true,
      language: {
        search: "Search all columns:",
      },
    });
  }

  function createEmbeddedTable(rows) {
    return new DataTable("#modelTable", {
      data: rows,
      columns: [
        { data: "table_name", name: "table_name" },
        { data: "field_name", name: "field_name" },
        { data: "field_description", name: "field_description" },
      ],
      order: [
        [0, "asc"],
        [1, "asc"],
      ],
      searching: true,
      layout: {
        topStart: "pageLength",
        topEnd: null,
      },
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250, 500],
      autoWidth: false,
      deferRender: true,
    });
  }

  function applyFilters(rows) {
    const filters = {
      dataModelName: normalize(params.get("data_model_name")),
      tableName: normalize(params.get("table_name")),
      fieldName: normalize(params.get("field_name")),
    };

    return rows.filter((row) => {
      return (
        matches(row.data_model_name, filters.dataModelName) &&
        matches(row.table_name, filters.tableName) &&
        matches(row.field_name, filters.fieldName)
      );
    });
  }

  function updateVisibleColumns(table) {
    const requestedColumns = parseList(params.get("cols"));
    if (!requestedColumns.length) return;
    const allowed = new Set([
      "data_model_name",
      "table_name",
      "field_name",
      "data_model_description",
      "table_description",
      "field_description",
    ]);
    const wanted = new Set(requestedColumns.filter((column) => allowed.has(column)));
    if (!wanted.size) return;

    table.columns().every(function () {
      const columnName = this.settings()[0].aoColumns[this.index()].name;
      this.visible(wanted.has(columnName));
    });
  }

  function decorateGroups(table) {
    $("#modelTable tbody tr.group-row").remove();
    const rows = table.rows({ page: "current" }).nodes();
    let lastModel = "";
    let lastTable = "";

    const modelCounts = new Map();
    const tableCounts = new Map();
    table.rows({ page: "current" }).data().each((row) => {
      modelCounts.set(row.data_model_name, (modelCounts.get(row.data_model_name) || 0) + 1);
      const tableKey = `${row.data_model_name}||${row.table_name}`;
      tableCounts.set(tableKey, (tableCounts.get(tableKey) || 0) + 1);
    });

    table.rows({ page: "current" }).every(function () {
      const rowNode = this.node();
      const data = this.data();
      const model = data.data_model_name;
      const tableName = data.table_name;
      const tableKey = `${model}||${tableName}`;

      if (model !== lastModel) {
        const modelCount = modelCounts.get(model) || 0;
        const collapsed = isCollapsedModel(model);
        $(rowNode).before(
          `<tr class="group-row model-level" data-model="${escapeAttribute(model)}">
            <td colspan="6">
              <button class="toggle-btn model-toggle" data-model="${escapeAttribute(model)}">${collapsed ? "▶" : "▼"} ${escapeHtml(model)}</button>
              <span class="count-chip">${modelCount} fields</span>
            </td>
          </tr>`
        );
        lastModel = model;
        lastTable = "";
      }

      if (tableName !== lastTable) {
        const tableCount = tableCounts.get(tableKey) || 0;
        const collapsed = isCollapsedTable(tableKey) || isCollapsedModel(model);
        $(rowNode).before(
          `<tr class="group-row table-level" data-model="${escapeAttribute(model)}" data-table="${escapeAttribute(tableKey)}">
            <td colspan="6">
              <button class="toggle-btn table-toggle" data-model="${escapeAttribute(model)}" data-table="${escapeAttribute(tableKey)}">${collapsed ? "▶" : "▼"} ${escapeHtml(tableName)}</button>
              <span class="count-chip">${tableCount} fields</span>
            </td>
          </tr>`
        );
        lastTable = tableName;
      }

      const hideRow = isCollapsedModel(model) || isCollapsedTable(tableKey);
      $(rowNode).toggle(!hideRow);
      $(rowNode).attr("data-model", model);
      $(rowNode).attr("data-table", tableKey);
    });

    bindGroupToggles(table);
  }

  function bindGroupToggles(table) {
    $(".model-toggle").off("click").on("click", function () {
      const model = $(this).data("model");
      if (isCollapsedModel(model)) {
        expandedModelOverrides.add(model);
        collapsedModels.delete(model);
      } else {
        collapsedModels.add(model);
        expandedModelOverrides.delete(model);
      }
      table.draw(false);
    });

    $(".table-toggle").off("click").on("click", function () {
      const tableKey = $(this).data("table");
      if (isCollapsedTable(tableKey)) {
        expandedTableOverrides.add(tableKey);
        collapsedTables.delete(tableKey);
      } else {
        collapsedTables.add(tableKey);
        expandedTableOverrides.delete(tableKey);
      }
      table.draw(false);
    });
  }

  function bindEmbedCopy() {
    if (!copyEmbedBtn) return;

    copyEmbedBtn.addEventListener("click", async () => {
      const src = window.location.href;
      const iframe = `<iframe src="${escapeAttribute(src)}" title="Data Model Explorer" width="100%" height="720" style="border:0;border-radius:12px;" loading="lazy"></iframe>`;
      try {
        await navigator.clipboard.writeText(iframe);
        setStatus("Embed code copied to clipboard.");
      } catch (err) {
        setStatus("Could not copy embed code automatically. Copy from console output.");
        console.log(iframe);
      }
    });
  }

  function setStatus(message, isError) {
    if (!statusBanner) return;
    statusBanner.textContent = message || "";
    statusBanner.classList.toggle("error", !!isError);
  }

  function setEmbedStatus(message) {
    if (!embedStatus) return;
    embedStatus.textContent = message || "";
    embedStatus.classList.remove("error");
  }

  function updateCount(count) {
    if (!rowCountEl) return;
    rowCountEl.textContent = `${count} rows`;
  }

  function isCollapsedModel(model) {
    if (collapsedModels.has(model)) return true;
    if (expandedModelOverrides.has(model)) return false;
    return defaultModelCollapsed;
  }

  function isCollapsedTable(tableKey) {
    if (collapsedTables.has(tableKey)) return true;
    if (expandedTableOverrides.has(tableKey)) return false;
    return defaultTableCollapsed;
  }

  function matches(value, filter) {
    if (!filter) return true;
    return normalize(value).includes(filter);
  }

  function parseList(value) {
    if (!value) return [];
    return value
      .split(",")
      .map((item) => normalize(item))
      .filter(Boolean);
  }

  function normalize(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function clean(value) {
    return (value || "").toString().trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
