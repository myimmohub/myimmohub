# POLICY_CHANGELOG

## de-rental-2024

- Validity logic: default legal basis for tax year 2024
- Differences vs previous year: initial baseline in this package
- Changed thresholds / features: base below-market split threshold, acquisition-near-cost threshold, 2024 compatible form packs
- Changed form adapters: `elster-income-2024`, `elster-assessment-2024`
- Migration notes: no prior package version

## de-rental-2025

- Validity logic: default legal basis for tax year 2025
- Differences vs previous year: updated compatible form packs and feature flags for 2025 filing cycle
- Changed thresholds / features: retains baseline thresholds but switches default compatible packs to 2025 forms
- Changed form adapters: `elster-income-2025`, `elster-assessment-2025`
- Migration notes: recompute filing previews when upgrading from 2024 pack

## de-rental-2026-preview

- Validity logic: preview pack for upcoming form and policy changes
- Differences vs previous year: enables preview feature flags and future-compatible form-pack compatibility
- Changed thresholds / features: preview mode for planned legal/form updates
- Changed form adapters: preview-compatible 2026 form-pack slot, still mapped through stable adapter ids
- Migration notes: use for sandbox or pre-production validation only
