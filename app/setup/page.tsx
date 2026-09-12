import type { Metadata } from "next";
import { FlowSteps } from "@/components/layout/flow-steps";
import { SetupFlow } from "@/components/setup/setup-flow";

export const metadata: Metadata = {
  title: "Choose your mission",
};

export default function SetupPage() {
  return (
    <div className="flex flex-col gap-8">
      <FlowSteps current="setup" />
      <SetupFlow />
    </div>
  );
}
