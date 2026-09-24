type Props = { level: number };

export function LevelBars({ level }: Props) {
  return (
    <div className={`bars level-${level}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
