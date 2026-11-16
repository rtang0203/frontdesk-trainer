import { Suspense } from "react";
import { CallDetail } from "./CallDetail";

export default function CallDetailPage({ params }: PageProps<"/calls/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      {params.then(({ id }) => (
        <CallDetail id={id} />
      ))}
    </Suspense>
  );
}
