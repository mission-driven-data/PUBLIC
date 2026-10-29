# Credible Links

A client-facing page that lists every link into Credible that Janet (JCT) builds, for the
Credible area of the Community.

The page reads `../data_models/credible_links.csv` in the reader's browser. That file is
written by `Setup/devops/PublicDocumentation/publish_documentation.py` in JCT, which
`dev2prod.py` runs on every release. It takes each URL pattern from the module SQL beside the
semantic JSON (for example `_MDD_JCT_CREDIBLE.sql`), and the tables that carry each link from
the JSON field documentation. Nobody edits the list by hand.

## Files

- `index.html`: the full page, for someone opening it directly
- `embedded.html`: the iframe target
- `styles.css`
- `app.js`

There is no build step.

## Behavior

- One row per distinct link: Link Name, the full Link with the record id as a placeholder such
  as `{client_id}`, the JCT Field that holds it, a short Description, and the JCT Tables that
  carry it. Field names that are built with more than one URL (for example `Appointment Link`
  for completed, incomplete and planner appointments) get one row each, told apart in the Link
  Name.
- The search box searches every column.
- **Copy** beside each link copies it. In a frame without clipboard permission it selects the
  link instead, so Ctrl+C copies it.
- **Download CSV** saves every row. In `embedded.html` the button opens `index.html?download=1`
  in a new tab, because the Community iframe sandbox blocks downloads; that page saves the file
  as soon as it loads.
- If the fetch fails, the page shows the reason and renders no table.

## Iframe embed

```html
<iframe
  src="https://mission-driven-data.github.io/PUBLIC/credible_links/embedded.html"
  title="Credible links in Janet"
  width="100%"
  height="720"
  style="border:0;border-radius:12px;"
  loading="lazy"
></iframe>
```

## Changing what is on the list

Change the link column in the module SQL (for example `_MDD_JCT_CREDIBLE.sql`). The next
release rewrites `credible_links.csv` and the page picks it up on its next load.
