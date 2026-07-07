// A team's visual identity: a club crest when one exists (logo_url), else the
// national-team flag emoji. Server-safe (plain function). Sized in px so the crest
// image and the emoji render at a matching size.
export function TeamBadge({ flag, logo, name, size = 24, className = '' }: {
  flag: string
  logo?: string | null
  name?: string
  size?: number
  className?: string
}) {
  if (logo) {
    return (
      <img src={logo} alt={name || ''} width={size} height={size}
        style={{ width: size, height: size }}
        className={`inline-block object-contain flex-shrink-0 ${className}`} />
    )
  }
  return <span style={{ fontSize: size }} className={`leading-none ${className}`}>{flag}</span>
}
