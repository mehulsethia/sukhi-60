"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, StatusBadge } from "@/components/ui";
import { progressFromEvents } from "@/domain/rewards";
import { VProgress } from "@/components/Vignettes";

const INITIAL = [
  { id: "d1", title: "Evening walk (personal goal)", time: "18:00", status: "due" },
  { id: "d2", title: "Glass of water (personal goal)", time: "13:00", status: "self_reported" },
  { id: "d3", title: "Light stretches (3×/week)", time: null, status: "pending" },
];

export function DemoClient() {
  const t = useTranslations();
  const [items, setItems] = useState(INITIAL);
  const [events, setEvents] = useState([{ kind: "participation", points: 1 }, { kind: "completion", points: 2 }, { kind: "milestone", points: 2 }]);
  const [showAssessment, setShowAssessment] = useState(false);
  const stats = progressFromEvents(events);

  function answer(id: string, status: string) {
    const it = items.find((i) => i.id === id);
    if (!it || ["self_reported", "evidence_supported", "skipped", "unable"].includes(it.status)) return;
    setItems(items.map((i) => (i.id === id ? { ...i, status } : i)));
    setEvents([...events, { kind: "participation", points: 1 }, ...(status === "self_reported" ? [{ kind: "completion", points: 2 }] : [])]);
  }

  return (
    <main className="mx-auto max-w-2xl p-4 pb-16">
      <div role="status" className="sticky top-2 z-10 mb-6 rounded-xl border border-line bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-ink">{t("demo.banner")}</div>
      <h1 className="text-3xl">{t("demo.title")}</h1>
      <p className="mb-4">{t("demo.person")}</p>
      <div className="mb-4"><VProgress /></div>
      <p className="mb-4 text-sm tabular-nums text-ink-soft">{t("progress.points", { points: stats.points })}</p>
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.id} className="card">
            <div className="flex items-start justify-between gap-2"><h2 className="font-bold">{i.title}{i.time ? ` · ${i.time}` : ""}</h2><StatusBadge status={i.status} label={t(`status.${i.status}`)} /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button className="btn btn-primary" onClick={() => answer(i.id, "self_reported")}>✓ {t("today.done")}</button>
              <button className="btn btn-secondary" onClick={() => answer(i.id, "later")}>{t("today.later")}</button>
              <button className="btn btn-secondary" onClick={() => answer(i.id, "skipped")}>{t("today.skip")}</button>
              <button className="btn btn-secondary" onClick={() => answer(i.id, "unable")}>{t("today.unwell")}</button>
            </div>
            {i.id === "d1" ? <button className="btn btn-ghost mt-2 underline" onClick={() => setShowAssessment(true)}>{t("today.addEvidence")}</button> : null}
            {i.id === "d1" && showAssessment ? (
              <div className="mt-2">
                <Alert tone="info">
                  <strong className="block">{t("demo.sampleAssessment")}</strong>
                  {t("action.outcome_partially_supports")}. {t("action.observed")}: a park path, walking shoes. {t("action.cannotConfirm")}: how long or how far the walk lasted.
                </Alert>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3">
        <button className="btn btn-secondary" onClick={() => { setItems(INITIAL); setEvents(events.slice(0, 3)); setShowAssessment(false); }}>{t("demo.reset")}</button>
        <Link href="/login" className="btn btn-primary">{t("demo.signUp")}</Link>
      </div>
      <p className="hint mt-6">{t("common.disclaimer")}</p>
    </main>
  );
}
