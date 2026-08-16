import { Link } from "react-router-dom";

const ComingSoon = () => {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-12 text-center">
      <div className="w-full max-w-md">
        <img
          src="/logotok.png"
          alt="TOK"
          className="mx-auto mb-8 h-20 w-auto object-contain"
        />
        <h1 className="text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          Ouverture de Tok imminente.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-base text-muted-foreground sm:text-lg">
          Nous vous tiendrons informé du grand lancement.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            to="/auth"
            className="inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Créer un compte restaurateur
          </Link>
          <Link
            to="/auth"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </div>
      </div>
    </main>
  );
};

export default ComingSoon;
