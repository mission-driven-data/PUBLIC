(function () {
  "use strict";

  // The same configuration file the nightly run reads, so this page and the server can
  // never disagree about what the standard set is.
  const CONFIG_URL =
    "https://raw.githubusercontent.com/mission-driven-data/janet/main/configuration.csv";
  const DOWNLOAD_NAME = "janet-connect-diy-tables.csv";
  const SUPPORT_EMAIL = "solutions@missiondrivendata.com";

  const statusBanner = document.getElementById("statusBanner");
  const rowCountEl = document.getElementById("rowCount");
  const readAtEl = document.getElementById("readAt");
  const downloadBtn = document.getElementById("downloadBtn");

  const isEmbedded = document.body.classList.contains("embedded");
  const FETCH_TIMEOUT_MS = 15000;

  let rows = [];

  init();

  async function init() {
    setStatus("Reading the current table list.");
    try {
      const text = await fetchConfiguration();
      rows = selectDiyRows(parseConfiguration(text));
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

    if (!rows.length) {
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
    renderTable(rows);
    setCount(rows.length);
    setReadAt(new Date());
    setStatus("");
    armDownload();
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
      transformHeader: (header) => String(header || "").replace(/^\uFEFF/, "").trim(),
    });
    return results.data || [];
  }

  // DIY_Default is written as an uppercase TRUE or left blank. Anything else, blank or a
  // missing column included, is not in the set.
  function selectDiyRows(parsed) {
    return parsed
      .filter((row) => clean(row.DIY_Default).toUpperCase() === "TRUE")
      .map((row) => ({ schema: clean(row.Schema), table: clean(row.TableName) }))
      .filter((row) => row.schema && row.table)
      .sort(
        (a, b) =>
          compare(a.schema, b.schema) || compare(a.table, b.table)
      );
  }

  // The whole list is shown at once inside a scrolling body rather than paged, so the
  // search box and the column headers stay put while the reader scrolls.
  function renderTable(data) {
    new DataTable("#diyTable", {
      data: data,
      columns: [
        { data: "schema", title: "Schema", width: "22%" },
        { data: "table", title: "Table" },
      ],
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
  }

  function armDownload() {
    if (!downloadBtn) return;
    downloadBtn.disabled = false;
    downloadBtn.addEventListener("click", () => {
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = DOWNLOAD_NAME;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  function toCsv(data) {
    const lines = ["Schema,Table"];
    data.forEach((row) => {
      lines.push(csvField(row.schema) + "," + csvField(row.table));
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
