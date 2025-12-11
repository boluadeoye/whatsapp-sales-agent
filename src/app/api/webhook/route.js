import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAIResponse(userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "Error: GROQ_API_KEY is missing in Vercel.";

  // Fetch Products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('is_active', true);

  const systemPrompt = `
  You are a Sales AI. Inventory: ${JSON.stringify(products)}.
  Rules: Negotiate politely. If agreed, output intent: finalize_payment.
  Output JSON: { "intent": "string", "reply": "string" }
  `;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) return `Groq Error: ${data.error.message}`;
    
    const result = JSON.parse(data.choices[0].message.content);

    if (result.intent === "finalize_payment") {
      const ref = Math.floor(Math.random() * 1000000);
      result.reply += `\n\n💳 Pay here: https://paystack.com/pay/${ref}`;
    }
    return result.reply;
  } catch (e) {
    return `Brain Error: ${e.message}`;
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("📩 INCOMING BODY:", JSON.stringify(body)); // DEBUG LOG 1

    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      const text = body.message.text;
      
      // 1. Get AI Reply
      const aiReply = await getAIResponse(text);
      console.log("🤖 AI REPLY:", aiReply); // DEBUG LOG 2

      // 2. Send to Telegram (AND CHECK RESPONSE)
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) console.error("❌ FATAL: TELEGRAM_BOT_TOKEN is missing!");

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: aiReply })
      });

      const tgData = await tgRes.json();
      console.log("📤 TELEGRAM API RESPONSE:", JSON.stringify(tgData)); // DEBUG LOG 3

      if (!tgData.ok) {
        console.error("❌ TELEGRAM FAILED:", tgData.description);
      }

      return Response.json({ status: "success", telegram_response: tgData });
    }

    return Response.json({ status: "ignored", reason: "Not a text message" });
  } catch (error) {
    console.error("❌ SERVER CRASH:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
