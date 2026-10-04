"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Approves or denies a CLI login code for the signed-in user; the CLI's polling picks up the decision.
// Better Auth only lets the session that claimed the code (see page.tsx) decide it.
export async function decideDevice(formData: FormData) {
  const userCode = String(formData.get("userCode") ?? "");
  const approve = formData.get("decision") === "approve";
  const request = { body: { userCode }, headers: await headers() };
  try {
    if (approve) await auth.api.deviceApprove(request);
    else await auth.api.deviceDeny(request);
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    redirect("/device?result=failed");
  }
  redirect(`/device?result=${approve ? "approved" : "denied"}`);
}
