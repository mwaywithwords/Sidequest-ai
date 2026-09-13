import type { Metadata } from "next";
import { FlowSteps } from "@/components/layout/flow-steps";
import { SetupFlow } from "@/components/setup/setup-flow";
import { parseGrade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Choose your mission",
};

export default async function SetupPage(props: PageProps<"/setup">) {
  const params = await props.searchParams;

  return (
    <div className="game-page game-page-tight">
      <FlowSteps current="setup" />
      <SetupFlow initialGrade={parseGrade(params.grade)} />
    </div>
  );
}
