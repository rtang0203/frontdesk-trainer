/** Form-style label/value rows with a divider under each, used inside a slip. */
export function SlipRows({ rows }: { rows: [label: string, value: React.ReactNode][] }) {
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[112px_1fr] gap-3 border-b border-slip-rule py-2.5">
          <dt className="pt-0.5 text-sm font-semibold">{label}</dt>
          <dd className="text-lg leading-snug">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordedTag() {
  return (
    <span className="inline-block rounded-[3px] border border-ink px-1.5 py-px align-middle text-[13px] font-semibold leading-normal">
      Recorded call
    </span>
  );
}
