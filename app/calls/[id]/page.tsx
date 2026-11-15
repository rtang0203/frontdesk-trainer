import { Suspense } from "react";
import { CallDetail } from "./CallDetail";

export default function CallDetailPage({ params }: PageProps<"/calls/[id]">) {
  return (
    <Suspense fallback={<p className="text-lg text-stone-500">Loading…</p>}>
      {params.then(({ id }) => (
        <CallDetail id={id} />
      ))}
    </Suspense>
  );
}
