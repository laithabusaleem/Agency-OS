import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPublicEnv } from "@/lib/env-public";

export const instant = false;

export default function LoginPage() {
  const appName = getPublicEnv().NEXT_PUBLIC_APP_NAME;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-display text-4xl tracking-tight">{appName}</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to manage leads, clients, and delivery.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Demo account is labeled in seed output. Secrets never ship to the
              browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
