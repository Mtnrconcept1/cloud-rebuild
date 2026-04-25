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
};

function getGroupIcon(kind: PayableInvoiceItemKind) {
  if (kind === "order_commission") return ShoppingBag;
  if (kind === "campaign_payment") return Megaphone;
  if (kind === "manual_adjustment") return ReceiptText;
  return CalendarDays;
}

function GroupCard({ group }: { group: PayableInvoiceGroupSummary }) {
  const Icon = getGroupIcon(group.kind);

  return (
    <div className="grid min-h-[272px] border-t border-[#f6b790] bg-white first:border-t-0 md:border-l md:first:border-l-0 md:[&:nth-child(3n+1)]:border-l-0">
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#ff8a3d] text-white">
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ff5b14]">{group.title}</p>
            <p className="text-sm text-slate-600">{group.subtitle}</p>
          </div>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-4xl font-semibold text-slate-950">{group.countValue}</p>
          <p className="text-sm text-slate-600">{group.detailLabel}</p>
          <p className="text-2xl font-semibold text-slate-900">{group.baseLabel}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[#f6b790] bg-[#fff3ea] px-6 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{group.footerLabel}</p>
          <p className="text-sm text-slate-700">{group.commissionLabel}</p>
        </div>
        <p className="text-3xl font-semibold text-[#ff5b14]">{formatPayableAmount(group.amountTtc)}</p>
      </div>
    </div>
  );
}

export const TokPayableInvoiceDocument = forwardRef<HTMLDivElement, TokPayableInvoiceDocumentProps>(
  ({ data, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "mx-auto w-full max-w-[1024px] rounded-[32px] bg-white px-6 py-8 text-slate-900 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.4)] sm:px-10 sm:py-10 print:max-w-none print:rounded-none print:px-0 print:py-0 print:shadow-none",
          className,
        )}
      >
        <div className="space-y-8">
          <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)_300px] lg:items-start">
            <div className="flex justify-center lg:justify-start">
              <div className="flex h-[240px] w-[240px] items-center justify-center overflow-hidden rounded-[36px]">
                <img src={data.logoUrl} alt="TOK" className="h-full w-full object-contain" />
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-3">
                <h1 className="font-display text-5xl font-bold uppercase tracking-[0.08em] text-[#ff5b14]">
                  Facture
                </h1>
                <div className="inline-flex rounded-full border border-[#ff9d67] px-6 py-3 text-xl font-semibold text-[#ff5b14]">
                  {data.invoice.invoice_number || data.invoice.id.slice(0, 8)}
                </div>
              </div>

              <div className="grid gap-3 text-lg sm:grid-cols-[170px_minmax(0,1fr)]">
                <span className="font-medium text-slate-600">Date de facture :</span>
                <span>{data.createdAtLabel}</span>
                <span className="font-medium text-slate-600">Echeance :</span>
                <span>{data.dueAtLabel}</span>
                <span className="font-medium text-slate-600">Statut :</span>
                <span>
                  <span className={cn("inline-flex rounded-full px-4 py-1.5 text-base font-medium", data.statusToneClassName)}>
                    {data.statusLabel}
                  </span>
                </span>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#f6b790] px-6 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ff5b14]">Expediteur</p>
              <div className="mt-4 space-y-2 text-lg">
                <p className="text-3xl font-semibold text-slate-950">{data.sender.name}</p>
                {data.sender.addressLine1 ? <p>{data.sender.addressLine1}</p> : null}
                {data.sender.addressLine2 ? <p>{data.sender.addressLine2}</p> : null}
                {data.sender.country ? <p>{data.sender.country}</p> : null}
              </div>
              <div className="mt-6 space-y-2 text-base text-slate-700">
                {data.sender.vatNumber ? <p>TVA {data.sender.vatNumber}</p> : null}
                {data.sender.email ? <p>Email : {data.sender.email}</p> : null}
                {data.sender.phone ? <p>Tel. : {data.sender.phone}</p> : null}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[28px] border border-[#f6b790] px-6 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ff5b14]">Destinataire</p>
              <div className="mt-4 space-y-2 text-lg">
                <p className="text-3xl font-semibold text-slate-950">{data.recipient.name}</p>
                {data.recipient.addressLine1 ? <p>{data.recipient.addressLine1}</p> : null}
                {data.recipient.addressLine2 ? <p>{data.recipient.addressLine2}</p> : null}
                {data.recipient.country ? <p>{data.recipient.country}</p> : null}
              </div>
              <div className="mt-6 space-y-2 text-base text-slate-700">
                {data.recipient.vatNumber ? <p>TVA / IDE : {data.recipient.vatNumber}</p> : null}
                {data.recipient.email ? <p>Email : {data.recipient.email}</p> : null}
                {data.recipient.phone ? <p>Tel. : {data.recipient.phone}</p> : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#f6b790] px-6 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ff5b14]">Periode de facturation</p>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#fff1e7] text-[#ff5b14]">
                  <CalendarDays className="h-8 w-8" />
                </div>
                <div className="space-y-3">
                  <p className="text-3xl font-semibold text-slate-950">{data.periodLabel}</p>
                  <p className="max-w-[34ch] text-base leading-7 text-slate-600">
                    Cette facture regroupe l&apos;ensemble des montants factures par TOK durant la periode ci-dessus.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <section className="space-y-4">
            <h2 className="text-3xl font-semibold uppercase tracking-[0.05em] text-slate-950">Recapitulatif</h2>
            <div className="overflow-hidden rounded-[28px] border border-[#f6b790]">
              <div className="grid md:grid-cols-2 xl:grid-cols-3">
                {data.groups.map((group) => (
                  <GroupCard key={group.kind} group={group} />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-semibold uppercase tracking-[0.05em] text-slate-950">Detail de la facturation</h2>
            <div className="overflow-hidden rounded-[24px] border border-[#f6b790]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-[#fff8f3] text-sm uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="border-b border-[#f6b790] px-5 py-4">Type</th>
                      <th className="border-b border-[#f6b790] px-5 py-4">Detail</th>
                      <th className="border-b border-[#f6b790] px-5 py-4">Quantite</th>
                      <th className="border-b border-[#f6b790] px-5 py-4">Base de calcul</th>
                      <th className="border-b border-[#f6b790] px-5 py-4">Facturation TOK</th>
                      <th className="border-b border-[#f6b790] px-5 py-4 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="text-base">
                    {data.groups.map((group) => {
                      const Icon = getGroupIcon(group.kind);

                      return (
                        <tr key={group.kind} className="align-top">
                          <td className="border-b border-[#f6b790] px-5 py-5">
                            <div className="flex items-center gap-3 font-semibold text-slate-950">
                              <Icon className="h-5 w-5 text-[#ff5b14]" />
                              <span>{group.title}</span>
                            </div>
                          </td>
                          <td className="border-b border-[#f6b790] px-5 py-5 text-slate-600">{group.detailLabel}</td>
                          <td className="border-b border-[#f6b790] px-5 py-5 text-slate-600">{group.quantityLabel}</td>
                          <td className="border-b border-[#f6b790] px-5 py-5 text-slate-600">{group.baseLabel}</td>
                          <td className="border-b border-[#f6b790] px-5 py-5 text-slate-600">{group.commissionLabel}</td>
                          <td className="border-b border-[#f6b790] px-5 py-5 text-right text-2xl font-semibold text-slate-950">
                            {formatPayableAmount(group.amountTtc)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#fff3ea]">
                      <td colSpan={5} className="px-5 py-5 text-right text-xl font-semibold uppercase tracking-[0.08em] text-slate-700">
                        Total TTC
                      </td>
                      <td className="px-5 py-5 text-right text-3xl font-bold text-[#ff5b14]">
                        {formatPayableAmount(data.totalTtc)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="grid gap-5 rounded-[28px] border border-[#f6b790] px-6 py-5 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#fff1e7] text-[#ff5b14]">
                <Info className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <p className="text-lg text-slate-600">Merci pour votre confiance.</p>
                <p className="text-2xl font-semibold text-slate-950">L&apos;equipe TOK</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-lg font-semibold text-slate-950">Paiement :</p>
              <p className="text-base leading-7 text-slate-600">{data.paymentMessage}</p>
            </div>

            <div className={cn("inline-flex items-center gap-3 rounded-full px-6 py-4 text-xl font-semibold", data.statusToneClassName)}>
              <Check className="h-6 w-6" />
              <span>{data.statusLabel}</span>
            </div>
          </section>

          <footer className="flex flex-col gap-3 border-t border-[#f6b790] pt-6 text-sm text-slate-600 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p>{[data.sender.name, data.sender.addressLine1, data.sender.addressLine2, data.sender.country].filter(Boolean).join(" - ")}</p>
              {data.sender.vatNumber ? <p>TVA {data.sender.vatNumber}</p> : null}
            </div>
            <div className="text-left sm:text-right">
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
