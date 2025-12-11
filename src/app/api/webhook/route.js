import { createClient } from '@supabase/supabase-js';

// 1. Setup Supabase (Server-Side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. The Brain Logic (Adapted for API)
async function getAIResponse(userMessage, userPhone) {
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

    // Transaction Logic
    if (result.intent === "finalize_payment") {
      const ref = "ref_" + Math.floor(Math.random() * 999999);
      result.reply += `\n\n💳 Click to Pay: https://paystack.com/pay/${ref}`;
      
      // Log Order to DB
      await supabase.from('orders').insert({
        amount: 25000, // Simplified for demo
        status: 'pending',
        payment_link: ref
      });
    }

    return result.reply;
  } catch (e) {
    console.error("AI Error:", e);
    return "I'm having trouble connecting to the server. Please try again.";
  }
}

// 3. The Webhook Handler (What WhatsApp talks to)
export async function POST(req) {
  try {
    const body = await req.json();

    // Check if this is a WhatsApp Message
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message && message.type === "text") {
      const userPhone = message.from;
      const userText = message.text.body;

      console.log(`📩 Message from ${userPhone}: ${userText}`);

      // Get Brain Response
      const aiReply = await getAIResponse(userText, userPhone);

      // TODO: Send this reply back to WhatsApp API
      // For now, we just log it to prove it works
      console.log(`🤖 AI Reply: ${aiReply}`);
      
      return Response.json({ status: "success", reply: aiReply });
    }

    return Response.json({ status: "ignored" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// 4. Verification Handler (Required by Meta)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === "bolu_secret_token") {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
