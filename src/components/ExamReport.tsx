import { GESTURE_LABELS_HE } from "@/lib/taamim/config";
import { CONTEXT_RULES } from "@/lib/taamim/rules";
import type { ExamReport as Report, ExamWordResult } from "@/lib/taamim/validate";

const STATUS_LABEL: Record<ExamWordResult["status"], string> = {
  correct: "נכון",
  wrong: "מחווה שגויה",
  missed: "הוחמץ",
  "false-positive": "מחווה מיותרת",
  "ok-none": "",
};

export function ExamReport({ report, onRestart }: { report: Report; onRestart: () => void }) {
  const problems = report.results.filter((r) => r.status !== "ok-none" && r.status !== "correct");
  return (
    <section className="rounded-2xl border border-gold/60 bg-navy-800 p-5 text-parchment">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-gold">דו״ח מבחן</h2>
        <p className="text-3xl font-bold" style={{ color: report.accuracy >= 80 ? "var(--color-correct)" : "var(--color-incorrect)" }}>
          {report.accuracy}%
        </p>
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="נדרשו" value={report.required} />
        <Stat label="נכונות" value={report.correct} tone="correct" />
        <Stat label="שגויות / הוחמצו" value={report.wrong + report.missed} tone="incorrect" />
        <Stat label="מיותרות" value={report.falsePositives} tone="incorrect" />
      </dl>
      {problems.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-gold/80">
            <tr>
              <th className="py-1 text-start font-medium">מילה</th>
              <th className="py-1 text-start font-medium">טעם</th>
              <th className="py-1 text-start font-medium">נדרש</th>
              <th className="py-1 text-start font-medium">בוצע</th>
              <th className="py-1 text-start font-medium">תוצאה</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((r) => (
              <tr key={r.token.id} className="border-t border-navy-700">
                <td className="py-1.5 font-stam text-lg font-bold">{r.token.pointed}</td>
                <td className="py-1.5">
                  {r.token.primaryMark?.nameHe ?? "—"}
                  {r.token.appliedRule && (
                    <span className="block text-xs text-gold/70">{CONTEXT_RULES[r.token.appliedRule].labelHe}</span>
                  )}
                </td>
                <td className="py-1.5">{r.expected === "NONE" ? "ללא" : GESTURE_LABELS_HE[r.expected]}</td>
                <td className="py-1.5">
                  {r.received && r.received !== "TAP" && r.received !== "UNKNOWN" ? GESTURE_LABELS_HE[r.received] : "—"}
                </td>
                <td className="py-1.5 text-incorrect">{STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        onClick={onRestart}
        className="mt-5 rounded-lg border border-gold bg-gold/10 px-4 py-2 font-medium text-gold hover:bg-gold/20"
      >
        מבחן חדש
      </button>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "correct" | "incorrect" }) {
  return (
    <div className="rounded-lg bg-navy px-3 py-2">
      <dt className="text-parchment/60">{label}</dt>
      <dd className="text-lg font-semibold" style={tone ? { color: `var(--color-${tone})` } : undefined}>
        {value}
      </dd>
    </div>
  );
}
