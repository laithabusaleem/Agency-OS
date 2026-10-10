import { Topbar } from "@/components/layout/topbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { checkDatabaseHealth } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { getPublicEnv } from "@/lib/env-public";
import { requireUser } from "@/server/authz";

export const instant = false;

export default async function SettingsPage() {
  const user = await requireUser();
  const env = getServerEnv();
  const publicEnv = getPublicEnv();
  const dbHealth = checkDatabaseHealth();

  return (
    <>
      <Topbar user={user} title="Settings" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Server-loaded profile (not client-mocked).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span> {user.name}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span> {user.email}
            </p>
            <p>
              <span className="text-muted-foreground">Role:</span>{" "}
              <Badge variant="secondary">{user.role}</Badge>
            </p>
            <p>
              <span className="text-muted-foreground">Organization:</span>{" "}
              {user.organizationId}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>
              Non-secret configuration visible to operators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">App:</span>{" "}
              {publicEnv.NEXT_PUBLIC_APP_NAME}
            </p>
            <p>
              <span className="text-muted-foreground">URL:</span>{" "}
              {publicEnv.NEXT_PUBLIC_APP_URL}
            </p>
            <p>
              <span className="text-muted-foreground">Environment:</span>{" "}
              {env.NODE_ENV}
            </p>
            <p>
              <span className="text-muted-foreground">Database dialect:</span>{" "}
              SQLite (portable via Drizzle)
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Database health:</span>
              <Badge variant={dbHealth.ok ? "success" : "destructive"}>
                {dbHealth.ok ? "healthy" : "unhealthy"}
              </Badge>
            </p>
            {!dbHealth.ok && dbHealth.error ? (
              <p className="text-destructive">{dbHealth.error}</p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
