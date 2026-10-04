"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

// What a sign-up or sign-in form shows after a failed attempt; the password is never sent back.
export type AuthFormState = { error?: string; name?: string; email?: string };

// Better Auth's messages ("User already exists.") read like a database; these say what went wrong and what to do.
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD:
    "That email and password don't match. Check both and try again.",
  USER_ALREADY_EXISTS:
    "There's already an account with that email. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "There's already an account with that email. Sign in instead.",
  INVALID_EMAIL: "That doesn't look like an email address.",
  PASSWORD_TOO_SHORT: "The password needs at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long. Try a shorter one.",
};

function message(error: APIError): string {
  return messages[error.body?.code ?? ""] ?? error.message;
}

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
    if (error instanceof APIError)
      return { error: message(error), name, email };
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
    if (error instanceof APIError) return { error: message(error), email };
    throw error;
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
