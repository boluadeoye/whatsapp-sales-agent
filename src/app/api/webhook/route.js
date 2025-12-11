import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAIResponse(chatId, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  
  // 1. Save User Message to DB
  await supabase.from('messages').insert({ chat_id: chatId.toString(), role: 'user', content: userMessage });

  // 2. Fetch Last 10 Messages (Memory)
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId.toString())
    .order('created_at', { ascending: true })
    .limit(10);

  // 3. Fetch Inventory
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('is_active', true);

  const systemPrompt = `
  You are a Sales AI. Inventory: ${JSON.stringify(products)}.
  
  RULES:
  1. REMEMBER CONTEXT. If user says "Yes", look at previous messages to know what they want.
  2. Negotiate politely.
  3. If agreed, output intent: finalize_payment.
  
  Output JSON: { "intent": "string", "reply": "string" }
  `;

  // Format history for Groq
  const messagesPayload = [
    { role: "system", content: systemPrompt },
    ...history.map(msg => ({ role: msg.role, content: msg.content }))
  ];

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messagesPayload,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    if (result.intent === "finalize_payment") {
      const ref = Math.floor(Math.random() * 1000000);
      result.reply += `\n\n💳 Pay here: https://paystack.com/pay/${ref}`;
    }

    // 4. Save AI Reply to DB
    await supabase.from('messages').insert({ chat_id: chatId.toString(), role: 'assistant', content: result.reply });

    return result.reply;
  } catch (e) {
    console.error(e);
    return "I'm thinking...";
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      const text = body.message.text;

      // Send "Typing..."
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' })
      });

      const aiReply = await getAIResponse(chatId, text);

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: aiReply })
      });
      return Response.json({ status: "success" });
    }
    return Response.json({ status: "ignored" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
