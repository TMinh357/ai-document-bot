import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importPublicKeyJwk } from "@/lib/crypto/signing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const publicKeyJwk = typeof body?.publicKeyJwk === "string"
    ? body.publicKeyJwk
    : null;

  if (!publicKeyJwk) {
    return NextResponse.json(
      { error: "publicKeyJwk is required." },
      { status: 400 }
    );
  }

  // Sanity check: must be a valid ECDSA P-256 public key.
  try {
    await importPublicKeyJwk(publicKeyJwk);
  } catch {
    return NextResponse.json(
      { error: "Invalid public key format." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      public_key: publicKeyJwk,
      key_created_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "REGISTER_PUBLIC_KEY",
    target_table: "profiles",
    target_id: user.id,
    metadata: { algorithm: "ECDSA-P256" },
  });

  return NextResponse.json({ ok: true });
}
