import { DemoBadge } from "@/components/demo-badge";
import { ClientForm } from "@/components/forms/entity-forms";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createClientAction,
  deleteClientAction,
  updateClientAction,
} from "@/server/actions/entities";
import { requireUser } from "@/server/authz";
import { listClients } from "@/server/services/crud";

export const instant = false;

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await listClients(user);

  return (
    <>
      <Topbar user={user} title="Clients" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Create client</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientForm action={createClientAction} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          {clients.map((client) => (
            <Card key={client.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>{client.name}</CardTitle>
                  <DemoBadge isDemo={client.isDemo} />
                  <Badge variant="secondary">{client.status}</Badge>
                </div>
                <form action={deleteClientAction}>
                  <input type="hidden" name="id" value={client.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </CardHeader>
              <CardContent>
                <ClientForm
                  action={updateClientAction}
                  defaults={{
                    id: client.id,
                    name: client.name,
                    email: client.email,
                    company: client.company ?? "",
                    phone: client.phone ?? "",
                    status: client.status,
                    notes: client.notes ?? "",
                  }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
