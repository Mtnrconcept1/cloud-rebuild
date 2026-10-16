import type { ReactNode } from "react";

/** Keep column meanings next to every value on narrow screens. */
export function B2BTable({ caption, columns, rows }: {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm">
      <table className="hidden w-full table-fixed text-left text-sm md:table">
        <caption className="border-b bg-orange-50 px-5 py-4 text-left font-bold text-orange-950">{caption}</caption>
        <thead className="bg-slate-950 text-white">
          <tr>{columns.map((column) => <th key={column} scope="col" className="break-words px-4 py-4 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, index) => (
          <tr key={index} className="border-t border-slate-200 even:bg-slate-50">
            {row.map((value, cell) => cell === 0
              ? <th key={cell} scope="row" className="break-words px-4 py-4 align-top font-semibold leading-6">{value}</th>
              : <td key={cell} className="break-words px-4 py-4 align-top leading-6 text-slate-700">{value}</td>)}
          </tr>
        ))}</tbody>
      </table>
      <div className="md:hidden">
        <p className="bg-orange-50 px-4 py-4 font-bold text-orange-950">{caption}</p>
        {rows.map((row, index) => (
          <dl key={index} className="space-y-3 border-t border-slate-200 p-4 even:bg-slate-50">
            {row.map((value, cell) => <div key={cell}>
              <dt className="text-xs font-semibold text-slate-500">{columns[cell]}</dt>
              <dd className={`mt-1 break-words text-sm leading-6 ${cell === 0 ? "font-bold" : "text-slate-700"}`}>{value}</dd>
            </div>)}
          </dl>
        ))}
      </div>
    </div>
  );
}
