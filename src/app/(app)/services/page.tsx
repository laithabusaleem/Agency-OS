import { DemoBadge } from "@/components/demo-badge";
import { ServiceForm } from "@/components/forms/entity-forms";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createServiceAction,
  deleteServiceAction,
  updateServiceAction,
} from "@/server/actions/entities";
import { requireUser } from "@/server/authz";
import { listServices } from "@/server/services/crud";

export const instant = false;

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function ServicesPage() {
  const user = await requireUser();
  const services = await listServices(user);

  return (
    <>
      <Topbar user={user} title="Services" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Create service</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceForm action={createServiceAction} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{service.name}</CardTitle>
                  <DemoBadge isDemo={service.isDemo} />
                  <Badge variant="secondary">{service.billingType}</Badge>
                  <Badge variant={service.isActive ? "success" : "muted"}>
                    {service.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatMoney(service.unitPriceCents)}
                  </span>
                </div>
                <form action={deleteServiceAction}>
                  <input type="hidden" name="id" value={service.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </CardHeader>
              <CardContent>
                <ServiceForm
                  action={updateServiceAction}
                  defaults={{
                    id: service.id,
                    name: service.name,
                    description: service.description ?? "",
                    billingType: service.billingType,
                    unitPriceCents: service.unitPriceCents,
                    isActive: service.isActive,
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
