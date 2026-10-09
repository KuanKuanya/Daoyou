import { cn } from '@app/lib/cn';
import { GameArtwork, GameImage, type GameImagePurpose } from './GameImage';
import { emojiIconAliases } from './icons/emojiAliases';
import { iconRegistry } from './icons/registry';

export interface GameIconProps {
  value: string;
  className?: string;
  /** Omit when adjacent text already names the icon. */
  label?: string;
  purpose?: GameImagePurpose;
}

/** Registered images and legacy emoji aliases; size follows the font. */
export function GameIcon({
  value,
  className,
  label,
  purpose = 'interface',
}: GameIconProps) {
  const isRegisteredIcon = value.startsWith('icon:');
  const source = GameIcon.resolveSource(value);
  const content = source ? (
    <GameImage
      purpose="interface"
      src={source}
      alt=""
      draggable={false}
      className="block size-full object-contain"
    />
  ) : isRegisteredIcon || !value.trim() ? (
    '?'
  ) : (
    value
  );

  return (
    <span
      className={cn(
        'inline-flex h-[1em] w-[1em] shrink-0 items-center justify-center align-[-0.125em] font-sans leading-none',
        className,
      )}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      {purpose === 'artwork' ? (
        <GameArtwork className="inline-flex size-full items-center justify-center">
          {content}
        </GameArtwork>
      ) : (
        content
      )}
    </span>
  );
}

/** Canvas renderers share the same registered assets without parsing icon values. */
GameIcon.resolveSource = (value: string): string | undefined =>
  iconRegistry.get(
    value.startsWith('icon:')
      ? value.slice(5)
      : (emojiIconAliases.get(value.replace(/\uFE0F/g, '')) ?? ''),
  );
