import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  approveMessageAction,
  submitMessageReviewAction,
} from "@/server/actions/outreach";
import { requireUser } from "@/server/authz";
import { listReviewQueue } from "@/server/services/outreach";

export const instant = false;

export default async function OutreachReviewPage() {
  const user = await requireUser();
  const queue = await listReviewQueue(user);

  return (
    <>
      <Topbar user={user} title="Review queue" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <p className="text-sm">
          <Link
            href="/outreach"
            className="text-muted-foreground hover:underline"
          >
            ← Outreach
          </Link>
        </p>
        <Card>
          <CardHeader>
            <CardTitle>Human review</CardTitle>
            <CardDescription>
              Messages must be approved before send. Campaign approval is also
              required for approved_outreach.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue empty.</p>
            ) : (
              queue.map((message) => (
                <div
                  key={message.id}
                  className="space-y-2 rounded-md border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{message.subject}</h3>
                    <Badge variant="secondary">{message.status}</Badge>
                    <Badge variant="outline">{message.type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    To {message.toEmail}
                  </p>
                  <pre className="overflow-x-auto rounded bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                    {message.bodyText}
                  </pre>
                  <div className="flex gap-2">
                    {message.status === "draft" ? (
                      <form action={submitMessageReviewAction}>
                        <input type="hidden" name="id" value={message.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Submit for review
                        </Button>
                      </form>
                    ) : null}
                    {message.status === "in_review" ||
                    message.status === "draft" ? (
                      <form action={approveMessageAction}>
                        <input type="hidden" name="id" value={message.id} />
                        <input type="hidden" name="note" value="Reviewed OK" />
                        <Button type="submit" size="sm">
                          Approve message
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
