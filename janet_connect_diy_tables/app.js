(function () {
  "use strict";

  // The same configuration file the nightly run reads, so this page and the server can
  // never disagree about what the standard set is.
  const CONFIG_URL =
    "https://raw.githubusercontent.com/mission-driven-data/janet/main/configuration.csv";
  const SUPPORT_EMAIL = "solutions@missiondrivendata.com";

  // Three views of the same file. "included" is what Janet Connect downloads on every
  // nightly run. "request" is what an agency can ask us to add. "all" is both together.
  const VIEWS = {
    all: {
      label: "All Tables",
      file: "janet-connect-all-tables.csv",
      subhead:
        "Every Credible table available on your Janet DIY server. The DIY column shows Yes " +
        "for tables downloaded on every nightly run. To request one marked No, email {mail} " +
        "and we will add it for your agency.",
    },
    request: {
      label: "Request",
      file: "janet-connect-requestable-tables.csv",
      subhead:
        "Tables you can ask us to add to your Janet DIY server. They are not downloaded by " +
        "default. To request one, email {mail} and we will add it for your agency.",
    },
    included: {
      label: "Included",
      file: "janet-connect-diy-tables.csv",
      subhead:
        "The Credible tables Janet Connect downloads to your Janet DIY server on every " +
        "nightly run, read live so it is always current. The set grows over time. Need a " +
        "table that is not here? Switch to Request to see what we can add, " +
        "or email {mail} and we will add it for your agency.",
    },
  };

  const statusBanner = document.getElementById("statusBanner");
  const rowCountEl = document.getElementById("rowCount");
  const readAtEl = document.getElementById("readAt");
  let downloadBtn = document.getElementById("downloadBtn");
  const subheadEl = document.querySelector(".subhead");
  const tableEl = document.getElementById("diyTable");

  const isEmbedded = document.body.classList.contains("embedded");
  const FETCH_TIMEOUT_MS = 15000;

  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  let currentView = VIEWS[requestedView] ? requestedView : "included";
  const wantsAutoDownload = !isEmbedded && params.get("download") === "1";

  let parsedRows = [];
  let dataTable = null;
  let toggleButtons = {};

  injectStyles();
  init();

  async function init() {
    setStatus("Reading the current table list.");
    try {
      const text = await fetchConfiguration();
      parsedRows = readRows(parseConfiguration(text));
    } catch (error) {
      console.error(error);
      fail(
        "The table list could not be read. This is usually a network or firewall rule " +
          "blocking github.com. Reload the page, or email " +
          SUPPORT_EMAIL +
          " and we will send you the list."
      );
      return;
    }

    if (!viewRows("included").length) {
      fail(
        "The table list was read but no tables were marked for Janet DIY. Rather than show you " +
          "a list we cannot stand behind, we have left it off. Please email " +
          SUPPORT_EMAIL +
          "."
      );
      return;
    }

    // The table is kept off the page until there is something to put in it. A table of
    // column headers and nothing else reads as a very short list.
    document.body.classList.add("has-list");
    setReadAt(new Date());
    buildToggle();
    prepareDownloadControl();
    showView(currentView);
    setStatus("");

    if (wantsAutoDownload) {
      saveCsv();
      setStatus(
        "Your download of the " +
          VIEWS[currentView].label.toLowerCase() +
          " list should start on its own. If it does not, use Download CSV."
      );
    }
  }

  // A firewall that drops the request rather than refusing it would otherwise leave the
  // reader on "reading the list" forever, so the wait is bounded.
  async function fetchConfiguration() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(CONFIG_URL, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error("configuration.csv returned HTTP " + response.status);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function parseConfiguration(text) {
    const results = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => String(header || "").replace(/^﻿/, "").trim(),
    });
    return results.data || [];
  }

  // DIY_Default and Hidden are written as an uppercase TRUE or left blank. Community is an
  // optional column: while it is absent from the file every row counts, and once it is
  // there only rows marked TRUE are offered for request.
  function readRows(parsed) {
    return parsed
      .map((row) => ({
        schema: clean(row.Schema),
        table: clean(row.TableName),
        isDefault: isTrue(row.DIY_Default),
        hidden: isTrue(row.Hidden),
        community: row.Community === undefined ? true : isTrue(row.Community),
      }))
      .filter((row) => row.schema && row.table)
      .sort((a, b) => compare(a.schema, b.schema) || compare(a.table, b.table));
  }

  // Included is exactly what it has always been. Request is every visible table that is not
  // already included. All Tables is the two together.
  function viewRows(view) {
    const requestable = (row) => !row.isDefault && !row.hidden && row.community;
    if (view === "all") return parsedRows.filter((row) => row.isDefault || requestable(row));
    if (view === "request") return parsedRows.filter(requestable);
    return parsedRows.filter((row) => row.isDefault);
  }

  function showView(view) {
    currentView = view;
    const data = viewRows(view).map((row) => ({
      schema: row.schema,
      table: row.table,
      diy: row.isDefault ? "Yes" : "No",
    }));

    const columns = [
      { data: "schema", title: "Schema", width: "22%" },
      { data: "table", title: "Table" },
      { data: "diy", title: "DIY", width: "12%" },
    ];

    // DataTables keeps its own header and body, so the table is torn down and rebuilt
    // when the columns change.
    if (dataTable) {
      dataTable.destroy();
      dataTable = null;
    }
    tableEl.innerHTML = "<thead><tr>" + columns.map((c) => "<th>" + c.title + "</th>").join("") + "</tr></thead>";

    dataTable = new DataTable("#diyTable", {
      data: data,
      columns: columns,
      order: [
        [0, "asc"],
        [1, "asc"],
      ],
      paging: false,
      info: false,
      autoWidth: false,
      // Embedded, styles.css hands the height of the scroll body to the flex column so
      // the list fills whatever the frame gives it. This is the starting value.
      scrollY: isEmbedded ? "360px" : "58vh",
      scrollCollapse: true,
      language: {
        search: "Find a table:",
        zeroRecords: "No table matches that search.",
      },
    });

    setCount(data.length);
    updateSubhead();
    updateToggle();
    updateDownloadLink();
  }

  function buildToggle() {
    const host = document.querySelector(".header-meta");
    if (!host) return;
    const wrap = document.createElement("div");
    wrap.className = "view-toggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Which tables to show");
    Object.keys(VIEWS).forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = VIEWS[key].label;
      button.addEventListener("click", () => {
        if (key !== currentView) showView(key);
      });
      wrap.appendChild(button);
      toggleButtons[key] = button;
    });
    host.insertBefore(wrap, host.firstChild);
  }

  function updateToggle() {
    Object.keys(toggleButtons).forEach((key) => {
      const active = key === currentView;
      toggleButtons[key].classList.toggle("active", active);
      toggleButtons[key].setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function updateSubhead() {
    if (!subheadEl) return;
    const parts = VIEWS[currentView].subhead.split("{mail}");
    subheadEl.textContent = "";
    parts.forEach((part, index) => {
      subheadEl.appendChild(document.createTextNode(part));
      if (index < parts.length - 1) {
        const link = document.createElement("a");
        link.href = "mailto:" + SUPPORT_EMAIL;
        link.textContent = SUPPORT_EMAIL;
        subheadEl.appendChild(link);
      }
    });
  }

  // Inside the Community the page runs in a frame that may not allow downloads, and a
  // blocked download fails without a word. So the embedded button becomes a plain link
  // that opens the full page in its own tab, which saves the file there.
  function prepareDownloadControl() {
    if (!downloadBtn) return;
    if (isEmbedded) {
      const link = document.createElement("a");
      link.id = "downloadBtn";
      link.className = downloadBtn.className;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = downloadBtn.textContent;
      downloadBtn.replaceWith(link);
      downloadBtn = link;
    } else {
      downloadBtn.disabled = false;
      downloadBtn.addEventListener("click", saveCsv);
    }
  }

  function updateDownloadLink() {
    if (!downloadBtn || !isEmbedded) return;
    const url = new URL("index.html", window.location.href);
    url.search = "";
    url.searchParams.set("view", currentView);
    url.searchParams.set("download", "1");
    downloadBtn.href = url.toString();
  }

  function saveCsv() {
    const csv = toCsv(viewRows(currentView));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = VIEWS[currentView].file;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCsv(data) {
    const lines = ["Schema,Table,DIY"];
    data.forEach((row) => {
      lines.push(csvField(row.schema) + "," + csvField(row.table) + "," + (row.isDefault ? "Yes" : "No"));
    });
    return lines.join("\r\n") + "\r\n";
  }

  function csvField(value) {
    const text = String(value == null ? "" : value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  // An empty table reads as a very short list, which is worse than an error, so on any
  // failure the table goes away entirely and the banner carries the explanation.
  function fail(message) {
    setStatus(message, true);
    document.body.classList.remove("has-list");
    if (rowCountEl) rowCountEl.textContent = "List unavailable";
    if (readAtEl) readAtEl.textContent = "";
    if (downloadBtn) downloadBtn.disabled = true;
  }

  function setStatus(message, isError) {
    if (!statusBanner) return;
    statusBanner.textContent = message || "";
    statusBanner.classList.toggle("error", !!isError);
  }

  function setCount(count) {
    if (!rowCountEl) return;
    rowCountEl.textContent = count === 1 ? "1 table" : count + " tables";
  }

  function setReadAt(when) {
    if (!readAtEl) return;
    readAtEl.textContent = "List read " + formatStamp(when);
  }

  function formatStamp(when) {
    const month = pad(when.getMonth() + 1);
    const day = pad(when.getDate());
    const year = when.getFullYear();
    let hour = when.getHours();
    const meridiem = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return month + "/" + day + "/" + year + " " + hour + ":" + pad(when.getMinutes()) + " " + meridiem;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent =
      ".view-toggle{display:inline-flex;border:1px solid #008ad8;border-radius:999px;overflow:hidden}" +
      ".view-toggle button{font:inherit;font-size:.9rem;font-weight:600;padding:6px 14px;border:0;" +
      "background:#fff;color:#08284d;cursor:pointer}" +
      ".view-toggle button+button{border-left:1px solid #008ad8}" +
      ".view-toggle button.active{background:#008ad8;color:#fff}" +
      ".view-toggle button:focus-visible{outline:2px solid #ff9f00;outline-offset:-2px}" +
      "a#downloadBtn{display:inline-block;text-decoration:none;text-align:center}";
    document.head.appendChild(style);
  }

  function isTrue(value) {
    return clean(value).toUpperCase() === "TRUE";
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function compare(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  }
})();
