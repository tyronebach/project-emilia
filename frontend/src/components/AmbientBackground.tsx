interface AmbientBackgroundProps {
  variant?: 'user' | 'agent' | 'newChat';
  className?: string;
}

const variantStyles = {
  user: {
    top: 'absolute -top-32 right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-teal),transparent_65%)] blur-3xl opacity-70',
    bottom: 'absolute -bottom-40 left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-amber),transparent_70%)] blur-3xl opacity-70',
  },
  agent: {
    top: 'absolute -top-24 left-[-8rem] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-teal),transparent_65%)] blur-3xl opacity-60',
    bottom: 'absolute -bottom-40 right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-amber),transparent_70%)] blur-3xl opacity-60',
  },
  newChat: {
    top: 'absolute -top-28 right-[-8rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-teal),transparent_65%)] blur-3xl opacity-60',
    bottom: 'absolute -bottom-40 left-[-12rem] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-amber),transparent_70%)] blur-3xl opacity-60',
  },
} as const;

function AmbientBackground({ variant = 'user', className = '' }: AmbientBackgroundProps) {
  const styles = variantStyles[variant];

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <div className={styles.top} />
      <div className={styles.bottom} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_55%)]" />
    </div>
  );
}

export default AmbientBackground;
