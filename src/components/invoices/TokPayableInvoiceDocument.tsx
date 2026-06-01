import { forwardRef } from "react";
import {
  CalendarDays,
  Check,
  Info,
  Megaphone,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";

import {
  formatPayableAmount,
  type PayableInvoiceDocumentData,
  type PayableInvoiceGroupSummary,
  type PayableInvoiceItemKind,
} from "@/lib/payableInvoice";
import { cn } from "@/lib/utils";

type TokPayableInvoiceDocumentProps = {
  data: PayableInvoiceDocumentData;
  className?: string;
  mode?: "screen" | "print";
};

function getGroupIcon(kind: PayableInvoiceItemKind) {
  if (kind === "order_commission") return ShoppingBag;
  if (kind === "campaign_payment") return Megaphone;
  if (kind === "manual_adjustment") return ReceiptText;
  return CalendarDays;
}

function GroupCard({
  group,
  mode = "screen",
}: {
  group: PayableInvoiceGroupSummary;
  mode?: "screen" | "print";
}) {
  const Icon = getGroupIcon(group.kind);
  const isPrintMode = mode === "print";

  return (
    <div
      className={cn(
        "grid min-h-0 border-t border-[#f6b790] bg-white first:border-t-0",
        isPrintMode
          ? "min-h-[220px] border-l odd:border-l-0 [&:nth-child(-n+2)]:border-t-0"
          : "md:min-h-[272px] md:border-l md:[&:nth-child(2n+1)]:border-l-0 md:[&:nth-child(-n+2)]:border-t-0 xl:[&:nth-child(3n+1)]:border-l-0 xl:[&:nth-child(-n+3)]:border-t-0",
      )}
    >
      <div className={cn("flex flex-col gap-4 px-4 py-4", isPrintMode ? "px-5 py-5" : "sm:gap-5 sm:px-6 sm:py-5")}>
        <div className={cn("flex items-start gap-3", isPrintMode ? "gap-4" : "sm:gap-4")}>
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-[#ff8a3d] text-white",
              isPrintMode ? "h-12 w-12" : "h-10 w-10 sm:h-14 sm:w-14",
            )}
          >
            <Icon className={cn(isPrintMode ? "h-6 w-6" : "h-5 w-5 sm:h-7 sm:w-7")} />
          </div>
          <div className="min-w-0 space-y-1">
            <p
              className={cn(
                "font-semibold uppercase text-[#ff5b14]",
                isPrintMode
                  ? "text-[11px] tracking-[0.18em]"
                  : "text-[10px] tracking-[0.14em] sm:text-[11px] sm:tracking-[0.22em]",
              )}
            >
              {group.title}
            </p>
            <p className={cn("text-slate-600", isPrintMode ? "text-sm leading-5" : "text-sm")}>{group.subtitle}</p>
          </div>
        </div>

        <div className="space-y-2 text-center">
          <p className={cn("font-semibold text-slate-950", isPrintMode ? "text-3xl" : "text-2xl sm:text-4xl")}>
            {group.countValue}
          </p>
          <p className={cn("text-slate-600", isPrintMode ? "text-sm leading-5" : "text-sm")}>{group.detailLabel}</p>
          <p className={cn("font-semibold text-slate-900", isPrintMode ? "text-xl" : "text-lg sm:text-2xl")}>
            {group.baseLabel}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mt-auto flex items-center justify-between gap-3 border-t border-[#f6b790] bg-[#fff3ea] px-4 py-3",
          isPrintMode ? "px-5 py-4" : "sm:px-6 sm:py-4",
        )}
      >
        <div className="space-y-1">
          <p
            className={cn(
              "uppercase text-slate-500",
              isPrintMode
                ? "text-[11px] tracking-[0.16em]"
                : "text-[10px] tracking-[0.14em] sm:text-xs sm:tracking-[0.18em]",
            )}
          >
            {group.footerLabel}
          </p>
          <p className={cn("text-slate-700", isPrintMode ? "text-sm leading-5" : "text-sm")}>{group.commissionLabel}</p>
        </div>
        <p className={cn("shrink-0 font-semibold text-[#ff5b14]", isPrintMode ? "text-2xl" : "text-xl sm:text-3xl")}>
          {formatPayableAmount(group.amountTtc)}
        </p>
      </div>
    </div>
  );
}

function InvoiceDetailCard({ group }: { group: PayableInvoiceGroupSummary }) {
  const Icon = getGroupIcon(group.kind);

  return (
    <div className="rounded-[20px] border border-[#f6b790] bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1e7] text-[#ff5b14]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="break-words font-semibold text-slate-950">{group.title}</p>
          <p className="text-sm text-slate-600">{group.detailLabel}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Quantite</dt>
          <dd className="text-right font-medium text-slate-800">{group.quantityLabel}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Base</dt>
          <dd className="text-right font-medium text-slate-800">{group.baseLabel}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Facturation TOK</dt>
          <dd className="text-right font-medium text-slate-800">{group.commissionLabel}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#fff3ea] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Montant</span>
        <span className="text-lg font-bold text-[#ff5b14]">{formatPayableAmount(group.amountTtc)}</span>
      </div>
    </div>
  );
}

export const TokPayableInvoiceDocument = forwardRef<HTMLDivElement, TokPayableInvoiceDocumentProps>(
  ({ data, className, mode = "screen" }, ref) => {
    const isPrintMode = mode === "print";

    return (
      <div
        ref={ref}
        className={cn(
          "mx-auto overflow-hidden bg-white text-slate-900",
          isPrintMode
            ? "w-[190mm] max-w-[190mm] px-6 py-6"
            : "w-full max-w-full rounded-[20px] px-4 py-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.4)] sm:max-w-[1024px] sm:rounded-[32px] sm:px-10 sm:py-10",
          className,
        )}
      >
        <div className={cn("space-y-6", isPrintMode ? "space-y-8" : "sm:space-y-8")}>
          <div
            className={cn(
              "grid min-w-0 gap-5",
              isPrintMode
                ? "grid-cols-[170px_minmax(0,1fr)_220px] items-start gap-6"
                : "sm:gap-8 lg:grid-cols-[280px_minmax(0,1fr)_300px] lg:items-start",
            )}
          >
            <div className={cn("flex justify-center", isPrintMode ? "justify-start" : "lg:justify-start")}>
              <div
                className={cn(
                  "flex items-center justify-center overflow-hidden",
                  isPrintMode
                    ? "h-[170px] w-[170px] rounded-[28px]"
                    : "h-24 w-24 rounded-2xl sm:h-[180px] sm:w-[180px] sm:rounded-[28px] lg:h-[240px] lg:w-[240px] lg:rounded-[36px]",
                )}
              >
                <img src={data.logoUrl} alt="TOK" className="h-full w-full object-contain" />
              </div>
            </div>

            <div className={cn("min-w-0 space-y-4", isPrintMode ? "space-y-5" : "sm:space-y-5")}>
              <div className="space-y-3">
                <h1
                  className={cn(
                    "font-display font-bold uppercase text-[#ff5b14]",
                    isPrintMode
                      ? "text-4xl tracking-[0.06em]"
                      : "text-3xl tracking-[0.05em] sm:text-5xl sm:tracking-[0.08em]",
                  )}
                >
                  Facture
                </h1>
                <div
                  className={cn(
                    "inline-flex max-w-full break-all rounded-full border border-[#ff9d67] font-semibold text-[#ff5b14]",
                    isPrintMode ? "px-5 py-2.5 text-lg" : "px-4 py-2 text-sm sm:px-6 sm:py-3 sm:text-xl",
                  )}
                >
                  {data.invoice.invoice_number || data.invoice.id.slice(0, 8)}
                </div>
              </div>

              <div
                className={cn(
                  "grid gap-2 text-base",
                  isPrintMode
                    ? "grid-cols-[150px_minmax(0,1fr)] gap-3 text-lg"
                    : "sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-3 sm:text-lg",
                )}
              >
                <span className="font-medium text-slate-600">Date de facturé :</span>
                <span>{data.createdAtLabel}</span>
                <span className="font-medium text-slate-600">Echeance :</span>
                <span>{data.dueAtLabel}</span>
                <span className="font-medium text-slate-600">Statut :</span>
                <span>
                  <span
                    className={cn(
                      "inline-flex rounded-full font-medium",
                      isPrintMode ? "px-4 py-2 text-base" : "px-3 py-1.5 text-sm sm:px-4 sm:text-base",
                      data.statusToneClassName,
                    )}
                  >
                    {data.statusLabel}
                  </span>
                </span>
              </div>
            </div>

            <div
              className={cn(
                "min-w-0 rounded-[20px] border border-[#f6b790] px-4 py-4",
                isPrintMode ? "rounded-[24px] px-5 py-5" : "sm:rounded-[28px] sm:px-6 sm:py-5",
              )}
            >
              <p
                className={cn(
                  "font-semibold uppercase text-[#ff5b14]",
                  isPrintMode ? "text-xs tracking-[0.18em]" : "text-xs tracking-[0.16em] sm:text-sm sm:tracking-[0.22em]",
                )}
              >
                Expediteur
              </p>
              <div className={cn("mt-3 space-y-2 break-words text-base", isPrintMode ? "mt-4 text-lg" : "sm:mt-4 sm:text-lg")}>
                <p className={cn("font-semibold text-slate-950", isPrintMode ? "text-2xl" : "text-xl sm:text-3xl")}>
                  {data.sender.name}
                </p>
                {data.sender.addressLine1 ? <p>{data.sender.addressLine1}</p> : null}
                {data.sender.addressLine2 ? <p>{data.sender.addressLine2}</p> : null}
                {data.sender.country ? <p>{data.sender.country}</p> : null}
              </div>
              <div className={cn("mt-4 space-y-2 break-words text-sm text-slate-700", isPrintMode ? "mt-5 text-sm" : "sm:mt-6 sm:text-base")}>
                {data.sender.vatNumber ? <p>TVA {data.sender.vatNumber}</p> : null}
                {data.sender.email ? <p>Email : {data.sender.email}</p> : null}
                {data.sender.phone ? <p>Tel. : {data.sender.phone}</p> : null}
              </div>
            </div>
          </div>

          <div className={cn("grid min-w-0 gap-4", isPrintMode ? "grid-cols-2 gap-6" : "sm:gap-6 lg:grid-cols-2")}>
            <div
              className={cn(
                "min-w-0 rounded-[20px] border border-[#f6b790] px-4 py-4",
                isPrintMode ? "rounded-[24px] px-5 py-5" : "sm:rounded-[28px] sm:px-6 sm:py-5",
              )}
            >
              <p
                className={cn(
                  "font-semibold uppercase text-[#ff5b14]",
                  isPrintMode ? "text-xs tracking-[0.18em]" : "text-xs tracking-[0.16em] sm:text-sm sm:tracking-[0.22em]",
                )}
              >
                Destinataire
              </p>
              <div className={cn("mt-3 space-y-2 break-words text-base", isPrintMode ? "mt-4 text-lg" : "sm:mt-4 sm:text-lg")}>
                <p className={cn("font-semibold text-slate-950", isPrintMode ? "text-2xl" : "text-xl sm:text-3xl")}>
                  {data.recipient.name}
                </p>
                {data.recipient.addressLine1 ? <p>{data.recipient.addressLine1}</p> : null}
                {data.recipient.addressLine2 ? <p>{data.recipient.addressLine2}</p> : null}
                {data.recipient.country ? <p>{data.recipient.country}</p> : null}
              </div>
              <div className={cn("mt-4 space-y-2 break-words text-sm text-slate-700", isPrintMode ? "mt-5 text-sm" : "sm:mt-6 sm:text-base")}>
                {data.recipient.vatNumber ? <p>TVA / IDE : {data.recipient.vatNumber}</p> : null}
                {data.recipient.email ? <p>Email : {data.recipient.email}</p> : null}
                {data.recipient.phone ? <p>Tel. : {data.recipient.phone}</p> : null}
              </div>
            </div>

            <div
              className={cn(
                "min-w-0 rounded-[20px] border border-[#f6b790] px-4 py-4",
                isPrintMode ? "rounded-[24px] px-5 py-5" : "sm:rounded-[28px] sm:px-6 sm:py-5",
              )}
            >
              <p
                className={cn(
                  "font-semibold uppercase text-[#ff5b14]",
                  isPrintMode ? "text-xs tracking-[0.18em]" : "text-xs tracking-[0.16em] sm:text-sm sm:tracking-[0.22em]",
                )}
              >
                Période de facturation
              </p>
              <div className={cn("mt-4 flex items-start gap-3", isPrintMode ? "mt-5 gap-4" : "sm:mt-5 sm:gap-4")}>
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full bg-[#fff1e7] text-[#ff5b14]",
                    isPrintMode ? "h-14 w-14" : "h-12 w-12 sm:h-16 sm:w-16",
                  )}
                >
                  <CalendarDays className={cn(isPrintMode ? "h-7 w-7" : "h-6 w-6 sm:h-8 sm:w-8")} />
                </div>
                <div className={cn("min-w-0 space-y-2", isPrintMode ? "space-y-3" : "sm:space-y-3")}>
                  <p className={cn("break-words font-semibold text-slate-950", isPrintMode ? "text-2xl" : "text-xl sm:text-3xl")}>
                    {data.periodLabel}
                  </p>
                  <p
                    className={cn(
                      "max-w-[34ch] text-slate-600",
                      isPrintMode ? "text-sm leading-6" : "text-sm leading-6 sm:text-base sm:leading-7",
                    )}
                  >
                    Cette facture regroupe l&apos;ensemble des montants facturés par TOK durant la période ci-dessus.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <section className="space-y-4">
            <h2
              className={cn(
                "font-semibold uppercase tracking-[0.04em] text-slate-950",
                isPrintMode ? "text-2xl tracking-[0.05em]" : "text-xl sm:text-3xl sm:tracking-[0.05em]",
              )}
            >
              Recapitulatif
            </h2>
            <div className={cn("overflow-hidden rounded-[20px] border border-[#f6b790]", isPrintMode ? "rounded-[24px]" : "sm:rounded-[28px]")}>
              <div className={cn("grid", isPrintMode ? "grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}>
                {data.groups.map((group) => (
                  <GroupCard key={group.kind} group={group} mode={mode} />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2
              className={cn(
                "font-semibold uppercase tracking-[0.04em] text-slate-950",
                isPrintMode ? "text-2xl tracking-[0.05em]" : "text-xl sm:text-3xl sm:tracking-[0.05em]",
              )}
            >
              Détail de la facturation
            </h2>
            {!isPrintMode ? (
              <div className="space-y-3 md:hidden">
                {data.groups.map((group) => (
                  <InvoiceDetailCard key={group.kind} group={group} />
                ))}
                <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[#f6b790] bg-[#fff3ea] px-4 py-4">
                  <span className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-700">Total TTC</span>
                  <span className="text-xl font-bold text-[#ff5b14]">{formatPayableAmount(data.totalTtc)}</span>
                </div>
              </div>
            ) : null}
            <div
              className={cn(
                "overflow-hidden border border-[#f6b790]",
                isPrintMode ? "rounded-[24px]" : "hidden rounded-[24px] md:block",
              )}
            >
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead
                    className={cn(
                      "bg-[#fff8f3] uppercase text-slate-500",
                      isPrintMode ? "text-[11px] tracking-[0.14em]" : "text-sm tracking-[0.18em]",
                    )}
                  >
                    <tr>
                      <th className={cn("border-b border-[#f6b790]", isPrintMode ? "px-4 py-3" : "px-5 py-4")}>Type</th>
                      <th className={cn("border-b border-[#f6b790]", isPrintMode ? "px-4 py-3" : "px-5 py-4")}>Détail</th>
                      <th className={cn("border-b border-[#f6b790]", isPrintMode ? "px-4 py-3" : "px-5 py-4")}>Quantite</th>
                      <th className={cn("border-b border-[#f6b790]", isPrintMode ? "px-4 py-3" : "px-5 py-4")}>Base de calcul</th>
                      <th className={cn("border-b border-[#f6b790]", isPrintMode ? "px-4 py-3" : "px-5 py-4")}>Facturation TOK</th>
                      <th className={cn("border-b border-[#f6b790] text-right", isPrintMode ? "px-4 py-3" : "px-5 py-4")}>Montant</th>
                    </tr>
                  </thead>
                  <tbody className={cn(isPrintMode ? "text-sm" : "text-base")}>
                    {data.groups.map((group) => {
                      const Icon = getGroupIcon(group.kind);

                      return (
                        <tr key={group.kind} className="align-top">
                          <td className={cn("border-b border-[#f6b790]", isPrintMode ? "px-4 py-4" : "px-5 py-5")}>
                            <div className={cn("flex items-center font-semibold text-slate-950", isPrintMode ? "gap-2" : "gap-3")}>
                              <Icon className={cn("text-[#ff5b14]", isPrintMode ? "h-4 w-4" : "h-5 w-5")} />
                              <span>{group.title}</span>
                            </div>
                          </td>
                          <td className={cn("border-b border-[#f6b790] text-slate-600", isPrintMode ? "px-4 py-4 leading-5" : "px-5 py-5")}>
                            {group.detailLabel}
                          </td>
                          <td className={cn("border-b border-[#f6b790] text-slate-600", isPrintMode ? "px-4 py-4" : "px-5 py-5")}>
                            {group.quantityLabel}
                          </td>
                          <td className={cn("border-b border-[#f6b790] text-slate-600", isPrintMode ? "px-4 py-4" : "px-5 py-5")}>
                            {group.baseLabel}
                          </td>
                          <td className={cn("border-b border-[#f6b790] text-slate-600", isPrintMode ? "px-4 py-4" : "px-5 py-5")}>
                            {group.commissionLabel}
                          </td>
                          <td
                            className={cn(
                              "border-b border-[#f6b790] text-right font-semibold text-slate-950",
                              isPrintMode ? "px-4 py-4 text-xl" : "px-5 py-5 text-2xl",
                            )}
                          >
                            {formatPayableAmount(group.amountTtc)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#fff3ea]">
                      <td
                        colSpan={5}
                        className={cn(
                          "text-right font-semibold uppercase tracking-[0.08em] text-slate-700",
                          isPrintMode ? "px-4 py-4 text-lg" : "px-5 py-5 text-xl",
                        )}
                      >
                        Total TTC
                      </td>
                      <td className={cn("text-right font-bold text-[#ff5b14]", isPrintMode ? "px-4 py-4 text-2xl" : "px-5 py-5 text-3xl")}>
                        {formatPayableAmount(data.totalTtc)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section
            className={cn(
              "grid gap-4 rounded-[20px] border border-[#f6b790] px-4 py-4",
              isPrintMode
                ? "grid-cols-[1.2fr_1fr_auto] items-center rounded-[24px] px-5 py-5"
                : "sm:gap-5 sm:rounded-[28px] sm:px-6 sm:py-5 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center",
            )}
          >
            <div className={cn("flex items-start gap-3", isPrintMode ? "gap-4" : "sm:gap-4")}>
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full bg-[#fff1e7] text-[#ff5b14]",
                  isPrintMode ? "h-14 w-14" : "h-12 w-12 sm:h-16 sm:w-16",
                )}
              >
                <Info className={cn(isPrintMode ? "h-7 w-7" : "h-6 w-6 sm:h-8 sm:w-8")} />
              </div>
              <div className="space-y-2">
                <p className={cn("text-slate-600", isPrintMode ? "text-lg" : "text-base sm:text-lg")}>Merci pour votre confiance.</p>
                <p className={cn("font-semibold text-slate-950", isPrintMode ? "text-2xl" : "text-xl sm:text-2xl")}>L&apos;équipe TOK</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className={cn("font-semibold text-slate-950", isPrintMode ? "text-lg" : "text-base sm:text-lg")}>Paiement :</p>
              <p className={cn("text-slate-600", isPrintMode ? "text-sm leading-6" : "text-sm leading-6 sm:text-base sm:leading-7")}>
                {data.paymentMessage}
              </p>
            </div>

            <div
              className={cn(
                "inline-flex items-center justify-center gap-3 rounded-full font-semibold",
                isPrintMode ? "px-5 py-3 text-lg" : "px-4 py-3 text-base sm:px-6 sm:py-4 sm:text-xl",
                data.statusToneClassName,
              )}
            >
              <Check className={cn(isPrintMode ? "h-5 w-5" : "h-5 w-5 sm:h-6 sm:w-6")} />
              <span>{data.statusLabel}</span>
            </div>
          </section>

          <footer
            className={cn(
              "flex flex-col gap-3 border-t border-[#f6b790] pt-5 text-xs text-slate-600",
              isPrintMode ? "flex-row items-end justify-between pt-6 text-sm" : "sm:flex-row sm:items-end sm:justify-between sm:pt-6 sm:text-sm",
            )}
          >
            <div className="space-y-1 break-words">
              <p>{[data.sender.name, data.sender.addressLine1, data.sender.addressLine2, data.sender.country].filter(Boolean).join(" - ")}</p>
              {data.sender.vatNumber ? <p>TVA {data.sender.vatNumber}</p> : null}
            </div>
            <div className={cn("break-words text-left", isPrintMode ? "text-right" : "sm:text-right")}>
              <p className="font-semibold text-slate-950">{data.footerMessage}</p>
              <p className="text-[#ff5b14]">{data.sender.website}</p>
            </div>
          </footer>
        </div>
      </div>
    );
  },
);

TokPayableInvoiceDocument.displayName = "TokPayableInvoiceDocument";
