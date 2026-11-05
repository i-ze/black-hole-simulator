import type { ReactNode } from 'react';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-white/5 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]" title={hint}>
      <span className="truncate text-[12px] text-slate-400">{label}</span>
      <span className="shrink-0 text-right font-mono text-[12px] text-slate-100">{value}</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center justify-between gap-3 py-1 text-[12px] text-slate-300">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition ${checked ? 'bg-orange-400/80' : 'bg-slate-600/50'}`}
      >
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-md bg-white/[0.04] p-0.5 ring-1 ring-white/5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-[5px] font-medium transition ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'} ${
            value === o.value ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  className = '',
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={`slider ${className}`}
      min={min}
      max={max}
      step={step ?? (max - min) / 1000}
      value={value}
      style={{ ['--fill' as string]: `${fill}%` }}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

export function IconButton({
  children,
  onClick,
  title,
  active,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
        active ? 'bg-orange-400/15 text-orange-200 ring-1 ring-orange-300/30' : 'text-slate-300 hover:bg-white/5 hover:text-white'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'sky' | 'rose' }) {
  const tones = {
    slate: 'bg-slate-500/15 text-slate-300 ring-slate-400/20',
    amber: 'bg-orange-400/15 text-orange-200 ring-orange-300/25',
    sky: 'bg-sky-400/15 text-sky-200 ring-sky-300/25',
    rose: 'bg-rose-400/15 text-rose-200 ring-rose-300/25',
  };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}
