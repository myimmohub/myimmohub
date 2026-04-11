# tax-engine-rental-de

`tax-engine-rental-de` is a policy-driven TypeScript core for German private rental tax cases. It computes all tax summaries from primary events, applies review gates where legal certainty ends, and emits filing previews through versioned adapters instead of hardcoded form logic in the core.

## What the module does

- Computes income from letting and leasing under German rental-tax rules
- Supports direct income-tax and assessment-unit filing contexts
- Handles long-term rentals, holiday rentals, mixed use, below-market rent, owner-specific items, maintenance distributions, depreciation, and ownership changes during the year
- Produces deterministic calculation summaries, filing recommendations, filing previews, provenance, and audit logs

## What it deliberately does not auto-decide

- Cases that likely fall outside private rental taxation
- Ambiguous ownership, usufruct, or trustee structures
- Insufficient evidence cases for holiday-apartment intention or vacancy
- Below-market rent cases that need a total-surplus forecast but do not provide one
- Filing profiles that conflict with explicit user requests

These paths are routed to `review_required` or `blocking_error`.

## Architecture

- `domain/`: stable public data model
- `policy/`: versioned legal and threshold packs
- `classification/`: ownership, rental-mode, income-regime, and filing-profile routing
- `validation/`: blocking and review validators
- `calculation/`: pure computation pipeline
- `mapping/`: versioned filing adapters
- `provenance/`: calculation lineage
- `audit/`: override and decision trail
- `api/`: public exports

## Core vs Adapter vs Policy Pack

- Core: computes legal-tax outcomes from structured events
- Policy pack: changes year-dependent legal thresholds and feature flags
- Adapter: maps stable calculation output into form-pack-specific preview fields

## Supported scenarios

- Single owner with long-term residential rental
- Limited-tax contexts
- Spouses and co-ownership
- Inheritance communities
- Asset-managing GbR / assessment units
- Share import into `V-Sonstige`
- Holiday apartments with and without self-use
- Mixed-use and below-market rental scenarios
- Mid-year share changes
- Owner-specific expenses and special income

## Review-routed scenarios

- Possible business assets
- Possible trade/business operation instead of Section 21 rental income
- International edge cases
- Ambiguous beneficial ownership
- Special depreciation without evidence
- Holiday vacancy without sufficient evidence

## Data model

The public entrypoint is `computeRentalTaxCase(input)`. All money is represented in cents, all dates are ISO strings, and all derived values are recalculated from events.

## Calculation pipeline

1. Normalize input and owner identities
2. Detect duplicate owners and ownership conflicts
3. Resolve ownership model
4. Resolve rental mode
5. Resolve income regime
6. Resolve filing profile
7. Run blocking/review validation
8. Classify expenses
9. Evaluate acquisition-near-cost bucket
10. Compute revenues
11. Compute deductible expenses
12. Compute maintenance distributions
13. Compute depreciation
14. Evaluate below-market rental logic and forecast gate
15. Evaluate holiday-apartment allocation and review gates
16. Allocate results to owners with time slicing
17. Generate filing previews
18. Emit provenance and audit log
19. Set final status

## Validation and review system

- `blocking_error`: hard-stop because data is inconsistent or legally unsafe
- `review_required`: calculation exists, but export must be reviewed
- `ok`: deterministic output path with no open blocking/review gates

## Filing adapters

The package ships these mandatory adapters:

- `est1a_v`
- `est1a_v_fewo`
- `est1a_v_sonstige`
- `est1c_v`
- `est1c_v_fewo`
- `est1c_v_sonstige`
- `est1b_fb_v`
- `est1b_fb_v_fewo`
- `fw_optional_side_adapter`

## Example input

See [examples/example-input.json](/Users/leotacke/Documents/Privat/Immohub/myimmohub/packages/tax-engine-rental-de/examples/example-input.json).

## Example output

See [examples/example-output.json](/Users/leotacke/Documents/Privat/Immohub/myimmohub/packages/tax-engine-rental-de/examples/example-output.json).

## Test strategy

- named fixtures for each mandatory scenario from the Pflichtenheft
- acceptance manifests for filing-path coverage
- golden manifests for each main filing path

## How to add a new tax year or form pack

1. Create a new policy pack under `policy/packs/`
2. Extend the changelog and legal basis
3. Add or revise the matching form-pack adapter set
4. Add fixture coverage for any changed thresholds or review gates
