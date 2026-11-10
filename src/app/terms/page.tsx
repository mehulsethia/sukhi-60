import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return <LegalPage titleKey="termsTitle" introKey="termsIntro" sections={[["tWhatTitle", "tWhatBody"], ["tCareTitle", "tCareBody"], ["tAccountTitle", "tAccountBody"], ["tUseTitle", "tUseBody"], ["tChangesTitle", "tChangesBody"]]} />;
}
