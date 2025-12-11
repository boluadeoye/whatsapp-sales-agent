require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testConnection() {
  console.log("🔌 Connecting to Supabase...");
  
  const { data, error } = await supabase
    .from('products')
    .select('*');

  if (error) {
    console.error("❌ Error:", error.message);
  } else {
    console.log("✅ Success! Found Products:");
    console.table(data);
  }
}

testConnection();
