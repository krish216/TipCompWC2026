// Inline SVG illustrations for visual quiz questions. Self-contained (no external assets, so
// nothing to license or host), keyed by the Question.image string. Add new keys here.

function TabbyCat() {
  // A brown tabby: single base colour with darker stripes and the classic forehead "M" — the
  // markings that make it unambiguously a tabby rather than a calico, tuxedo, or solid cat.
  const base = '#b89b76', stripe = '#6d5638', inner = '#e8c8a0'
  return (
    <svg viewBox="0 0 200 170" role="img" aria-label="A striped tabby cat" className="h-40 w-auto">
      {/* ears */}
      <path d="M46 60 L38 18 L82 44 Z" fill={base} stroke={stripe} strokeWidth="3" strokeLinejoin="round" />
      <path d="M154 60 L162 18 L118 44 Z" fill={base} stroke={stripe} strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 52 L45 28 L70 42 Z" fill={inner} />
      <path d="M150 52 L155 28 L130 42 Z" fill={inner} />
      {/* head */}
      <ellipse cx="100" cy="98" rx="62" ry="56" fill={base} stroke={stripe} strokeWidth="3" />
      {/* forehead "M" + crown stripes */}
      <path d="M84 60 L92 84 M100 56 L100 82 M116 60 L108 84" stroke={stripe} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M70 66 L78 88 M130 66 L122 88" stroke={stripe} strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* cheek stripes */}
      <path d="M40 96 L64 100 M42 112 L66 112 M160 96 L136 100 M158 112 L134 112" stroke={stripe} strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* eyes */}
      <ellipse cx="78" cy="98" rx="13" ry="15" fill="#f4f4e8" />
      <ellipse cx="122" cy="98" rx="13" ry="15" fill="#f4f4e8" />
      <ellipse cx="78" cy="99" rx="6" ry="11" fill="#3f7d4f" />
      <ellipse cx="122" cy="99" rx="6" ry="11" fill="#3f7d4f" />
      <circle cx="78" cy="97" r="2.5" fill="#111" /><circle cx="122" cy="97" r="2.5" fill="#111" />
      {/* nose + mouth */}
      <path d="M94 116 L106 116 L100 124 Z" fill="#d98b8b" stroke={stripe} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M100 124 L100 130 M100 130 C100 136 92 136 90 131 M100 130 C100 136 108 136 110 131" stroke={stripe} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* whiskers */}
      <path d="M66 120 L26 114 M66 126 L28 128 M134 120 L174 114 M134 126 L172 128" stroke="#6d5638" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

const MAP: Record<string, () => JSX.Element> = {
  'tabby-cat': TabbyCat,
}

export function QuizIllustration({ name }: { name: string }) {
  const Art = MAP[name]
  if (!Art) return null
  return (
    <div className="mb-4 flex justify-center rounded-2xl border border-black/10 bg-white p-4">
      <Art />
    </div>
  )
}
