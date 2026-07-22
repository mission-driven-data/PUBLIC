(function () {
  const FILES = {
    dataModels: "./data_model_documentation.csv",
    tables: "./table_documentation.csv",
    fields: "./field_documentation.csv",
  };

  const params = new URLSearchParams(window.location.search);
  const mode = detectMode();

  const statusBanner = document.getElementById("statusBanner");
  const rowCountEl = document.getElementById("rowCount");
  const copyEmbedBtn = document.getElementById("copyEmbedBtn");

  const embeddedTitle = document.getElementById("embeddedTitle");
  const embeddedDescription = document.getElementById("embeddedDescription");

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
    updateCount(table.rows({ search: "applied" }).count());
    table.on("draw", function () {
      updateCount(table.rows({ search: "applied" }).count());
    });
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
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250, 500],
      autoWidth: false,
      deferRender: true,
      language: {
        search: "Search all columns:",
      },
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
