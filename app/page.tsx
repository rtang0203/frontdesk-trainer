import { getDefaultScenario } from "@/lib/scenarios";
import { LiveView } from "./LiveView";

export default function Home() {
  const scenario = getDefaultScenario();
  return <LiveView briefing={{ text: scenario.briefing, facts: scenario.traineeFacts }} />;
}
