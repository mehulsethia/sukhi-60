import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Privacy() {
  return <LegalPage titleKey="privacyTitle" introKey="privacyIntro" sections={[["pCollectTitle", "pCollectBody"], ["pUseTitle", "pUseBody"], ["pProcessorsTitle", "pProcessorsBody"], ["pFamilyTitle", "pFamilyBody"], ["pChoicesTitle", "pChoicesBody"]]} />;
}
