import Image from "next/image";
import { Trainer } from "@/components/Trainer";
import { withBasePath } from "@/lib/basePath";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-center gap-3 border-b border-gold/30 bg-navy-800/60 px-4 py-3">
        <Image src={withBasePath("/logo-gold.svg")} alt="" width={44} height={44} priority className="size-11" />
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gold">מדקר</h1>
          <p className="text-xs text-parchment/60">אימון טעמי המקרא במחוות מגע</p>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Trainer />
      </main>
    </div>
  );
}
