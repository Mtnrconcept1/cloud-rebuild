import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bike, ChefHat, FileText, Loader2, Shield, ShoppingBag, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, type UserRole } from "@/lib/auth";
import {
  getMissingSignupDocuments,
  getRequiredSignupDocuments,
  SIGNUP_ROLE_META,
  uploadVerificationDocument,
  type SignupDocumentType,
  type SignupRole,
  type UploadedSignupDocument,
} from "@/lib/signup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LOGO_URL } from "@/lib/constants";

type SignupFormState = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  city: string;
  address: string;
  businessName: string;
  legalName: string;
  businessRegistrationNumber: string;
  taxId: string;
  restaurantName: string;
  restaurantDescription: string;
  vehicleType: string;
  licensePlate: string;
  iban: string;
};

const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string;
    desc: string;
    icon: typeof ShoppingBag;
    to: string;
    color: string;
  }
> = {
  client: {
    label: "Client",
    desc: "Commander et decouvrir des restaurants",
    icon: ShoppingBag,
    to: "/",
    color: "border-primary bg-primary/5 text-primary",
  },
  restaurateur: {
    label: "Restaurateur",
    desc: "Gerer mon restaurant et mes commandes",
    icon: ChefHat,
    to: "/dashboard",
    color: "border-amber-500 bg-amber-500/5 text-amber-600",
  },
  admin: {
    label: "Administration",
    desc: "Back-office et gestion de la plateforme",
    icon: Shield,
    to: "/admin",
    color: "border-red-500 bg-red-500/5 text-red-600",
  },
  courier: {
    label: "Livreur",
    desc: "Mes livraisons et mes revenus",
    icon: Bike,
    to: "/courier",
    color: "border-emerald-500 bg-emerald-500/5 text-emerald-600",
  },
};

const EMPTY_SIGNUP_FORM: SignupFormState = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  city: "",
  address: "",
  businessName: "",
  legalName: "",
  businessRegistrationNumber: "",
  taxId: "",
  restaurantName: "",
  restaurantDescription: "",
  vehicleType: "bicycle",
  licensePlate: "",
  iban: "",
};

function getInitialSignupRole(searchParams: URLSearchParams): SignupRole {
  const requestedType = String(searchParams.get("type") || "").toLowerCase();
  if (requestedType === "restaurateur") return "restaurateur";
  if (requestedType === "courier" || requestedType === "livreur") return "courier";
  return "client";
}

function getSignupValidationError(role: SignupRole, form: SignupFormState) {
  if (!form.fullName.trim()) return "Le nom complet est requis.";
  if (!form.email.trim()) return "L'email est requis.";
  if (!form.password.trim() || form.password.length < 6) return "Le mot de passe doit contenir au moins 6 caracteres.";
  if (!form.phone.trim()) return "Le telephone est requis.";
  if (!form.city.trim()) return "La ville est requise.";
  if (!form.address.trim()) return "L'adresse est requise.";

  if (role === "restaurateur") {
    if (!form.businessName.trim()) return "Le nom commercial est requis.";
    if (!form.legalName.trim()) return "La raison sociale est requise.";
    if (!form.businessRegistrationNumber.trim()) return "Le numero d'immatriculation est requis.";
    if (!form.restaurantName.trim()) return "Le nom du restaurant est requis.";
    if (!form.iban.trim()) return "L'IBAN de versement est requis.";
  }

  if (role === "courier") {
    if (!form.iban.trim()) return "L'IBAN de versement est requis.";
    if (["scooter", "car"].includes(form.vehicleType) && !form.licensePlate.trim()) {
      return "La plaque d'immatriculation est requise pour ce vehicule.";
    }
  }

  return null;
}

function splitCourierName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" "),
  };
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, roles, switchRole } = useAuth();

  const initialRole = getInitialSignupRole(searchParams);
  const [isLogin, setIsLogin] = useState(initialRole === "client");
  const [roleMode, setRoleMode] = useState<SignupRole>(initialRole);
  const [signupForm, setSignupForm] = useState<SignupFormState>(EMPTY_SIGNUP_FORM);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [documents, setDocuments] = useState<Partial<Record<SignupDocumentType, File | null>>>({});

  const requiredDocuments = useMemo(
    () => getRequiredSignupDocuments(roleMode, signupForm.vehicleType),
    [roleMode, signupForm.vehicleType],
  );

  useEffect(() => {
    if (user && roles.length > 1 && !showRolePicker) {
      setShowRolePicker(true);
    }
  }, [user, roles, showRolePicker]);

  const handleRoleSelect = (selectedRole: UserRole) => {
    switchRole(selectedRole);
    navigate(ROLE_CONFIG[selectedRole].to);
  };

  const handleResetPassword = async () => {
    if (!signupForm.email.trim()) {
      toast({ title: "Entrez votre email", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(signupForm.email, {
      redirectTo: `${window.location.origin}/auth`,
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Email envoye",
        description: "Consultez votre boite mail pour reinitialiser votre mot de passe.",
      });
      setForgotPassword(false);
    }
    setLoading(false);
  };

  const updateSignupField = <K extends keyof SignupFormState>(key: K, value: SignupFormState[K]) => {
    setSignupForm((current) => ({ ...current, [key]: value }));
  };

  const handleDocumentChange = (documentType: SignupDocumentType, file: File | null) => {
    setDocuments((current) => ({
      ...current,
      [documentType]: file,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: signupForm.email,
          password: signupForm.password,
        });

        if (error) {
          throw error;
        }

        return;
      }

      const validationError = getSignupValidationError(roleMode, signupForm);
      if (validationError) {
        throw new Error(validationError);
      }

      const missingDocuments = getMissingSignupDocuments(requiredDocuments, documents);
      if (missingDocuments.length > 0) {
        throw new Error(`Documents manquants: ${missingDocuments.map((item) => item.label).join(", ")}.`);
      }

      const signUpResponse = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
        options: {
          data: {
            full_name: signupForm.fullName,
            role: roleMode,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpResponse.error) {
        throw signUpResponse.error;
      }

      let activeUser = signUpResponse.data.user;
      let activeSession = signUpResponse.data.session;

      if (!activeSession && signupForm.email && signupForm.password) {
        const signInAttempt = await supabase.auth.signInWithPassword({
          email: signupForm.email,
          password: signupForm.password,
        });

        if (!signInAttempt.error) {
          activeUser = signInAttempt.data.user;
          activeSession = signInAttempt.data.session;
        }
      }

      if (!activeUser?.id || !activeSession) {
        toast({
          title: "Compte cree",
          description:
            "Confirmez votre email puis reconnectez-vous pour finaliser l'envoi des documents de verification.",
        });
        return;
      }

      const uploadedDocuments: UploadedSignupDocument[] = [];
      for (const requirement of requiredDocuments) {
        const file = documents[requirement.type];
        if (!file) continue;

        const uploadedDocument = await uploadVerificationDocument({
          userId: activeUser.id,
          role: roleMode,
          documentType: requirement.type,
          file,
        });
        uploadedDocuments.push(uploadedDocument);
      }

      const { error: syncError } = await supabase.rpc("sync_signup_application", {
        p_requested_role: roleMode,
        p_full_name: signupForm.fullName,
        p_phone: signupForm.phone,
        p_city: signupForm.city,
        p_address: signupForm.address,
        p_legal_name: roleMode === "restaurateur" ? signupForm.legalName : null,
        p_business_name: roleMode === "restaurateur" ? signupForm.businessName : null,
        p_business_registration_number:
          roleMode === "restaurateur" ? signupForm.businessRegistrationNumber : null,
        p_tax_id: roleMode === "restaurateur" ? signupForm.taxId : null,
        p_restaurant_name: roleMode === "restaurateur" ? signupForm.restaurantName : null,
        p_restaurant_description:
          roleMode === "restaurateur" ? signupForm.restaurantDescription : null,
        p_vehicle_type: roleMode === "courier" ? signupForm.vehicleType : null,
        p_license_plate: roleMode === "courier" ? signupForm.licensePlate : null,
        p_iban:
          roleMode === "courier" || roleMode === "restaurateur" ? signupForm.iban : null,
        p_metadata:
          roleMode === "courier"
            ? splitCourierName(signupForm.fullName)
            : roleMode === "restaurateur"
              ? { onboarding_source: "auth_signup" }
              : { verification_source: "auth_signup" },
        p_documents: uploadedDocuments,
      });

      if (syncError) {
        throw syncError;
      }

      toast({
        title: "Inscription enregistree",
        description:
          "Votre compte et votre dossier documentaire ont ete transmis pour verification.",
      });

      setDocuments({});
      setSignupForm((current) => ({
        ...EMPTY_SIGNUP_FORM,
        email: current.email,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Une erreur est survenue.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (showRolePicker && user && roles.length > 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center space-y-2">
            <img src={LOGO_URL} alt="Tok" className="mx-auto h-16 w-auto object-contain mb-2" />
            <CardTitle className="font-display text-2xl">Bienvenue</CardTitle>
            <CardDescription>Choisissez votre espace pour continuer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.map((role) => {
              const config = ROLE_CONFIG[role];
              return (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  className={`w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.01] hover:shadow-md ${config.color}`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm">
                    <config.icon className="h-6 w-6" />
                  </div>
                  <div>
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

  if (user && roles.length === 1) {
    navigate(ROLE_CONFIG[roles[0]].to);
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4 py-10">
      <Card className="w-full max-w-3xl shadow-lg border-0">
        <CardHeader className="text-center space-y-3">
          <img src={LOGO_URL} alt="Tok" className="mx-auto h-20 w-auto object-contain" />
          <CardTitle className="font-display text-2xl">
            {isLogin ? "Bon retour" : "Creer un compte verifie"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Connectez-vous pour acceder a vos espaces client, restaurateur, livreur ou admin."
              : "Choisissez un profil, renseignez vos informations et ajoutez les justificatifs requis."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isLogin ? (
            <Tabs value={roleMode} onValueChange={(value) => setRoleMode(value as SignupRole)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="client">Client</TabsTrigger>
                <TabsTrigger value="restaurateur">Restaurateur</TabsTrigger>
                <TabsTrigger value="courier">Livreur</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {!isLogin ? (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium">{SIGNUP_ROLE_META[roleMode].label}</p>
              <p className="pt-1 text-muted-foreground">{SIGNUP_ROLE_META[roleMode].description}</p>
            </div>
          ) : null}

          {forgotPassword ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={signupForm.email}
                  onChange={(event) => updateSignupField("email", event.target.value)}
                  placeholder="vous@exemple.com"
                  required
                />
              </div>
              <Button className="w-full" onClick={handleResetPassword} disabled={loading}>
                {loading ? "Envoi..." : "Reinitialiser le mot de passe"}
              </Button>
              <button
                type="button"
                onClick={() => setForgotPassword(false)}
                className="w-full text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Retour a la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">
                    {isLogin
                      ? "Email"
                      : roleMode === "restaurateur"
                        ? "Nom du responsable"
                        : "Nom complet"}
                  </Label>
                  {isLogin ? (
                    <Input
                      id="email-login"
                      type="email"
                      value={signupForm.email}
                      onChange={(event) => updateSignupField("email", event.target.value)}
                      placeholder="vous@exemple.com"
                      required
                    />
                  ) : (
                    <Input
                      id="fullName"
                      value={signupForm.fullName}
                      onChange={(event) => updateSignupField("fullName", event.target.value)}
                      placeholder="Jean Dupont"
                      required
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={signupForm.password}
                    onChange={(event) => updateSignupField("password", event.target.value)}
                    placeholder="********"
                    required
                    minLength={6}
                  />
                </div>

                {!isLogin ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={signupForm.email}
                        onChange={(event) => updateSignupField("email", event.target.value)}
                        placeholder="vous@exemple.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telephone</Label>
                      <Input
                        id="phone"
                        value={signupForm.phone}
                        onChange={(event) => updateSignupField("phone", event.target.value)}
                        placeholder="+41 79 000 00 00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Ville</Label>
                      <Input
                        id="city"
                        value={signupForm.city}
                        onChange={(event) => updateSignupField("city", event.target.value)}
                        placeholder="Geneve"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Adresse</Label>
                      <Input
                        id="address"
                        value={signupForm.address}
                        onChange={(event) => updateSignupField("address", event.target.value)}
                        placeholder="Rue, numero, code postal"
                        required
                      />
                    </div>
                  </>
                ) : null}
              </div>

              {!isLogin && roleMode === "restaurateur" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Nom commercial</Label>
                    <Input
                      id="businessName"
                      value={signupForm.businessName}
                      onChange={(event) => updateSignupField("businessName", event.target.value)}
                      placeholder="Tok Rive Gauche"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalName">Raison sociale</Label>
                    <Input
                      id="legalName"
                      value={signupForm.legalName}
                      onChange={(event) => updateSignupField("legalName", event.target.value)}
                      placeholder="Tok Sarl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessRegistrationNumber">Numero d'immatriculation</Label>
                    <Input
                      id="businessRegistrationNumber"
                      value={signupForm.businessRegistrationNumber}
                      onChange={(event) =>
                        updateSignupField("businessRegistrationNumber", event.target.value)
                      }
                      placeholder="CHE-123.456.789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Numero TVA (optionnel)</Label>
                    <Input
                      id="taxId"
                      value={signupForm.taxId}
                      onChange={(event) => updateSignupField("taxId", event.target.value)}
                      placeholder="CHE-123.456 TVA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="restaurantName">Nom du restaurant</Label>
                    <Input
                      id="restaurantName"
                      value={signupForm.restaurantName}
                      onChange={(event) => updateSignupField("restaurantName", event.target.value)}
                      placeholder="Le Comptoir Tok"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iban-restaurateur">IBAN de versement</Label>
                    <Input
                      id="iban-restaurateur"
                      value={signupForm.iban}
                      onChange={(event) => updateSignupField("iban", event.target.value)}
                      placeholder="CH93 0076 2011 6238 5295 7"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="restaurantDescription">Description du restaurant (optionnel)</Label>
                    <Textarea
                      id="restaurantDescription"
                      value={signupForm.restaurantDescription}
                      onChange={(event) =>
                        updateSignupField("restaurantDescription", event.target.value)
                      }
                      placeholder="Cuisine, positionnement, specialites..."
                    />
                  </div>
                </div>
              ) : null}

              {!isLogin && roleMode === "courier" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleType">Vehicule</Label>
                    <select
                      id="vehicleType"
                      value={signupForm.vehicleType}
                      onChange={(event) => updateSignupField("vehicleType", event.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="bicycle">Velo</option>
                      <option value="scooter">Scooter</option>
                      <option value="car">Voiture</option>
                      <option value="walk">A pied</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iban-courier">IBAN de versement</Label>
                    <Input
                      id="iban-courier"
                      value={signupForm.iban}
                      onChange={(event) => updateSignupField("iban", event.target.value)}
                      placeholder="CH93 0076 2011 6238 5295 7"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="licensePlate">Plaque d'immatriculation</Label>
                    <Input
                      id="licensePlate"
                      value={signupForm.licensePlate}
                      onChange={(event) => updateSignupField("licensePlate", event.target.value)}
                      placeholder="Obligatoire pour scooter ou voiture"
                    />
                  </div>
                </div>
              ) : null}

              {!isLogin ? (
                <div className="space-y-4 rounded-2xl border bg-card p-4">
                  <div>
                    <p className="font-medium">Documents a fournir</p>
                    <p className="text-sm text-muted-foreground">
                      Chaque profil impose des pieces justificatives differentes. Les fichiers sont
                      stockes dans un espace prive et revus par l'administration.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {requiredDocuments.map((requirement) => {
                      const selectedFile = documents[requirement.type];
                      return (
                        <label
                          key={requirement.type}
                          className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors hover:border-primary/50 hover:bg-muted/20"
                        >
                          <div className="space-y-1">
                            <p className="font-medium">{requirement.label}</p>
                            <p className="text-xs text-muted-foreground">{requirement.description}</p>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate">
                                {selectedFile ? selectedFile.name : "Aucun fichier selectionne"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : requirement.accept}
                              </p>
                            </div>
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            </div>
                          </div>
                          <Input
                            type="file"
                            className="hidden"
                            accept={requirement.accept}
                            onChange={(event) =>
                              handleDocumentChange(requirement.type, event.target.files?.[0] || null)
                            }
                            disabled={loading}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Traitement...
                  </>
                ) : isLogin ? (
                  "Se connecter"
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Envoyer mon inscription verifiee
                  </>
                )}
              </Button>
            </form>
          )}

          {isLogin && !forgotPassword ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setForgotPassword(true)}
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                Mot de passe oublie ?
              </button>
            </div>
          ) : null}

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin((current) => !current);
                setForgotPassword(false);
              }}
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {isLogin ? "Pas encore de compte ? S'inscrire" : "Deja un compte ? Se connecter"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
