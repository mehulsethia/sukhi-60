import { notFound } from "next/navigation";
import { features } from "@/lib/config";
import { DemoClient } from "@/components/DemoClient";

// Fictional, clearly-labelled demo. Runs entirely in the browser with canned content:
// no AI, no WhatsApp, no database writes.
export default function DemoPage() {
  if (!features.demo()) notFound();
  return <DemoClient />;
}
