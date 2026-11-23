import { getTranslations } from "next-intl/server";
import { features } from "@/lib/config";
import { waLink } from "@/domain/wa-ui";
import { businessNumber } from "@/server/wa/data";

// Doctors use Sukhi on WhatsApp: this opens it with the sign-up word filled in.
export async function DoctorLink() {
  const num = features.whatsapp() ? await businessNumber() : null;
  if (!num) return null;
  const t = await getTranslations("auth");
  return <p className="mt-6 text-center text-sm text-ink-soft">{t("doctorQ")} <a href={waLink(num, "I am a doctor")} className="link">{t("doctorLink")}</a></p>;
}
