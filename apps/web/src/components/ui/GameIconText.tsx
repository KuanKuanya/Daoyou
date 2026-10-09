import type { ReactNode } from 'react';
import { GameIcon } from './GameIcon';

// Only UI labels opt in. Player chat and narrative text keep their original text.
const iconPattern =
  /\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;

/** Render embedded legacy icons without changing text, font size, or line wrapping. */
export function GameIconText({ children }: { children: ReactNode }) {
  if (typeof children !== 'string') return children;
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of children.matchAll(iconPattern)) {
    if (!GameIcon.resolveSource(match[0])) continue;
    parts.push(children.slice(offset, match.index));
    parts.push(<GameIcon key={match.index} value={match[0]} />);
    offset = match.index + match[0].length;
  }
  if (offset === 0) return children;
  parts.push(children.slice(offset));
  return <>{parts}</>;
}
