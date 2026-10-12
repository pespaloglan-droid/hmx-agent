import { useState } from "react";
import { useI18n } from "@/i18n";
import FlowAgentCheck from "./FlowAgentCheck";

export default function FlowCurrentAgentCheck({ targetId }: { targetId: string }) {
  const { locale } = useI18n(); const tr = locale === "tr";
  const [stageId, setStageId] = useState("");
  const valid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(stageId);
  return <section className="space-y-3 border border-border p-5" translate="no">
    <h3 className="font-semibold">{tr ? "Yeniden açılan sekmede Agent tanısı — gönderim yok" : "Agent diagnostic after reopening a tab — no submission"}</h3>
    <p className="text-sm">{tr ? "Eski deneme kimliğini girin. Yalnızca yukarıda seçtiğiniz güncel sekme okunur; eski kaydın sekmesi değiştirilmez ve üretim yeniden açılmaz." : "Enter the saved attempt ID. Only your currently selected tab is read; the saved target and production fences are not changed."}</p>
    <label className="block space-y-1"><span>{tr ? "Tanı için eski deneme kimliği" : "Saved attempt ID for diagnostic"}</span>
      <input aria-label={tr ? "Tanı için eski deneme kimliği" : "Saved attempt ID for diagnostic"}
        value={stageId} className="w-full min-w-0 rounded border border-border bg-transparent p-2"
        onChange={event => setStageId(event.target.value.trim())} /></label>
    {valid && <FlowAgentCheck key={`${targetId}:${stageId}`} stageId={stageId} currentTargetId={targetId} />}
  </section>;
}
