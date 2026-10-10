import { DemoBadge } from "@/components/demo-badge";
import { ProjectForm } from "@/components/forms/entity-forms";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "@/server/actions/entities";
import { requireUser } from "@/server/authz";
import { listClients, listProjects } from "@/server/services/crud";

export const instant = false;

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, clients] = await Promise.all([
    listProjects(user),
    listClients(user),
  ]);
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <Topbar user={user} title="Projects" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectForm action={createProjectAction} clients={clientOptions} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>{project.name}</CardTitle>
                  <DemoBadge isDemo={project.isDemo} />
                  <Badge variant="secondary">{project.status}</Badge>
                </div>
                <form action={deleteProjectAction}>
                  <input type="hidden" name="id" value={project.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </CardHeader>
              <CardContent>
                <ProjectForm
                  action={updateProjectAction}
                  clients={clientOptions}
                  defaults={{
                    id: project.id,
                    name: project.name,
                    description: project.description ?? "",
                    clientId: project.clientId ?? "",
                    status: project.status,
                    startDate: project.startDate ?? "",
                    dueDate: project.dueDate ?? "",
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
