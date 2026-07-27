from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if source.count(old) != 1:
        raise SystemExit(f"{label} anchor changed")
    return source.replace(old, new, 1)


auth_path = Path("src/pages/Auth.tsx")
auth = auth_path.read_text(encoding="utf-8")

auth = replace_once(
    auth,
    '  const [legalAccepted, setLegalAccepted] = useState(false);\n',
    '  const [legalAccepted, setLegalAccepted] = useState(false);\n'
    '  const [legalAcceptanceDraft, setLegalAcceptanceDraft] = useState(false);\n',
    "Auth legal acceptance state",
)

modal_pattern = re.compile(
    r'''              \{!isLogin && !legalAccepted \? \(\n.*?\n              \) : null\}\n\n              \{!isRecoveringPrivilegedSignup \? \(''',
    re.S,
)
modal_replacement = '''              {!isLogin && !legalAccepted ? (
                <div
                  className="fixed inset-0 z-[1900] isolate flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/45 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] backdrop-blur-md sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="legal-acceptance-title"
                >
                  <div className="pointer-events-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl sm:p-7">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div className="mt-5 text-center">
                      <h2 id="legal-acceptance-title" className="text-xl font-semibold">
                        Accepter les conditions générales
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Avant de créer votre compte TOK, confirmez que vous avez lu et accepté les conditions applicables et la politique de confidentialité.
                      </p>
                    </div>
                    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-sm">
                      <Checkbox
                        id="legal-acceptance"
                        checked={legalAcceptanceDraft}
                        onCheckedChange={(checked) => setLegalAcceptanceDraft(checked === true)}
                        aria-label="J'accepte les CGU et la politique de confidentialité"
                        className="mt-0.5"
                      />
                      <div className="leading-6 text-slate-700">
                        <label htmlFor="legal-acceptance" className="cursor-pointer">
                          J'accepte les
                        </label>{" "}
                        <Link to="/cgu" target="_blank" className="font-semibold text-primary hover:underline">
                          CGU
                        </Link>{" "}
                        et la{" "}
                        <Link
                          to="/politique-confidentialite"
                          target="_blank"
                          className="font-semibold text-primary hover:underline"
                        >
                          politique de confidentialité
                        </Link>{" "}
                        de TOK.
                      </div>
                    </div>
                    <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                      Cochez la case, puis confirmez votre choix. La fenêtre reste ouverte tant que vous n'avez pas accepté ou refusé.
                    </p>
                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setLegalAcceptanceDraft(false);
                          setLegalAccepted(false);
                          setIsLogin(true);
                          setForgotPassword(false);
                        }}
                      >
                        Refuser
                      </Button>
                      <Button
                        type="button"
                        disabled={!legalAcceptanceDraft}
                        onClick={() => setLegalAccepted(true)}
                      >
                        Accepter et continuer
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!isRecoveringPrivilegedSignup ? ('''
auth, modal_count = modal_pattern.subn(modal_replacement, auth, count=1)
if modal_count != 1:
    raise SystemExit("Auth legal acceptance modal anchor changed")

auth = replace_once(
    auth,
    '''                onClick={() => {
                  setIsLogin((current) => !current);
                  setForgotPassword(false);
                }}''',
    '''                onClick={() => {
                  setIsLogin((current) => !current);
                  setForgotPassword(false);
                  setLegalAccepted(false);
                  setLegalAcceptanceDraft(false);
                }}''',
    "Auth login/signup toggle",
)
auth_path.write_text(auth, encoding="utf-8")

test_path = Path("src/test/auth-signup-form.test.tsx")
test = test_path.read_text(encoding="utf-8")
test = replace_once(
    test,
    '''function acceptLegalTerms() {
  fireEvent.click(screen.getByLabelText(/J'accepte les CGU/i));
}''',
    '''function acceptLegalTerms() {
  fireEvent.click(screen.getByLabelText(/J'accepte les CGU/i));
  fireEvent.click(screen.getByRole("button", { name: "Accepter et continuer" }));
}''',
    "Auth test helper",
)

marker = '''  it("submits client signup with the confirmation redirect and does not auto-login without a session", async () => {'''
new_tests = '''  it("keeps the legal dialog open until the user explicitly confirms", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));
    const dialog = screen.getByRole("dialog", { name: "Accepter les conditions générales" });
    const acceptButton = screen.getByRole("button", { name: "Accepter et continuer" });

    expect(acceptButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/J'accepte les CGU/i));
    expect(dialog).toBeInTheDocument();
    expect(acceptButton).toBeEnabled();

    fireEvent.click(acceptButton);
    expect(screen.queryByRole("dialog", { name: "Accepter les conditions générales" })).not.toBeInTheDocument();
    expect(screen.getByText("Conditions acceptées")).toBeInTheDocument();
  });

  it("lets the user refuse the legal terms and return to login", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));

    expect(screen.queryByRole("dialog", { name: "Accepter les conditions générales" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  });

'''
test = replace_once(test, marker, new_tests + marker, "Auth test insertion")
test_path.write_text(test, encoding="utf-8")
