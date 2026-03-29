import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `Tu es DAIRIA, un assistant juridique expert en droit social français.
Ton rôle est d'aider les utilisateurs à comprendre leurs droits et obligations en matière de droit du travail, de sécurité sociale et de droit social en général.

Règles impératives :
1. Cite TOUJOURS les articles de loi pertinents (Code du travail, Code de la sécurité sociale, Code civil, etc.) avec leur numéro exact (ex: "Article L1234-1 du Code du travail").
2. Explique les articles cités de manière claire et accessible.
3. Structure tes réponses avec des sections claires quand la réponse est complexe.
4. Rappelle systématiquement en fin de réponse que tes réponses sont informatives et ne remplacent pas l'avis d'un avocat ou d'un conseil juridique professionnel.
5. Si une question dépasse le cadre du droit social français, indique-le clairement et redirige vers les autorités compétentes.
6. Sois précis, professionnel et bienveillant.

Domaines couverts :
- Contrat de travail (CDI, CDD, intérim, alternance)
- Licenciement, rupture conventionnelle, démission
- Salaire, primes, congés, RTT
- Discrimination et harcèlement au travail
- Représentation du personnel, syndicats
- Maladie, accident du travail, inaptitude
- Retraite et sécurité sociale
- Droits des salariés et obligations des employeurs`;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversationId, history } = body as {
      message: string;
      conversationId: string | null;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Le message est requis." },
        { status: 400 }
      );
    }

    const sanitizedMessage = message.trim().slice(0, 4000);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "La clé API Anthropic n'est pas configurée." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Build message history (cap at last 20 exchanges to avoid token overflow)
    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];
    const messages: Anthropic.MessageParam[] = [
      ...safeHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: sanitizedMessage },
    ];

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    });

    const assistantContent =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Persist to Supabase if we have a conversationId
    const supabase = getSupabaseAdmin();
    let activeConversationId = conversationId;

    if (supabase) {
      // Create conversation if none exists
      if (!activeConversationId) {
        const title =
          sanitizedMessage.length > 80
            ? sanitizedMessage.slice(0, 77) + "..."
            : sanitizedMessage;
        const { data: conv, error: convErr } = await supabase
          .from("conversations")
          .insert({ title })
          .select()
          .single();
        if (!convErr && conv) {
          activeConversationId = conv.id;
        }
      }

      if (activeConversationId) {
        await supabase.from("messages").insert([
          {
            conversation_id: activeConversationId,
            role: "user",
            content: sanitizedMessage,
          },
          {
            conversation_id: activeConversationId,
            role: "assistant",
            content: assistantContent,
          },
        ]);
      }
    }

    return NextResponse.json({
      answer: assistantContent,
      conversationId: activeConversationId,
    });
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return NextResponse.json(
      {
        error:
          "Une erreur est survenue lors du traitement de votre question. Veuillez réessayer.",
      },
      { status: 500 }
    );
  }
}
