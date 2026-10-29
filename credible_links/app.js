(function () {
  "use strict";

  // credible_links.csv is written by publish_documentation.py in JCT on every release, from the
  // link columns the Credible module SQL builds, so this page never has to be edited by hand.
  const CSV_URL = "../data_models/credible_links.csv";
  const DOWNLOAD_FILE = "credible-links.csv";
  const SUPPORT_EMAIL = "solutions@missiondrivendata.com";
  const COLUMNS = ["Link Name", "Link", "JCT Field Name", "Description", "JCT Tables"];

  const isBrowser = typeof document !== "undefined";
  const isEmbedded = isBrowser && document.body.classList.contains("embedded");
  const FETCH_TIMEOUT_MS = 15000;

  let statusBanner, rowCountEl, readAtEl, downloadBtn, tableEl;
  let parsedRows = [];

  if (isBrowser) {
    statusBanner = document.getElementById("statusBanner");
    rowCountEl = document.getElementById("rowCount");
    readAtEl = document.getElementById("readAt");
    downloadBtn = document.getElementById("downloadBtn");
    tableEl = document.getElementById("linksTable");
    init();
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const wantsAutoDownload = !isEmbedded && params.get("download") === "1";

    setStatus("Reading the current list of Credible links.");
    try {
      const text = await fetchCsv();
      parsedRows = readRows(parseCsv(text));
    } catch (error) {
      console.error(error);
      fail(
        "The list of Credible links could not be read. This is usually a network or firewall rule " +
          "blocking github.io. Reload the page, or email " +
          SUPPORT_EMAIL +
          " and we will send you the list."
      );
      return;
    }

    if (!parsedRows.length) {
      fail(
        "The list was read but it had no links in it. Rather than show you a list we cannot stand " +
          "behind, we have left it off. Please email " +
          SUPPORT_EMAIL +
          "."
      );
      return;
    }

    // The table is kept off the page until there is something to put in it.
    document.body.classList.add("has-list");
    setReadAt(new Date());
    prepareDownloadControl();
    showTable();
    setStatus("");

    if (wantsAutoDownload) {
      saveCsv();
      setStatus("Your download should start on its own. If it does not, use Download CSV.");
    }
  }

  // A firewall that drops the request rather than refusing it would otherwise leave the reader
  // on "reading the list" forever, so the wait is bounded.
  async function fetchCsv() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(CSV_URL, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error("credible_links.csv returned HTTP " + response.status);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function parseCsv(text) {
    const results = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => String(header || "").replace(/^﻿/, "").trim(),
    });
    return results.data || [];
  }

  // A row needs a name and a link. Anything else is shown as it is.
  function readRows(parsed) {
    return parsed
      .map((row) => ({
        name: clean(row["Link Name"]),
        link: clean(row["Link"]),
        field: clean(row["JCT Field Name"]),
        description: clean(row["Description"]),
        tables: clean(row["JCT Tables"]),
      }))
      .filter((row) => row.name && row.link)
      .sort((a, b) => compare(a.name, b.name));
  }

  function showTable() {
    new DataTable("#linksTable", {
      data: parsedRows,
      columns: [
        { data: "name", title: "Link Name", width: "16%" },
        { data: "link", title: "Link", width: "34%", className: "link-cell", render: renderLink },
        { data: "field", title: "JCT Field", width: "14%" },
        { data: "description", title: "Description", width: "20%" },
        { data: "tables", title: "JCT Tables", className: "tables-cell", render: renderTables },
      ],
      order: [[0, "asc"]],
      paging: false,
      info: false,
      autoWidth: false,
      // Embedded, styles.css hands the height of the scroll body to the flex column so the
      // list fills whatever the frame gives it. This is the starting value.
      scrollY: isEmbedded ? "360px" : "62vh",
      scrollCollapse: true,
      scrollX: true,
      language: {
        search: "Search:",
        zeroRecords: "No link matches that search.",
      },
    });

    tableEl.addEventListener("click", (event) => {
      const button = event.target.closest("button.copy-link");
      if (button) copyLink(button);
    });
    setCount(parsedRows.length);
  }

  // The link is written out in full so it can be copied and pasted. It is not made clickable,
  // because the {placeholder} has to be replaced with a real id first.
  function renderLink(value, type) {
    if (type !== "display") return value;
    return (
      '<span class="link-text">' +
      escapeHtml(value) +
      '</span><button type="button" class="copy-link" aria-label="Copy link">Copy</button>'
    );
  }

  function renderTables(value, type) {
    if (type !== "display") return value;
    return escapeHtml(value).split("; ").join(";<br>");
  }

  // A frame without clipboard permission refuses the copy, so the text is selected instead and
  // the reader can press Ctrl+C.
  async function copyLink(button) {
    const textEl = button.parentElement.querySelector(".link-text");
    const text = textEl ? textEl.textContent : "";
    try {
      await navigator.clipboard.writeText(text);
      flash(button, "Copied");
    } catch (error) {
      const range = document.createRange();
      range.selectNodeContents(textEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      flash(button, "Press Ctrl+C");
    }
  }

  function flash(button, label) {
    button.textContent = label;
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1600);
  }

  // Inside the Community the page runs in a frame that may not allow downloads, and a blocked
  // download fails without a word. So the embedded button becomes a plain link that opens the
  // full page in its own tab, which saves the file there.
  function prepareDownloadControl() {
    if (!downloadBtn) return;
    if (isEmbedded) {
      const link = document.createElement("a");
      link.id = "downloadBtn";
      link.className = downloadBtn.className;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = downloadBtn.textContent;
      const url = new URL("index.html", window.location.href);
      url.search = "";
      url.searchParams.set("download", "1");
      link.href = url.toString();
      downloadBtn.replaceWith(link);
      downloadBtn = link;
    } else {
      downloadBtn.disabled = false;
      downloadBtn.addEventListener("click", saveCsv);
    }
  }

  function saveCsv() {
    const blob = new Blob([toCsv(parsedRows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = DOWNLOAD_FILE;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCsv(rows) {
    const lines = [COLUMNS.map(csvField).join(",")];
    rows.forEach((row) => {
      lines.push([row.name, row.link, row.field, row.description, row.tables].map(csvField).join(","));
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

  // An empty table reads as a very short list, which is worse than an error, so on any failure
  // the table goes away entirely and the banner carries the explanation.
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
    rowCountEl.textContent = count === 1 ? "1 link" : count + " links";
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  // Lets a Node check read the CSV through exactly the logic the page uses.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseCsv, readRows, toCsv };
  }
})();
