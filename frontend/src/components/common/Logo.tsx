const logoMarkSrc = '/mindtrace-mark.png';

export function Logo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className={`mindtrace-logo ${compact ? 'mindtrace-logo-compact' : ''} ${inverse ? 'mindtrace-logo-inverse' : ''}`}>
      <img src={logoMarkSrc} alt="" data-testid="img-mindtrace-logo" />
      {!compact && (
        <span className="mindtrace-wordmark">
          Mind<span>Trace</span>
        </span>
      )}
    </div>
  );
}
