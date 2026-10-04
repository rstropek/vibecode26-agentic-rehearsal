"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

// What a sign-up or sign-in form shows after a failed attempt; the password is never sent back.
export type AuthFormState = { error?: string; name?: string; email?: string };

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = text(formData, "name");
  const email = text(formData, "email");
  try {
    // nextCookies (lib/auth.ts) sets the session cookie that Better Auth returns.
    await auth.api.signUpEmail({
      body: { name, email, password: String(formData.get("password") ?? "") },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) return { error: error.message, name, email };
    throw error;
  }
  redirect(safeNext(formData.get("next")));
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email");
  try {
    await auth.api.signInEmail({
      body: { email, password: String(formData.get("password") ?? "") },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) return { error: error.message, email };
    throw error;
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
