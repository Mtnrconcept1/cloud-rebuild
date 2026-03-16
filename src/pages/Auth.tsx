import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type UserRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LOGO_URL } from "@/lib/constants";
import { ShoppingBag, ChefHat, Shield, Bike } from "lucide-react";

const ROLE_CONFIG: Record<UserRole, { label: string; desc: string; icon: typeof ShoppingBag; to: string; color: string }> = {
  client: { label: "Client", desc: "Commander et decouvrir des restaurants", icon: ShoppingBag, to: "/", color: "border-primary bg-primary/5 text-primary" },
  restaurateur: { label: "Restaurateur", desc: "Gerer mon restaurant et mes commandes", icon: ChefHat, to: "/dashboard", color: "border-amber-500 bg-amber-500/5 text-amber-600" },
  admin: { label: "Administration", desc: "Back-office et gestion de la plateforme", icon: Shield, to: "/admin", color: "border-red-500 bg-red-500/5 text-red-600" },
  courier: { label: "Livreur", desc: "Mes livraisons et mes revenus", icon: Bike, to: "/courier", color: "border-emerald-500 bg-emerald-500/5 text-emerald-600" },
};

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get("type") === "restaurateur" ? "restaurateur" : "client";
  const initialIsLogin = searchParams.get("type") !== "restaurateur";

  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleMode, setRoleMode] = useState(initialRole);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, roles, switchRole } = useAuth();

  // After login, if user has multiple roles, show role picker
  useEffect(() => {
    if (user && roles.length > 1 && !showRolePicker) {
      setShowRolePicker(true);
    }
  }, [user, roles]);

  const handleRoleSelect = (selectedRole: UserRole) => {
    switchRole(selectedRole);
    const config = ROLE_CONFIG[selectedRole];
    navigate(config.to);
  };

  const handleResetPassword = async () => {
    if (!email.trim()) return toast({ title: "Entrez votre email", variant: "destructive" });
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email envoyé", description: "Vérifiez votre boîte mail pour réinitialiser votre mot de passe." });
      setForgotPassword(false);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      }
      // Don't navigate here — the useEffect above will handle it once roles are loaded
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: roleMode },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Compte créé !", description: "Vérifiez votre email pour confirmer votre inscription." });
      }
    }
    setLoading(false);
  };

  // Role picker screen (shown after login if multiple roles)
  if (showRolePicker && user && roles.length > 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center space-y-2">
            <img src={LOGO_URL} alt="Deliveroom" className="mx-auto h-16 w-auto object-contain mb-2" />
            <CardTitle className="font-display text-2xl">Bienvenue !</CardTitle>
            <CardDescription>Choisissez votre espace pour continuer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.map((r) => {
              const config = ROLE_CONFIG[r];
              return (
                <button
                  key={r}
                  onClick={() => handleRoleSelect(r)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] hover:shadow-md ${config.color}`}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-background flex items-center justify-center shadow-sm">
                    <config.icon className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-base">{config.label}</p>
                    <p className="text-xs text-muted-foreground">{config.desc}</p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  // If already logged in with single role, redirect
  if (user && roles.length === 1) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-2">
          <img src={LOGO_URL} alt="Deliveroom" className="mx-auto h-20 w-auto object-contain mb-2" />
          <CardTitle className="font-display text-2xl">{isLogin ? "Bon retour !" : "Créer un compte"}</CardTitle>
          <CardDescription>{isLogin ? "Connectez-vous pour accéder à vos restaurants favoris" : "Rejoignez Deliveroom et découvrez les meilleurs restaurants"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isLogin && (
            <div className="mb-6 space-y-2">
              <Tabs defaultValue="client" value={roleMode} onValueChange={setRoleMode} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="client">Client</TabsTrigger>
                  <TabsTrigger value="restaurateur">Restaurateur</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {forgotPassword ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetEmail">Email</Label>
                <Input id="resetEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required />
              </div>
              <Button className="w-full" onClick={handleResetPassword} disabled={loading}>
                {loading ? "Envoi..." : "Réinitialiser le mot de passe"}
              </Button>
              <button type="button" onClick={() => setForgotPassword(false)} className="w-full text-sm text-muted-foreground hover:text-primary transition-colors">
                Retour à la connexion
              </button>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">{roleMode === "client" ? "Nom complet" : "Nom du responsable"}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jean Dupont" required={!isLogin} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
            </Button>
          </form>
          {isLogin && (
            <div className="mt-2 text-center">
              <button type="button" onClick={() => setForgotPassword(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                Mot de passe oublié ?
              </button>
            </div>
          )}
          </>
          )}
          <div className="mt-4 text-center">
            <button type="button" onClick={() => { setIsLogin(!isLogin); setForgotPassword(false); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">
              {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}