// ============================================
// MEMORY MODULE (memory.js) - FIXED URLs
// ============================================

window.processMemoryChat = async function(userText, apiKey, model, history = []) {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    
    // Format history for the prompt
    const historyText = history.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n");

    // Helper to clean JSON from Markdown (fixes "```json" issues)
    const cleanJSON = (text) => {
        if (!text) return "{}";
        // Remove markdown code blocks
        text = text.replace(/```json/g, "").replace(/```/g, "");
        // Find the outer braces
        const fb = text.indexOf('{');
        const lb = text.lastIndexOf('}');
        if (fb !== -1 && lb !== -1) return text.substring(fb, lb + 1);
        return text;
    };

    // 1. SYNTHESIZER STEP: Aliases & Strict Formatting
    const synthPrompt = `
    USER_IDENTITY: Arvin, unless said otherwise
    CONTEXT:
    ${historyText}
    
    CURRENT INPUT: "${userText}"
    
    TASK:
    1. ENTITIES: Return a comma-separated list of ALL people/places involved.
       - Include the implied subject (e.g. if user says "me" or "I' or similar, write "Arvin").

    2. TOPICS: Broad categories (Identity, Preference, Location, Relationship, History, Work).

    3. KEYWORDS: Extract 3-5 specific search terms from the input. Always include synonyms (e.g., if asking for 'favorite', include 'loves', 'likes', 'preference').
       - If user asks "What is Arvin's MBTI?", keywords must be: "Arvin, MBTI"
       - If user asks "Where does Meidy work?", keywords must be: "Meidy, Work, Job, Office"
       - CRITICAL: This is used for database retrieval. Be specific.

    4. FACT: Extract NEW long-term info as a standalone declarative sentence.
       - Write in the third person.
       - If it is a QUESTION, CHIT-CHAT, or NO NEW INFO, return null.
    
    Return JSON only: { 
        "entities": "...", 
        "topics": "...", 
        "search_keywords": "...",  
        "new_fact": "..." (or null) 
    }
    `;

    console.log("🧠 1. Synthesizing Input..."); 

    let synthData = { entities: "", topics: "", search_keywords: "", new_fact: null };
    let retrievedContext = "";

    try {
        // FIXED: Removed Markdown brackets from URL
        const synthReq = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": window.location.href, "X-Title": "Symbiosis" },
            body: JSON.stringify({ "model": model, "messages": [{ "role": "system", "content": synthPrompt }] })
        });
        const synthRes = await synthReq.json();
        if (synthRes.choices) {
            synthData = JSON.parse(cleanJSON(synthRes.choices[0].message.content));
            console.log("🧠 AI DECISION:", synthData);
        }
    } catch (e) { 
        console.error("Synthesizer failed", e);
        synthData.search_keywords = userText.split(" ").filter(w => w.length > 3).join(", ");
    }

    // 2. RETRIEVAL STEP (Google Sheets)
    if (appsScriptUrl && (synthData.search_keywords || userText.length > 3)) {
        let finalKeywords = synthData.search_keywords || userText;
        console.log("🔍 2. Searching Google Sheet for:", finalKeywords); 

        try {
            const keywords = finalKeywords.split(',').map(s => s.trim());
            const memReq = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain" }, 
                body: JSON.stringify({ action: "retrieve", keywords: keywords })
            });

            const textRes = await memReq.text();
            let memRes;
            try {
                memRes = JSON.parse(textRes);
            } catch (err) {
                memRes = { memories: [] };
            }

            if(memRes.memories && memRes.memories.length > 0) {
                console.log("📂 Memories Found:", memRes.memories); 
                retrievedContext = "MEMORIES FOUND:\n" + memRes.memories.join("\n");
                // NEW: Global variable for visuals to read
                window.lastRetrievedMemories = retrievedContext;
            }
        } catch (e) { console.error("Memory Retrieval failed", e); }
    }

    // 3. FINAL GENERATION STEP
    // 3. FINAL GENERATION STEP: LOCALIZED MOODS IN GRAPH
    const finalSystemPrompt = `
    You are Arvin's digital companion. 
    ${retrievedContext}
    
    CONVERSATION HISTORY:
    ${historyText}
    
    User: "${userText}"
    
    TASK:
    1. Answer briefly.
    2. Construct a KNOWLEDGE GRAPH where each node MUST have its own individual mood.
       - CENTER: Main subject (1 word, UPPERCASE).
       - BRANCHES: 3-6 sub-topics (1 word each, UPPERCASE).
       - LEAVES: 1-3 details per Branch (1 word each, UPPERCASE).
       
    MOODS TO CHOOSE FROM: [NEUTRAL, AFFECTIONATE, CRYPTIC, WARNING, JOYFUL, CURIOUS, SAD]

    Return JSON: 
    { 
      "response": "...", 
      "mood": "GLOBAL_MOOD",
      "graph": {
          "center": "MAIN",
          "mood": "CENTER_MOOD",
          "branches": [ 
             { 
               "label": "SUB", 
               "mood": "SUB_MOOD", 
               "leaves": [
                  {"text": "LEAF_1", "mood": "LEAF_MOOD"},
                  {"text": "LEAF_2", "mood": "LEAF_MOOD"}
               ] 
             } 
          ]
      }
    }
    `;

    // FIXED: Removed Markdown brackets from URL
    const finalReq = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": window.location.href, "X-Title": "Symbiosis" },
        body: JSON.stringify({ "model": model, "messages": [{ "role": "user", "content": finalSystemPrompt }] })
    });
    
    // 4. STORAGE STEP
    if (appsScriptUrl && synthData.new_fact && synthData.new_fact !== "null") {
        fetch(appsScriptUrl, {
            method: "POST",
            mode: 'no-cors', 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ 
                action: "store", 
                entities: synthData.entities, 
                topics: synthData.topics, 
                fact: synthData.new_fact 
            })
        }).catch(e => console.error("❌ Save failed", e));
    }

    const responseData = await finalReq.json();
    
    // Clean response before returning
    if (responseData.choices && responseData.choices[0]) {
        responseData.choices[0].message.content = cleanJSON(responseData.choices[0].message.content);
    }
    
    responseData.detected_entities = synthData.entities; 
    return responseData;

}
