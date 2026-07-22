(function () {
  const FILES = {
    dataModels: "./data_model_documentation.csv",
    tables: "./table_documentation.csv",
    fields: "./field_documentation.csv",
  };

  const params = new URLSearchParams(window.location.search);
  const filters = {
    dataModelName: normalize(params.get("data_model_name")),
    tableName: normalize(params.get("table_name")),
    fieldName: normalize(params.get("field_name")),
  };
  const expandParam = normalize(params.get("expand")) || "all";
  const requestedColumns = parseList(params.get("cols"));

  const statusBanner = document.getElementById("statusBanner");
  const rowCountEl = document.getElementById("rowCount");
  const copyEmbedBtn = document.getElementById("copyEmbedBtn");

  const collapsedModels = new Set();
  const collapsedTables = new Set();
  const defaultModelCollapsed = expandParam === "none";
  const defaultTableCollapsed = expandParam === "none" || expandParam === "model";
  const expandedModelOverrides = new Set();
  const expandedTableOverrides = new Set();

  init();

  async function init() {
    try {
      setStatus("Loading CSV data...");
      const [dmRows, tableRows, fieldRows] = await Promise.all([
        loadCsv(FILES.dataModels),
        loadCsv(FILES.tables),
        loadCsv(FILES.fields),
      ]);

      const joined = buildJoinedRows(dmRows, tableRows, fieldRows);
      const filtered = applyFilters(joined);

      if (!filtered.length) {
        setStatus("No matching rows found for current URL filters.");
      } else {
        setStatus("");
      }

      const table = createDataTable(filtered);
      updateVisibleColumns(table);
      bindEmbedCopy();
      updateCount(table.rows({ search: "applied" }).count());
      table.on("draw", function () {
        decorateGroups(table);
        updateCount(table.rows({ search: "applied" }).count());
      });
      decorateGroups(table);
    } catch (error) {
      setStatus("Failed to load table data.", true);
      console.error(error);
    }
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

  function buildJoinedRows(dmRows, tableRows, fieldRows) {
    const dmByName = new Map();
    dmRows.forEach((row) => {
      dmByName.set(clean(row["Data Model Name"]), clean(row["Data Model Description"]));
    });

    const tableInfoByTable = new Map();
    tableRows.forEach((row) => {
      const tableName = clean(row["Table Name"]);
      tableInfoByTable.set(tableName, {
        dataModelName: clean(row["Data Model Name"]),
        tableDescription: clean(row["Table Description"]),
      });
    });

    const merged = [];
    fieldRows.forEach((row) => {
      const tableName = clean(row["Table Name"]);
      const tableInfo = tableInfoByTable.get(tableName);
      if (!tableInfo) return;

      const dataModelName = tableInfo.dataModelName;
      merged.push({
        data_model_name: dataModelName,
        table_name: tableName,
        field_name: clean(row["Field Name"]),
        data_model_description: dmByName.get(dataModelName) || "",
        table_description: tableInfo.tableDescription,
        field_description: clean(row["Field Description"]),
      });
    });

    return merged;
  }

  function applyFilters(rows) {
    return rows.filter((row) => {
      return (
        matches(row.data_model_name, filters.dataModelName) &&
        matches(row.table_name, filters.tableName) &&
        matches(row.field_name, filters.fieldName)
      );
    });
  }

  function createDataTable(rows) {
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
      order: [[0, "asc"], [1, "asc"], [2, "asc"]],
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250, 500],
      autoWidth: false,
      deferRender: true,
      language: {
        search: "Search all columns:",
      },
    });
  }

  function updateVisibleColumns(table) {
    if (!requestedColumns.length) return;
    const allowed = new Set([
      "data_model_name",
      "table_name",
      "field_name",
      "data_model_description",
      "table_description",
      "field_description",
    ]);
    const wanted = new Set(requestedColumns.filter((c) => allowed.has(c)));
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
    let modelCount = 0;
    let tableCount = 0;

    const modelCounts = new Map();
    const tableCounts = new Map();
    table.rows({ page: "current" }).data().each((r) => {
      modelCounts.set(r.data_model_name, (modelCounts.get(r.data_model_name) || 0) + 1);
      const tKey = `${r.data_model_name}||${r.table_name}`;
      tableCounts.set(tKey, (tableCounts.get(tKey) || 0) + 1);
    });

    table.rows({ page: "current" }).every(function () {
      const rowNode = this.node();
      const data = this.data();
      const model = data.data_model_name;
      const tableName = data.table_name;
      const tableKey = `${model}||${tableName}`;

      if (model !== lastModel) {
        modelCount = modelCounts.get(model) || 0;
        const collapsed = isCollapsedModel(model);
        $(rowNode).before(
          `<tr class="group-row model-level" data-model="${escapeAttr(model)}">
            <td colspan="6">
              <button class="toggle-btn model-toggle" data-model="${escapeAttr(model)}">${collapsed ? "▶" : "▼"} ${escapeHtml(model)}</button>
              <span class="count-chip">${modelCount} fields</span>
            </td>
          </tr>`
        );
        lastModel = model;
        lastTable = "";
      }

      if (tableName !== lastTable) {
        tableCount = tableCounts.get(tableKey) || 0;
        const collapsed = isCollapsedTable(tableKey) || isCollapsedModel(model);
        $(rowNode).before(
          `<tr class="group-row table-level" data-model="${escapeAttr(model)}" data-table="${escapeAttr(tableKey)}">
            <td colspan="6">
              <button class="toggle-btn table-toggle" data-model="${escapeAttr(model)}" data-table="${escapeAttr(tableKey)}">${collapsed ? "▶" : "▼"} ${escapeHtml(tableName)}</button>
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
    copyEmbedBtn.addEventListener("click", async () => {
      const src = window.location.href;
      const iframe = `<iframe src="${src}" title="Data Model Explorer" width="100%" height="720" style="border:0;border-radius:12px;" loading="lazy"></iframe>`;
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
    statusBanner.textContent = message || "";
    statusBanner.classList.toggle("error", !!isError);
  }

  function updateCount(count) {
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
      .map((x) => normalize(x))
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

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('"', "&quot;");
  }
})();
