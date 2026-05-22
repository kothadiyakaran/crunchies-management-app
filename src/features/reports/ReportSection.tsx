import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  hidden?: boolean;
};

export function ReportSection({ title, children, hidden = false }: Props) {
  if (hidden) return null;
  return (
    <section className="mt-6">
      <h2 className="text-label uppercase text-ink-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
