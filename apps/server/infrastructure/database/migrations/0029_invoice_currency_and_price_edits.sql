-- Draft warranty invoices store the currency their amounts are in. Existing drafts
-- default to EGP (the only currency used before selection existed). The set of allowed
-- codes lives in packages/domain/src/currencies.ts and is validated by the server, so
-- adding a currency later needs no migration; the CHECK only enforces ISO-style shape.
ALTER TABLE warranty_invoice_drafts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EGP';

ALTER TABLE warranty_invoice_drafts
  DROP CONSTRAINT IF EXISTS warranty_invoice_drafts_currency_shape_check;

ALTER TABLE warranty_invoice_drafts
  ADD CONSTRAINT warranty_invoice_drafts_currency_shape_check
  CHECK (currency ~ '^[A-Z]{3}$');

-- Owner price editing: a price-edit draft carries the proposed price/tax/effective date until it is
-- published (publication then writes the approved catalogue-pricing policy and the new price). Existing
-- rows and the immutability triggers are unaffected (the triggers fire on UPDATE/DELETE only).
ALTER TABLE catalogue_package_versions
  ADD COLUMN IF NOT EXISTS price_change jsonb;
