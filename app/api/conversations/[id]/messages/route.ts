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

// GET /api/conversations/[id]/messages — retrieve messages for a conversation
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/conversations/[id]/messages]", err);
    return NextResponse.json(
      { error: "Impossible de récupérer les messages." },
      { status: 500 }
    );
  }
}
