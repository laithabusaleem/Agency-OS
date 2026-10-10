import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getIntegrationStatus } from "@/lib/env";
import { requireUser } from "@/server/authz";

export const instant = false;

export default async function IntegrationsPage() {
  const user = await requireUser();
  const integrations = getIntegrationStatus();

  return (
    <>
      <Topbar user={user} title="Integrations" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Connection status</CardTitle>
            <CardDescription>
              Status reflects whether server-only credentials are present.
              Secret values are never sent to the browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {integrations.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-background/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{item.name}</h3>
                  <Badge variant={item.configured ? "success" : "muted"}>
                    {item.configured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
