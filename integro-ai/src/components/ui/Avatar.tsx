import type { CSSProperties } from 'react'

interface AvatarProps {
  user: { initials: string; avatarUrl?: string | null }
  className?: string
  style?: CSSProperties
}

// Drop-in replacement for a plain initials circle: pass the same
// className/style you'd give that circle and it renders the user's photo
// instead once one is set, falling back to initials otherwise.
export default function Avatar({ user, className, style }: AvatarProps) {
  const photoStyle: CSSProperties = user.avatarUrl
    ? { backgroundImage: `url(${user.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {}

  return (
    <div className={className} style={{ ...style, ...photoStyle }}>
      {!user.avatarUrl && user.initials}
    </div>
  )
}
