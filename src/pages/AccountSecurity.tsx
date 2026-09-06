import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AccountPasswordForm from "@/components/auth/AccountPasswordForm";
import PushNotificationSettings from "@/components/notifications/PushNotificationSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountSecurity() {
  const navigate = useNavigate();

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-secondary/10 px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux paramètres
        </Button>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle>Sécurité du compte</CardTitle>
            <CardDescription>
              Modifiez le mot de passe utilisé pour accéder à tous vos espaces TOK.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountPasswordForm />
          </CardContent>
        </Card>

        <PushNotificationSettings />
      </div>
    </main>
  );
}