import { GameIcon } from '@app/components/ui/GameIcon';
import { cn } from '@app/lib/cn';

export interface InkDividerProps {
  variant?: 'line' | 'symbol';
  symbol?: string;
  className?: string;
}

/**
 * 分隔线组件
 * line: 虚线分隔
 * symbol: 符号重复（如 ☯）
 */
export function InkDivider({
  variant = 'line',
  symbol = 'icon:ui-taiji',
  className = '',
}: InkDividerProps) {
  if (variant === 'symbol') {
    return (
      <div
        className={cn(
          'text-ink/60 my-4 text-center text-[1.2rem] tracking-widest',
          className,
        )}
      >
        {Array.from({ length: 10 }, (_, index) => (
          <GameIcon key={index} value={symbol} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('text-ink/60 my-4 text-center', className)}>
      ┈┈┈┈┈┈┈┈┈┈┈┈┈┈
    </div>
  );
}
