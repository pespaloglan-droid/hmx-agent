import { useState } from "react";
import FlowProjectPreflight from "./FlowProjectPreflight";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { useI18n } from "@/i18n";
import { imageDraftProject, parseImageDraft, type ImageDraftResult } from "@/lib/flow-image-draft";

interface Props { targetId: string; targetLabel: string }
const copy = {
  tr: {
    title: "Görsel üretim taslağı — gönderim yok", scope: "Taslak kontrolü Flow'a metin yazmaz ve üretim izni vermez. Metin yerleştirme, ayrı yazma izni gerektiren bir testtir; gönderim/üretim henüz uygulanmadı. Aşağıdaki ayrı kontrol, sekme/proje eşleşmesini salt okunur inceler; üretim otomasyonu henüz uygulanmadı. Taslak yalnız bu ekranda tutulur; yenilemede, izin kaldırıldığında veya sekme seçiminde temizlenir.",
    target: "Salt okunur kontrolde seçilen sekme", project: "Test projesinin adresi (yalnız taslak)",
    input: "İsim ve prompt listesi", help: "Her satır: isim | prompt. En fazla 100 satır; her prompt 1 görsel, gruplar en fazla 10. İsimde yalnız harf (A–Z), rakam, _ ve - kullanın. Dosya uzantısı eklemeyin.",
    example: "2 örnek promptu yükle", prepare: "Taslağı kontrol et", empty: "En az bir prompt girin.", invalidProject: "Geçerli bir https://flow.google.com/project/… adresi girin (proje veya /collection/ adresi; sorgu olmadan).",
    ready: "Taslak kontrol edildi — üretim başlamadı.", count: "Planlanan görsel", batches: "Grup sayısı", batch: "Grup", settings: "Taslak ayarları: görsel, Nano Banana 2.1, 16:9, prompt başına 1 çıktı. Bunlar Flow ayarlarını değiştirmez; maliyet hesaplanmadı.",
    naming: "Hedef dosya isimleri .jpg ile gösterilir; gerçek çıktı biçimi indirmede doğrulanacak. Flow dışa aktarımı son ek ekleyebilir; otomatik dosya yeniden adlandırma henüz yok.",
    issues: { format: "isim | prompt biçimini kullanın", name: "güvenli ve geçerli bir isim kullanın", duplicate: "aynı isim tekrar ediyor (büyük/küçük harf dahil)", prompt: "prompt boş olamaz ve 8000 karakteri geçemez", limit: "en fazla 100 prompt kabul edilir", size: "liste 200.000 karakteri geçemez" }, line: "Satır",
  },
  en: {
    title: "Image production draft — no submission", scope: "Draft checking writes nothing to Flow and authorizes no production. Text staging is a separate test requiring write consent; submission/production is not implemented yet. The separate check below inspects project/tab matching read-only; production automation is not implemented. Drafts are screen-local and clear on refresh, consent revocation or target change.",
    target: "Tab selected in the read-only check", project: "Test project URL (draft only)", input: "Name and prompt list",
    help: "Each line: name | prompt. Up to 100 lines; one image per prompt, groups of at most 10. Names use only A–Z letters, digits, _ and -. Do not add file extensions.",
    example: "Load 2 example prompts", prepare: "Check draft", empty: "Enter at least one prompt.", invalidProject: "Enter a valid https://flow.google.com/project/… URL using a project or /collection/ URL, without query.",
    ready: "Draft checked — production has not started.", count: "Planned images", batches: "Group count", batch: "Group", settings: "Draft settings: image, Nano Banana 2.1, 16:9, one output per prompt. These do not change Flow settings; cost is not calculated.",
    naming: "Target filenames show .jpg; actual format must be verified after download. Flow exports may add suffixes; automatic file renaming is not implemented.",
    issues: { format: "use name | prompt", name: "use a valid safe filename stem", duplicate: "duplicate name (case-insensitive)", prompt: "prompt must contain 1–8000 characters", limit: "at most 100 prompts are accepted", size: "list must not exceed 200,000 characters" }, line: "Line",
  },
};
const examples = "001_sahil | Gün batımında sakin bir sahil, altın renkli ışık, hafif dalgalar, uzakta küçük bir yelkenli, gerçekçi fotoğraf tarzı, insan yok, yazı veya logo yok.\n002_orman | Sabah sisinde yemyeşil bir orman, ağaçların arasından süzülen güneş ışığı, yosunlu bir patika, gerçekçi fotoğraf tarzı, insan yok, yazı veya logo yok.";

export default function FlowImageDraft({ targetId, targetLabel }: Props) {
  const { locale } = useI18n();
  const text = copy[locale === "tr" ? "tr" : "en"];
  const [source, setSource] = useState("");
  const [project, setProject] = useState("");
  const [preview, setPreview] = useState<ImageDraftResult | null>(null);
  const [error, setError] = useState<"empty" | "invalidProject" | null>(null);
  const clear = () => { setPreview(null); setError(null); };
  return <Card translate="no"><CardContent className="space-y-3 p-5">
    <h3 className="text-lg font-semibold">{text.title}</h3>
    <p className="text-sm text-muted-foreground">{text.scope}</p>
    <p className="break-words">{text.target}: {targetLabel}</p>
    <label className="block space-y-1"><span>{text.project}</span>
      <input name="flow-draft-project" type="url" value={project} autoComplete="off"
        className="w-full rounded border border-border bg-background p-2" placeholder="https://flow.google.com/project/…"
        onChange={(event) => { setProject(event.target.value); clear(); }} />
    </label>
    <label className="block space-y-1"><span>{text.input}</span>
      <textarea name="flow-draft-source" value={source} rows={6} maxLength={200_000}
        className="w-full rounded border border-border bg-background p-2" spellCheck={false}
        onChange={(event) => { setSource(event.target.value); clear(); }} />
    </label>
    <p className="text-sm text-muted-foreground">{text.help}</p>
    <p className="text-sm text-muted-foreground">{text.settings}</p>
    <div className="flex flex-wrap gap-2">
      <Button className="h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 leading-relaxed" onClick={() => { setSource(examples); clear(); }}>{text.example}</Button>
      <Button className="h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 leading-relaxed" onClick={() => {
        clear();
        if (!imageDraftProject(project)) { setError("invalidProject"); return; }
        const result = parseImageDraft(source);
        if (!result.items.length && !result.issues.length) { setError("empty"); return; }
        setPreview(result);
      }}>{text.prepare}</Button>
    </div>
    {error && <p role="alert">{text[error]}</p>}
    {!!preview?.issues.length && <ul role="alert" className="list-inside list-disc">
      {preview.issues.map((issue, i) => <li key={i}>{text.line} {issue.line}: {text.issues[issue.code]}</li>)}
    </ul>}
    {preview && !preview.issues.length && <div className="space-y-3">
      <p role="status" className="font-semibold">{text.ready}</p>
      <p>{text.count}: <output>{preview.items.length}</output> · {text.batches}: <output>{preview.batches.length}</output></p>
      <p className="break-all text-sm">{imageDraftProject(project)}</p>
      <p className="text-sm text-muted-foreground">{text.naming}</p>
      <FlowProjectPreflight targetId={targetId} projectUrl={imageDraftProject(project)!} items={preview.items} />
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {preview.batches.map((batch, i) => <section key={i} className="space-y-2 rounded border border-border p-3">
          <h4 className="font-medium">{text.batch} {i + 1} · {batch.length}</h4>
          <ul className="space-y-2">{batch.map((item) => <li key={item.name} className="min-w-0 break-words">
            <p className="font-medium">{item.name}.jpg</p><p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.prompt}</p>
          </li>)}</ul>
        </section>)}
      </div>
    </div>}
  </CardContent></Card>;
}
