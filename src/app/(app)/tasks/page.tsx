import { DemoBadge } from "@/components/demo-badge";
import { TaskForm } from "@/components/forms/entity-forms";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/server/actions/entities";
import { requireUser } from "@/server/authz";
import { listProjects, listTasks } from "@/server/services/crud";

export const instant = false;

export default async function TasksPage() {
  const user = await requireUser();
  const [tasks, projects] = await Promise.all([
    listTasks(user),
    listProjects(user),
  ]);
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <>
      <Topbar user={user} title="Tasks" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Create task</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskForm action={createTaskAction} projects={projectOptions} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{task.title}</CardTitle>
                  <DemoBadge isDemo={task.isDemo} />
                  <Badge variant="secondary">{task.status}</Badge>
                  <Badge variant="outline">{task.priority}</Badge>
                </div>
                <form action={deleteTaskAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </CardHeader>
              <CardContent>
                <TaskForm
                  action={updateTaskAction}
                  projects={projectOptions}
                  defaults={{
                    id: task.id,
                    title: task.title,
                    description: task.description ?? "",
                    projectId: task.projectId ?? "",
                    status: task.status,
                    priority: task.priority,
                    dueDate: task.dueDate ?? "",
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
