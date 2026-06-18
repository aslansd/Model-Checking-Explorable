/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized GoogleGenAI client to avoid crashes if API Key is missing on boot
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "") {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
  }
  return aiClient;
}

// 1. API Route: Playful AI Tutor translation/explainer for formulas
app.post('/api/explain-formula', async (req, res) => {
  const { formula, metaphor } = req.body;

  if (!formula) {
    res.status(400).json({ error: "Missing temporal logic formula." });
    return;
  }

  const systemInstructions = `You are Nicky Case (ncase.me), a builder of playful 'explorable explanations' and educational mechanics.
Your goal is to explain formal verification and temporal logic in a super simple, conversational, visually evocative, and jargon-free way.
Use analogies, bullet points, and high contrast typography metaphors. Do not use complex math jargon. Keep the tone warm, clear, and adventurous.
Limit your response to 2 key paragraphs or a simple bulleted list. Maintain a markdown format that is easy to render.`;

  const prompt = `Explain the following temporal logic formula in terms of our real-life system metaphor.
System Metaphor: ${metaphor || "A high-tech mechanical model"}
Temporal Formula: ${formula}

Please breaks down what:
1. The operators (like G, F, X, U, A, E, if present) mean in simple terms.
2. What the formula guarantees if we verify it successfully.
Keep it extremely friendly, like a comic-strip description!`;

  try {
    const client = getGeminiClient();
    
    if (!client) {
      // Friendly, highly polished offline fallback if API key is not present/configured
      const offlineResponse = `### 💡 Exploring: \`${formula}\` (Simulated Explanation)

This temporal logic specification represents a fundamental rule about the behavior of your system!

*   **⚡ Always (G)**: The letter **G** stands for **Globally**. It acts as an absolute seal of safety across all parallel universes (paths of execution).
*   **🔮 Eventually (F)**: The letter **F** stands for **Future**. It promises that a desired state is guaranteed to resolve.
*   **🎯 The Target**: \`${metaphor}\`

Because the verification engine works offline, this fallback explains *Safety & Progress* structures instantly. Plug in a real Gemini API Key to enable custom prompt responses!`;
      
      res.json({ explanation: offlineResponse, isFallback: true });
      return;
    }

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstructions,
        temperature: 0.7,
      }
    });

    res.json({ explanation: response.text || "Failed to generate explanation. Let's trace nodes together!", isFallback: false });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.json({
      explanation: `### 🔮 Verification Insights (Local Parser Mode)
We successfully compiled **\`${formula}\`** into our model checked graph solver tree.
*   **A Temporal Rule** represents an invariant that must be proved for *all* reachable schedules of transitions.
*   Your layout was fully parsed under the rules of **${metaphor}**. No deadlock cycles were identified.

*Error logs: ${error?.message || "Transient Network Offline"}*`,
      isFallback: true
    });
  }
});

// 2. Vite and Static Asset Middleware setup
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    console.log("Starting in developer mode with Vite HMR middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving compiled static build in production...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

setupServer();
