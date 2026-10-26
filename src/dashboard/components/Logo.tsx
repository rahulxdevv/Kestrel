/** Shared Kestrel bird mark used by the site and dashboard. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" aria-hidden="true" className="shrink-0 rounded-[22%]" />;
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark size={small ? 24 : 26} />
      <span className={`font-semibold tracking-tight ${small ? 'text-base' : 'text-lg'}`}>Kestrel</span>
    </div>
  );
}
