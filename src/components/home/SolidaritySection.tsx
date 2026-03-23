import { Heart } from "lucide-react";

interface SolidaritySectionProps {
  donatedMeals: number;
  donatedPoints: number;
}

export default function SolidaritySection({ donatedMeals, donatedPoints }: SolidaritySectionProps) {
  return (
    <section className="py-12 bg-pink-500/5 border-b border-pink-500/10">
      <div className="container">
        <div className="max-w-4xl mx-auto rounded-3xl bg-white/40 dark:bg-white/5 backdrop-blur-xl p-8 md:p-10 shadow-[0_8px_32px_0_rgba(236,72,153,0.15)] border border-white/60 dark:border-white/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-pink-500/20 transition-colors" />

          <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-pink-400/20 to-pink-600/20 border border-pink-500/20 flex items-center justify-center shrink-0 animate-pulse">
              <Heart className="h-10 w-10 md:h-14 md:h-14 text-pink-500 fill-pink-500" />
            </div>

            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-600">
                  Impact Solidaire Tok
                </h2>
                <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                  Grâce à vos dons de Miamz, nous offrons ensemble des repas nutritifs à ceux qui en ont le plus besoin.
                </p>
              </div>

              <div className="flex flex-wrap justify-center md:justify-start gap-6 pt-2">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repas distribués</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-black text-foreground tabular-nums">{donatedMeals.toLocaleString()}</span>
                    <span className="text-lg font-bold text-pink-500">repas</span>
                  </div>
                </div>
                <div className="w-px h-12 bg-pink-500/10 hidden md:block" />
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Points récoltés</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-black text-foreground tabular-nums">{donatedPoints.toLocaleString()}</span>
                    <span className="text-lg font-bold text-pink-500">pts</span>
                  </div>
                </div>
                <div className="w-px h-12 bg-pink-500/10 hidden md:block" />
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prochain objectif</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">5 000</span>
                    <span className="text-xs font-medium text-pink-500/70">repas d'ici Pâques</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
