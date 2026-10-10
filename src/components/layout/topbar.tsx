import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AuthUser } from "@/server/authz";

export function Topbar({ user, title }: { user: AuthUser; title: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur md:px-8">
      <div>
        <h1 className="font-display text-2xl tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.name}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{user.role}</Badge>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
