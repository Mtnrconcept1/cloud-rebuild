import AdminComptaCore from "./AdminCompta";
import AdminPrintOrders from "./AdminPrintOrders";

/** Keeps accounting intact and appends the Level-3 TheTok Print operations console. */
export default function AdminComptaPrintShell() {
  return (
    <>
      <AdminComptaCore />
      <AdminPrintOrders />
    </>
  );
}
