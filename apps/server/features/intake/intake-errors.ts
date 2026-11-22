/** Error carrying an HTTP status and a stable machine code (the web maps the code to copy). */
export class IntakeError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown> = {}) { super(message); }
}
