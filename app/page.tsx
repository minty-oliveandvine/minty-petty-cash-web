/**
 * `/`: proxy.ts sends a person with a token to their company's Petty Cash, and one without to
 * Flask's hand-off - so this renders only for a token that names no company, which Flask never
 * mints for this app.
 */
export default function Root() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p className="text-sm text-flask-gray-500">Open Petty Cash from your company in Minty.</p>
    </main>
  );
}
