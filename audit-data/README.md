# Opt-out audit data

This folder has the data behind Tables 1 and 2 of our paper ([arXiv:2610.29929](https://arxiv.org/abs/2610.29929)). For each of the 30 AI assistants and agent platforms we audited, it lists every control and related practice we found, the page it came from, and the date we read that page.

Vendors change their pages often, so a page may now say something different from what it said on the date in `read_on`.

## Files

| File | What it holds |
| ---- | ------------- |
| `controls.csv` | One row per control (952 rows) |
| `types.csv` | The 32 opt-out types (T01 to T32) from Table 1 of the paper, with the taxonomy code for each |
| `companies.csv` | The 22 companies in the sample, why each is in it, and the products we audited |

## How the rows add up to the paper

The paper counts only the 788 rows where `in_table_2` is `yes`: rows whose `kind` is "Setting or action" and that passed the second check. Table 2 counts them by product, and Table 1 counts them by `type`. The other 164 rows record practices with no opt-out, vendor commitments, built-in safeguards, and announced features that were not yet available. We keep them for context but do not count them as controls.

A row has at most one type, the one that fits it best. T01 to T24 map to the taxonomy. T25 to T32 do not: T25 is an application of the taxonomy, T27 is a legal mechanism, and the rest are out of scope (see Section 4.7 of the paper). Practices, announced features, and the one unverifiable row have no type.

Four companies in the sample had nothing to audit: TSMC, SK Hynix, Safe Superintelligence, and Skild AI. `companies.csv` says why.

## Dates

We read the pages in two rounds: the first 20 products on October 15, 2026, and the other 10 on October 16, 2026. `read_on` gives the date for each row. The paper's references give October 23, 2026, the date we checked the cited pages again. `page_date` is the date shown on the page itself, copied as written. It says "not shown" when the page had no date and is blank when we did not record one.

## Second check

A second pass reread the cited page for every row. `check_result` gives the outcome:

| Value | Meaning |
| ----- | ------- |
| `confirmed` | The page supports the row as written |
| `corrected` | The second pass fixed part of the row, such as the default, the plans, or the kind; the row shows the fixed version |
| `added by checker` | A control the second pass found on the cited page that the first pass missed |
| `unverifiable` | The second pass could not confirm the control; the row is kept but not counted |

## Columns in `controls.csv`

| Column | Meaning |
| ------ | ------- |
| `id` | Row ID, prefixed by company |
| `company` | Company in the sample, as named in `companies.csv` |
| `vendor_entity` | The legal entity or brand named on the vendor's pages |
| `product` | Product audited |
| `product_type` | Consumer assistant, developer platform, business agent platform, and so on |
| `control` | Name of the setting, action, or practice, as the vendor labels it |
| `where` | Where to find it |
| `what_it_does` | What it does, in our words |
| `default` | Its default state as the vendor gives it, or "not stated" |
| `kind` | Setting or action, Practice (no opt-out), Vendor commitment, Built-in safeguard, or Announced, not yet available |
| `plans` | Plans or account types that have it |
| `who` | Who can use it: user, admin, developer, or a request to the vendor |
| `limits` | Limits, exceptions, and notes on the control |
| `type` | Opt-out type, as in Table 1 (see `types.csv`); blank for rows with no type |
| `taxonomy` | Taxonomy code for `type` |
| `source_url` | Page we read; rows that rely on more than one page list them separated by " ; " |
| `source_kind` | Help article, docs, privacy policy, blog, site UI, or found by checker |
| `page_date` | Date shown on the page |
| `read_on` | Date we read the page |
| `check_result` | Outcome of the second check |
| `in_table_2` | Whether Table 2 counts the row |

The paper explains how we chose the companies and products and how we ran the audit.
