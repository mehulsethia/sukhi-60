import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";
import { configReport } from "@/lib/config";

const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

describe("UI dictionaries", () => {
  it("hi and mr have exactly the same keys as en", () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
    expect(keys(mr).sort()).toEqual(keys(en).sort());
  });
  it("placeholders match across languages", () => {
    // Variable names only: drop ICU plural branches ("one {day}") so "{n, plural, ...}" in English still
    // matches a plain "{n}" in Hindi/Marathi.
    const ph = (s: string) => [...new Set((s.replace(/\b(zero|one|two|few|many|other|=\d+)\s*\{[^{}]*\}/g, "").match(/\{(\w+)/g) ?? []))].sort().join();
    const get = (o: Record<string, unknown>, k: string) => k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)[p], o) as string;
    for (const k of keys(en)) {
      expect(ph(get(hi, k)), `hi:${k}`).toBe(ph(get(en, k)));
      expect(ph(get(mr, k)), `mr:${k}`).toBe(ph(get(en, k)));
    }
  });
});

describe("config report", () => {
  it("reports only states, never values", () => {
    const r = configReport({ ANTHROPIC_API_KEY: "sk-ant-secret-value", SUPABASE_SECRET_KEY: "x", WORKER_SECRET: "short" });
    const json = JSON.stringify(r);
    expect(json).not.toContain("sk-ant-secret-value");
    expect(r.find((v) => v.name === "ANTHROPIC_API_KEY")!.state).toBe("set");
    expect(r.find((v) => v.name === "WORKER_SECRET")!.state).toBe("invalid");
    expect(r.find((v) => v.name === "SARVAM_API_KEY")!.state).toBe("missing");
  });
});
