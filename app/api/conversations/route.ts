import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }
  return createClient(url, key);
}

// GET /api/conversations — list all conversations
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/conversations]", err);
    return NextResponse.json(
      { error: "Impossible de récupérer les conversations." },
      { status: 500 }
    );
  }
}

// POST /api/conversations — create a new conversation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title: string =
      typeof body?.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : "Nouvelle conversation";

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("conversations")
      .insert({ title })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/conversations]", err);
    return NextResponse.json(
      { error: "Impossible de créer la conversation." },
      { status: 500 }
    );
  }
}
