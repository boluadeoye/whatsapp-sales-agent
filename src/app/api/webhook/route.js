import { createClient } from '@supabase/supabase-js';

// 1. Setup Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. The Brain Logic (Same as before)
async function getAIResponse(userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  
  // Fetch Products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('is_active', true);

  const systemPrompt = `
  You are a Sales AI for "Bolu's Tech Shop".
  INVENTORY: ${JSON.stringify(products)}
  
  RULES:
  - Negotiate politely. Prices are fixed.
  - If user agrees to buy, output "intent": "finalize_payment".
  - Otherwise "intent": "inquiry".
  
  OUTPUT JSON:
  {
    "intent": "string",
    "reply": "string"
  }
  `;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    if (result.intent === "finalize_payment") {
      const ref = "ref_" + Math.floor(Math.random() * 999999);
      result.reply += `\n\n💳 Click to Pay: https://paystack.com/pay/${ref}`;
    }

    return result.reply;
  } catch (e) {
    console.error("AI Error:", e);
    return "I'm thinking...";
  }
}

// 3. Telegram Webhook Handler
export async function POST(req) {
  try {
    const body = await req.json();

    // Check if it's a Message
    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      const userText = body.message.text;

      console.log(`📩 Telegram Message: ${userText}`);

      // Get Brain Response
      const aiReply = await getAIResponse(userText);

      // Send Reply to Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiReply
        })
      });

      return Response.json({ status: "success" });
    }

    return Response.json({ status: "ignored" });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
