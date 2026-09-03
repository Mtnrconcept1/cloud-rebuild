interface SolidaritySectionProps {
  donatedPoints: number;
}

const POINTS_PER_SOLIDARITY_MEAL = 1000;
const SOLIDARITY_GOAL_STEP_POINTS = 5000;

function formatSolidarityNumber(value: number) {
  return Math.round(value).toLocaleString("fr-FR").replace(/\u202f/g, " ");
}

function getNextSolidarityGoalPoints(donatedPoints: number) {
  const normalizedPoints = Math.max(0, Math.floor(donatedPoints));
  const nextStepIndex = Math.floor(normalizedPoints / SOLIDARITY_GOAL_STEP_POINTS) + 1;
  return nextStepIndex * SOLIDARITY_GOAL_STEP_POINTS;
}

export default function SolidaritySection({ donatedPoints }: SolidaritySectionProps) {
  const normalizedDonatedPoints = Math.max(0, Math.round(donatedPoints));
  const donatedMeals = Math.floor(normalizedDonatedPoints / POINTS_PER_SOLIDARITY_MEAL);
  const nextGoalPoints = getNextSolidarityGoalPoints(normalizedDonatedPoints);
  const displayedPoints = formatSolidarityNumber(normalizedDonatedPoints);
  const displayedMeals = formatSolidarityNumber(donatedMeals);
  const displayedGoal = formatSolidarityNumber(nextGoalPoints);
  const progressValue = Math.min(normalizedDonatedPoints, nextGoalPoints);
  const progressPercent = Math.min(100, Math.round((progressValue / nextGoalPoints) * 100));

  return (
    <section className="border-y border-pink-500/10 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.16),rgba(255,255,255,0.86)_48%,rgba(255,255,255,0.98))] py-5 dark:border-pink-400/15 dark:bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.16),rgba(28,20,18,0.9)_52%,hsl(var(--background)))] md:py-6">
      <div className="container">
        <div
          data-testid="solidarity-card"
          className="neon-card relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[1.35rem] border border-white/80 bg-pink-50/70 shadow-[0_24px_70px_-42px_rgba(219,39,119,0.55)] backdrop-blur-xl dark:border-pink-300/20 dark:bg-white/5"
        >
          <h2 className="sr-only">Impact Solidaire Tok</h2>
          <p className="sr-only">
            Gr&acirc;ce &agrave; vos dons de Miamz, nous offrons ensemble des repas nutritifs &agrave; ceux qui en ont le plus besoin.
          </p>

          <picture>
            <source media="(max-width: 767px)" srcSet="/Miamz3.webp" type="image/webp" />
            <img
              src="/Miamz2.webp"
              alt="Miamz solidaire Tok"
              className="block w-full"
              loading="lazy"
            />
          </picture>

          <div
            data-testid="solidarity-stats-panel"
            className="absolute inset-x-[8%] bottom-[3.5%] top-auto sm:inset-x-[11%] md:inset-x-[12.5%] md:bottom-[5.5%]"
          >
            <div className="rounded-[1.05rem] border border-white/80 bg-white/70 px-2.5 py-2 text-center shadow-[0_14px_45px_-32px_rgba(219,39,119,0.55)] backdrop-blur-md sm:px-3 md:px-4 md:py-3">
              <div className="mb-1 inline-flex rounded-full border border-pink-200 bg-white/78 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] text-pink-600 shadow-sm sm:mb-1.5 sm:px-2.5 sm:text-[8px] md:mb-2 md:px-3 md:py-1 md:text-[9px] md:tracking-[0.14em]">
                {displayedMeals} repas distribu&eacute;s
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2 md:gap-3">
                <div className="space-y-0.5">
                  <p className="text-[6px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[7px] sm:tracking-[0.1em] md:text-[9px] md:tracking-[0.14em]">Points r&eacute;colt&eacute;s</p>
                  <div className="flex items-baseline justify-center gap-1 text-pink-600 sm:gap-1.5 md:gap-2">
                    <span className="text-base font-black tabular-nums sm:text-lg md:text-[1.75rem]">{displayedPoints}</span>
                    <span className="text-[9px] font-black sm:text-[10px] md:text-sm">pts</span>
                  </div>
                </div>

                <div className="h-8 w-px bg-pink-200 sm:h-9 md:h-12" />

                <div className="space-y-0.5">
                  <p className="text-[6px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[7px] sm:tracking-[0.1em] md:text-[9px] md:tracking-[0.14em]">Prochain objectif</p>
                  <div className="text-pink-600">
                    <div className="flex items-baseline justify-center gap-1 sm:gap-1.5 md:gap-2">
                      <span className="text-base font-black tabular-nums sm:text-lg md:text-2xl">{displayedGoal}</span>
                      <span className="text-[9px] font-black sm:text-[10px] md:text-sm">pts</span>
                    </div>
                    <p className="text-[7px] font-bold sm:text-[8px] md:text-[11px]">objectif solidaire du mois</p>
                  </div>
                </div>
              </div>

              <div className="mt-1.5 sm:mt-2 md:mt-3">
                <div
                  role="progressbar"
                  aria-label="Progression vers le prochain objectif"
                  aria-valuemin={0}
                  aria-valuenow={progressValue}
                  aria-valuemax={nextGoalPoints}
                  className="relative h-2.5 overflow-visible rounded-full border border-pink-200 bg-pink-100 shadow-inner sm:h-3 md:h-4"
                >
                  <div
                    className="h-full rounded-full bg-[linear-gradient(180deg,#fb6fa9,#e91e72)] shadow-[inset_0_2px_8px_rgba(255,255,255,0.45),0_10px_26px_-14px_rgba(219,39,119,0.9)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                  <div
                    className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-pink-200 bg-[radial-gradient(circle_at_35%_30%,#ffd1e4,#f53883_60%,#c70f5f)] text-[4px] font-black uppercase text-white shadow-[0_12px_28px_-14px_rgba(219,39,119,0.9)] sm:h-6 sm:w-6 sm:text-[5px] md:h-8 md:w-8 md:text-[6px]"
                    style={{ left: `${Math.max(5, Math.min(95, progressPercent))}%` }}
                    aria-hidden="true"
                  >
                    Miamz
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
