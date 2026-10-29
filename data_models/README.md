# Data Model Explorer

Static HTML/JavaScript app powered by DataTables that joins:
- `data_model_documentation.csv`
- `table_documentation.csv`
- `field_documentation.csv`

Output rows are field-level, enriched with table and data model descriptions.

`embedded.html` also has a Credible links view (`view=links`) that reads
`credible_links.csv`. See [Credible links view](#credible-links-view).

## Files
- `index.html`
- `embedded.html`
- `embed.html`
- `styles.css`
- `app.js`

All files are self-contained in `data_models/`.

## URL Parameters
- `data_model_name`: case-insensitive partial match
- `table_name`: case-insensitive partial match
- `field_name`: case-insensitive partial match
- `cols`: comma-separated visible columns
- `expand`: initial grouping expansion mode
- `view` (`embedded.html` only): `links` shows the Credible links list instead of the field
  table. Any other value, or none, shows the field table.

### `cols` values
- `data_model_name`
- `table_name`
- `field_name`
- `data_model_description`
- `table_description`
- `field_description`

### `expand` values
- `all` (default): fully expanded
- `none`: all groups collapsed
- `model`: data models expanded, tables collapsed

## Example URLs
```text
./index.html?data_model_name=credible&table_name=patient&expand=all
./index.html?field_name=date&cols=data_model_name,table_name,field_name&expand=model
./index.html?expand=none
```

## Iframe Embed Example
```html
<iframe
  src="https://YOUR-HOST/data_models/embedded.html?data_model_name=credible"
  title="Credible data model"
  width="100%"
  height="720"
  style="border:0;border-radius:12px;"
  loading="lazy"
></iframe>
```

Use `embed.html` to pick a model and generate the iframe snippet automatically.

On `embedded.html`, the search box filters rows by table name, field name or field description (case-insensitive, matches anywhere in the text), and the row count shows the filtered total.
`Export CSV` downloads the rows matching the current search, in the current sort order, as `<data_model_name>.csv` (or `<data_model_name>_filtered.csv` while a search is active) with the columns `Table Name,Field Name,Field Description`.

## Credible links view

`embedded.html?data_model_name=_MDD_JCT_CREDIBLE&view=links` lists every link into Credible
that Janet (JCT) builds, for the Credible area of the Community.

It reads `credible_links.csv` in this folder, in the reader's browser. That file is written by
`Setup/devops/PublicDocumentation/publish_documentation.py` in JCT, which `dev2prod.py` runs on
every release. It takes each URL pattern from the module SQL beside the semantic JSON (for
example `_MDD_JCT_CREDIBLE.sql`). Nobody edits the CSV by hand.

- Columns shown and exported: `Name`, `Link`, `Description`. The CSV's `JCT Field Name` and
  `JCT Tables` columns are not shown.
- Names are cleaned up at display time: the word `Link` is removed (`Client Link Allergies`
  shows as `Client Allergies`), and `Appointment` becomes `Service` in names and descriptions
  (`Appointment Link (Completed)` shows as `Service (Completed)`). The link URLs are shown
  exactly as they are in the CSV, with the record id as a placeholder such as `{client_id}`.
- The search box searches Name, Link and Description. `Export CSV` downloads the matching rows
  as `credible_links.csv` (or `credible_links_filtered.csv` while a search is active) with the
  columns `Name,Link,Description`.

```html
<iframe
  src="https://mission-driven-data.github.io/PUBLIC/data_models/embedded.html?data_model_name=_MDD_JCT_CREDIBLE&view=links"
  title="Credible links in Janet"
  width="100%"
  height="720"
  style="border:0;border-radius:12px;"
  loading="lazy"
></iframe>
```

To change what is on the list, change the link column in the module SQL (for example
`_MDD_JCT_CREDIBLE.sql`). The next release rewrites `credible_links.csv` and the view picks it
up on its next load.
