import { useEffect, useRef, useState } from 'react';

export function AudioPreview({
  src,
  volume = 1,
}: {
  src: string;
  volume?: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const audio = ref.current;
    const pause = () => audio?.pause();
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', pause);
    return () => {
      pause();
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', pause);
    };
  }, [src]);
  return (
    <div>
      <audio
        ref={ref}
        controls
        preload="metadata"
        src={src}
        style={{ width: '100%' }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      {Number.isFinite(duration) && duration > 0 ? (
        <p className="muted">
          时长 {Math.floor(duration / 60)}:
          {String(Math.floor(duration % 60)).padStart(2, '0')}
        </p>
      ) : null}
      {failed ? <p className="issue">音频无法加载或格式不受支持</p> : null}
    </div>
  );
}
