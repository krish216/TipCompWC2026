// Renders a schema.org JSON-LD block. Server-safe (no 'use client') so the markup lands in
// the initial HTML for crawlers and AI answer engines. Pass one object or an array.
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here (no user-controlled HTML); this is the standard
      // way to emit JSON-LD in Next's App Router.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
