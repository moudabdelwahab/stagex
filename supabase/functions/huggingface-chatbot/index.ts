import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type ChatRequest = {
  message?: string;
  sessionId?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as ChatRequest;
    const userMessage = body?.message?.trim();

    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Get Bot Settings (System Prompt)
    const { data: botSettings } = await adminClient
      .from('bot_settings')
      .select('system_prompt')
      .limit(1)
      .single();

    const systemPrompt = botSettings?.system_prompt || "أنت مساعد ذكي لمنصة مدعوم. يجب أن تتحدث باللهجة المصرية فقط.";

    // 2. Get Knowledge Base Context
    const { data: knowledgeBase } = await adminClient
      .from('knowledge_base')
      .select('title, content')
      .limit(5);

    let context = "معلومات عن المشروع:\n";
    if (knowledgeBase) {
      context += knowledgeBase.map(kb => `العنوان: ${kb.title}\nالمحتوى: ${kb.content}`).join('\n---\n');
    }

    // 3. Get HF API Key
    const { data: keyRow } = await adminClient
      .from('api_keys')
      .select('huggingface_key')
      .limit(1)
      .single();

    const hfToken = keyRow?.huggingface_key;
    if (!hfToken) {
      return new Response(JSON.stringify({ error: 'Hugging Face API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Call Hugging Face Inference API (Gemma-2b-it)
    const prompt = `<start_of_turn>user
${systemPrompt}

${context}

السؤال: ${userMessage}<end_of_turn>
<start_of_turn>model
`;

    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/google/gemma-2b-it",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 512,
            temperature: 0.7,
            return_full_text: false
          }
        }),
      }
    );

    if (!hfResponse.ok) {
      const error = await hfResponse.text();
      throw new Error(`HF API Error: ${error}`);
    }

    const result = await hfResponse.json();
    let reply = "";
    
    if (Array.isArray(result) && result[0]?.generated_text) {
      reply = result[0].generated_text.trim();
    } else if (result.generated_text) {
      reply = result.generated_text.trim();
    }

    // 5. Save Bot Reply to Database if sessionId is provided
    if (body.sessionId) {
        await adminClient.from('chat_messages').insert({
            session_id: body.sessionId,
            message_text: reply,
            is_admin_reply: true,
            sender_id: null // System/Bot
        });
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[huggingface-chatbot] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
