import { getDefaultScenario } from "@/lib/scenarios";
import { LiveView } from "./LiveView";

export default function Home() {
  const scenario = getDefaultScenario();
  return (
    <LiveView
      briefing={{
        brief: scenario.brief,
        priceList: scenario.priceList ?? [],
        rubricLabels: scenario.rubric.map((item) => item.label),
      }}
    />
  );
}
