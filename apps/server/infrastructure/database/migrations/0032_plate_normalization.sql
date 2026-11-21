-- 0032: robust Egyptian plate normalisation (Wave 2.7, P1-060).
-- garage_normalize_plate(text) is the SQL twin of normalizePlate() in packages/domain/src/plate.ts:
--   1. translate(): Arabic-Indic and Eastern digits -> ASCII, a-z -> A-Z, Alef/Yeh/Kaf/Heh variants -> canonical Arabic letter.
--   2. regexp_replace(): strip whitespace, dashes/minus, dot, underscore, tatweel, zero-width/bidi controls, BOM, tashkeel
--      (PostgreSQL ARE understands the \t \n \r \f \v and \uXXXX escapes inside bracket expressions).
--   3. letters first (typed order), then digits (typed order).
-- The translate strings and the strip class are generated from the TypeScript constants; plate.test.ts fails when this
-- file drifts from them. Idempotent (CREATE OR REPLACE / IF NOT EXISTS); not applied to any database yet.
-- Letter order is NOT normalised away here: reversed-letter search is done by the query with two patterns.

CREATE OR REPLACE FUNCTION garage_normalize_plate(plate text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT regexp_replace(t.s, '[0-9]', '', 'g') || regexp_replace(t.s, '[^0-9]', '', 'g')
  FROM (SELECT regexp_replace(translate(plate, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹abcdefghijklmnopqrstuvwxyzأإآٱىیئےؤکةۀہھ', '01234567890123456789ABCDEFGHIJKLMNOPQRSTUVWXYZااااييييوكهههه'),
                              '[ \t\n\r\f\v\u00a0\u1680\u2000-\u200f\u2010-\u2015\u2028-\u202f\u205f-\u206f\u2212\u3000\ufeff\u0640\u064b-\u065f\u0670._-]', '', 'g') AS s) t
$fn$;

-- Replaces the 0027 expression index (upper(regexp_replace(plate, '[\s-]', '', 'g'))), which cannot see Arabic or digit variants.
DROP INDEX IF EXISTS vehicles_plate_normalized_idx;
CREATE INDEX IF NOT EXISTS vehicles_plate_key_idx
  ON vehicles (garage_normalize_plate(plate) text_pattern_ops);
-- Deliberately NOT unique: duplicates (same customer, or same branch) are refused by the API with a 409 and the existing
-- vehicle. Legacy rows may already differ only by spelling, and a unique index would make this migration fail on them.
