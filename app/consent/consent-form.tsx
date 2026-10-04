"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

// Sends the decision to Better Auth's consent endpoint from the browser, as its docs prescribe: the endpoint continues
// the authorization with the browser's own request. Either way it answers with the app's redirect URI, carrying the
// authorization code or `access_denied`, and the browser goes back to the app.
export function ConsentForm({ oauthQuery }: { oauthQuery: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // The buttons only work once React runs here; until then a click would be lost, so they stay disabled.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  function decide(accept: boolean) {
    startTransition(async () => {
      setError(undefined);
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: oauthQuery }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        "url" in body &&
        typeof body.url === "string"
      ) {
        window.location.assign(body.url);
        return;
      }
      setError(
        "That didn't work. The request may have expired; start connecting again from your app.",
      );
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <FormError>{error}</FormError>
      <div className="flex gap-3">
        <Button
          type="button"
          disabled={!ready || pending}
          onClick={() => decide(true)}
        >
          Allow
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={!ready || pending}
          onClick={() => decide(false)}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
