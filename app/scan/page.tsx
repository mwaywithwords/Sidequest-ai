import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlowSteps } from "@/components/layout/flow-steps";
import { ScanStage } from "@/components/scan/scan-stage";
import { getSkill } from "@/lib/skills";
import { parseGrade, parseSkillId } from "@/lib/types";

export const metadata: Metadata = {
  title: "Scan an object",
};

export default async function ScanPage(props: PageProps<"/scan">) {
  const params = await props.searchParams;
  const grade = parseGrade(params.grade);
  const skillId = parseSkillId(params.skill);

  // The scan screen is meaningless without a mission, so send them back to pick one.
  if (grade === null || skillId === null) {
    redirect("/setup");
  }

  return (
    <div className="flex flex-col gap-8">
      <FlowSteps current="scan" />
      <ScanStage grade={grade} skill={getSkill(skillId)} />
    </div>
  );
}
