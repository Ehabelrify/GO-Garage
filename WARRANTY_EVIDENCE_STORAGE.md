# Private warranty claim evidence

Warranty evidence is stored in a private Replit App Storage bucket. The application never returns a public object URL; staff download a file through the authenticated API, which rechecks access to the claim's branch before reading it.

## Enable storage

Add App Storage to this Replit project in the Project Editor. Replit provisions the private bucket and makes its ID available as `DEFAULT_OBJECT_STORAGE_BUCKET_ID`. Keep the variable managed by App Storage; do not paste a bucket ID into source code or browser configuration. Enable App Storage separately for each environment used by the app, including production.

Until the bucket variable is available to the running server, the upload control stays hidden and the claim screen explains that attachments are on hold. Text-based claim intake remains available.

## File handling

- Accepts JPEG, PNG, WebP and PDF files only, with content signatures checked against the extension.
- Maximum size is 8 MB per file and 10 attachments per claim.
- Files are private and served as downloads with `nosniff`, no-store caching, and attachment disposition.
- Claim branch access is checked for both upload and download; unauthorized roles receive no metadata or file bytes.
- The database stores only attachment metadata, uploader/time and a private object key.
- New evidence is append-only. Additions create a warranty audit event; users cannot silently replace or remove submitted evidence.
- Evidence upload is allowed only while a claim is open or under review; approved, denied, and closed claims reject new attachments in both the interface and API.

Private storage availability is not proof of production readiness by itself. Configure retention, backups, and any required malware scanning before using real customer evidence.
