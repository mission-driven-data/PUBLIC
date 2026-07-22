# Data Model Explorer

Static HTML/JavaScript app powered by DataTables that joins:
- `data_model_documentation.csv`
- `table_documentation.csv`
- `field_documentation.csv`

Output rows are field-level, enriched with table and data model descriptions.

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
