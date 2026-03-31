import { NextResponse } from "next/server";
import { getConversation, listMessages } from "@/lib/trip-ai/chatStore";

export async function GET(
  _request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const conversationId = params.conversationId;
    const conversation = await getConversation(conversationId);
    const messages = await listMessages(conversationId);

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar la conversación." },
      { status: 500 }
    );
  }
}
