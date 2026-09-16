"use client";

/** App shell: header (logo, title, scripture navigation) + the trainer for the current verse. */
import Image from "next/image";
import { withBasePath } from "@/lib/basePath";
import { formatRefHe, refToKey } from "@/lib/scripture";
import { useScripture } from "@/lib/scripture/useScripture";
import { ScriptureNav } from "./ScriptureNav";
import { Trainer } from "./Trainer";

export function MedakerApp() {
  const scripture = useScripture();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-gold/30 bg-navy-800/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <Image src={withBasePath("/logo-gold.svg")} alt="" width={40} height={40} priority className="size-10" />
          <h1 className="text-xl font-bold tracking-tight text-gold">מדקר</h1>
        </div>
        <ScriptureNav current={scripture.ref} onNavigate={scripture.goTo} />
      </header>

      <main className="flex flex-1 flex-col">
        {scripture.status === "ready" && scripture.text ? (
          <Trainer
            key={refToKey(scripture.ref)}
            verseRef={scripture.ref}
            text={scripture.text}
            onNext={scripture.hasNext ? scripture.next : undefined}
            onPrev={scripture.hasPrev ? scripture.prev : undefined}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
            <p className="text-sm text-parchment/60">{formatRefHe(scripture.ref)}</p>
            {scripture.status === "error" ? (
              <>
                <p role="alert" className="text-incorrect">
                  {scripture.error}
                </p>
                <button
                  type="button"
                  onClick={scripture.retry}
                  className="rounded-lg border border-gold px-4 py-2 font-medium text-gold hover:bg-gold/10"
                >
                  נסה שוב
                </button>
              </>
            ) : (
              <p className="animate-pulse text-parchment/60" role="status">
                טוען את הפסוק…
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
