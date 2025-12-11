require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// 1. Setup Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. Setup Terminal Chat Interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let conversationHistory = [];

async function startChat() {
  const apiKey = process.env.GROQ_API_KEY;
  
  // Fetch Products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price, description')
    .eq('is_active', true);

  // --- THE PERSONA ---
  const systemPrompt = `
  You are "Bolu's Sales Assistant". You are friendly, professional, and persuasive.
  
  INVENTORY:
  ${JSON.stringify(products)}
  
  GUIDELINES:
  1. **Answer Questions:** Use the product description to answer inquiries.
  2. **Negotiation:** Prices are FIXED. If a user asks for a discount, politely decline but emphasize quality. (e.g., "I can't go lower, but this quality is top-tier!").
  3. **Closing:** If the user agrees to buy, output intent "finalize_payment".
  4. **Tone:** Warm, helpful, concise. Use emojis occasionally.
  
  OUTPUT FORMAT (JSON ONLY):
  {
    "intent": "inquiry" | "negotiation" | "finalize_payment",
    "reply": "Your conversational response here",
    "product_id": number | null
  }
  `;

  conversationHistory.push({ role: "system", content: systemPrompt });

  console.log("\n💬 BOLU'S SHOP AI (Type 'exit' to quit)");
  console.log("---------------------------------------");
  console.log("Bot: Welcome to Bolu's Tech Shop! How can I help you today?");

  // 3. The Chat Loop
  const askQuestion = () => {
    rl.question('You: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      // Add user message to history
      conversationHistory.push({ role: "user", content: userInput });

      // Call Groq
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: conversationHistory,
            temperature: 0.3, // Slightly higher for creativity
            response_format: { type: "json_object" }
          })
        });

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        // Handle Payment Logic
        if (result.intent === "finalize_payment") {
          const ref = "ref_" + Math.floor(Math.random() * 99999);
          result.reply += `\n\n💳 Secure Link: https://paystack.com/pay/${ref}`;
        }

        // Print Reply
        console.log(`Bot: ${result.reply}`);

        // Add bot reply to history (so it remembers context)
        conversationHistory.push({ role: "assistant", content: result.reply });

      } catch (e) {
        console.log("Bot: [Connection Error] Let me think...");
      }

      askQuestion(); // Loop back
    });
  };

  askQuestion();
}

startChat();
