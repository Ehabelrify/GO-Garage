-- Wave 6 (U-E): technician mode extras. Notes, per-service checklists, photos, issue reports and a job audit trail.
-- Idempotent; not applied anywhere. Reserved number: 0037.

CREATE TABLE IF NOT EXISTS job_notes (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  author_user_id text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_notes_job_idx ON job_notes (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_checklist_templates (
  id text PRIMARY KEY,
  service_id text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('prep', 'application', 'curing', 'qc')),
  position integer NOT NULL,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS job_checklist_templates_service_idx ON job_checklist_templates (service_id, position);

CREATE TABLE IF NOT EXISTS job_checklist_items (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  template_id text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('prep', 'application', 'curing', 'qc')),
  position integer NOT NULL,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  done boolean NOT NULL DEFAULT false,
  done_by text,
  done_by_name text,
  done_at timestamptz,
  UNIQUE (job_id, template_id)
);
CREATE INDEX IF NOT EXISTS job_checklist_items_job_idx ON job_checklist_items (job_id, position);

CREATE TABLE IF NOT EXISTS job_photos (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  kind text NOT NULL CHECK (kind IN ('before', 'after', 'damage')),
  object_name text NOT NULL,
  original_filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  caption text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL,
  uploaded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_photos_job_idx ON job_photos (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_issues (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  branch_id text NOT NULL REFERENCES branches(id),
  kind text NOT NULL CHECK (kind IN ('damage-found', 'part-missing', 'customer-request', 'delay')),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 2000),
  photo_id text REFERENCES job_photos(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  reported_by text NOT NULL,
  reported_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by text,
  resolved_by_name text,
  resolved_at timestamptz,
  resolution text
);
CREATE INDEX IF NOT EXISTS job_issues_job_idx ON job_issues (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_issues_open_idx ON job_issues (branch_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS job_audit_events (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  actor_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_audit_events_job_idx ON job_audit_events (job_id, created_at DESC);

-- Seed templates (editable data; the steps are suggestions, not an approved procedure).
INSERT INTO job_checklist_templates (id, service_id, phase, position, label_en, label_ar, mandatory) VALUES
  ('tpl-default-1', '*', 'prep', 10, 'Check the vehicle and note existing marks', 'فحص السيارة وتسجيل أي علامات موجودة', true),
  ('tpl-default-2', '*', 'prep', 20, 'Clean and prepare the work area', 'تنظيف وتجهيز مكان العمل', false),
  ('tpl-default-3', '*', 'application', 30, 'Carry out the service as quoted', 'تنفيذ الخدمة حسب عرض السعر', true),
  ('tpl-default-4', '*', 'curing', 40, 'Allow settling or curing time', 'ترك وقت كافٍ للتثبيت أو الجفاف', false),
  ('tpl-default-5', '*', 'qc', 50, 'Final quality check in good light', 'فحص الجودة النهائي تحت إضاءة جيدة', true),
  ('tpl-default-6', '*', 'qc', 60, 'Clean the vehicle for handover', 'تنظيف السيارة للتسليم', false),

  ('tpl-inspection-1', 'inspection', 'prep', 10, 'Photograph the vehicle condition', 'تصوير حالة السيارة', true),
  ('tpl-inspection-2', 'inspection', 'application', 20, 'Complete every inspection item', 'إتمام جميع بنود الفحص', true),
  ('tpl-inspection-3', 'inspection', 'qc', 30, 'Write the findings for the manager', 'كتابة النتائج للمدير', true),

  ('tpl-tint-1', 'tint', 'prep', 10, 'Clean the glass inside and out', 'تنظيف الزجاج من الداخل والخارج', true),
  ('tpl-tint-2', 'tint', 'prep', 20, 'Protect door trims and seals', 'حماية الأطراف والمطاط', false),
  ('tpl-tint-3', 'tint', 'application', 30, 'Cut and fit the film on every window', 'قص وتركيب الفيلم على كل النوافذ', true),
  ('tpl-tint-4', 'tint', 'curing', 40, 'Squeeze out water and check for bubbles', 'تفريغ الماء والتأكد من عدم وجود فقاعات', true),
  ('tpl-tint-5', 'tint', 'qc', 50, 'Check edges, dust and defogger lines', 'فحص الحواف والغبار وخطوط إزالة الضباب', true),

  ('tpl-audio-1', 'audio', 'prep', 10, 'Disconnect the battery and protect the trim', 'فصل البطارية وحماية الأجزاء الداخلية', true),
  ('tpl-audio-2', 'audio', 'application', 20, 'Install and wire the equipment', 'تركيب وتوصيل الأجهزة', true),
  ('tpl-audio-3', 'audio', 'application', 30, 'Test sound, fuses and fit', 'اختبار الصوت والفيوزات والتثبيت', true),
  ('tpl-audio-4', 'audio', 'qc', 40, 'Refit the trim with no rattles', 'إعادة تركيب الأجزاء بدون اهتزاز', true),

  ('tpl-ceramic-1', 'ceramic', 'prep', 10, 'Wash and decontaminate the paint', 'غسل الطلاء وإزالة الملوثات', true),
  ('tpl-ceramic-2', 'ceramic', 'prep', 20, 'Polish the paint if needed', 'تلميع الطلاء عند الحاجة', false),
  ('tpl-ceramic-3', 'ceramic', 'application', 30, 'Apply the coating panel by panel', 'وضع الطلاء قطعة بقطعة', true),
  ('tpl-ceramic-4', 'ceramic', 'curing', 40, 'Keep the car dry for the curing time', 'إبقاء السيارة جافة طوال مدة التثبيت', true),
  ('tpl-ceramic-5', 'ceramic', 'qc', 50, 'Inspect for high spots and streaks', 'فحص أي بقع أو خطوط زائدة', true),

  ('tpl-full-ppf-1', 'full-ppf', 'prep', 10, 'Wash and decontaminate the paint', 'غسل الطلاء وإزالة الملوثات', true),
  ('tpl-full-ppf-2', 'full-ppf', 'application', 20, 'Fit the film panel by panel', 'تركيب الفيلم قطعة بقطعة', true),
  ('tpl-full-ppf-3', 'full-ppf', 'application', 30, 'Trim and wrap the edges', 'قص وتغليف الحواف', true),
  ('tpl-full-ppf-4', 'full-ppf', 'curing', 40, 'Keep the car dry for the curing time', 'إبقاء السيارة جافة طوال مدة التثبيت', true),
  ('tpl-full-ppf-5', 'full-ppf', 'qc', 50, 'Check for lifting, bubbles and dust', 'فحص الرفع والفقاعات والغبار', true)
ON CONFLICT (id) DO NOTHING;
