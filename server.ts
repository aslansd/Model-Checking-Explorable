/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Cloud Run injects PORT and expects the container to listen on it. Hardcoding
// a port makes the revision fail its startup health check.
const PORT = Number(process.env.PORT) || 8080;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '16kb' }));

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '') {
      aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return aiClient;
}

/**
 * The offline copy must never claim a verification result. The model checker
 * runs entirely in the browser; this endpoint only explains notation.
 */
function offlineExplanation(formula: string, plainEnglish: string): string {
  return `**\`${formula}\`**

${plainEnglish || 'A temporal-logic property over the states of your machine.'}

The operators:
- **G** — *globally*. True at every moment of a run.
- **F** — *finally*. True now or at some later moment.
- **X** — *next*. True at the very next step.
- **U** — *until*. The left side holds at every step up to the moment the right side becomes true.
- **A** / **E** — *on all paths* / *on some path*. CTL puts one of these in front of each temporal operator.

The AI explainer is not configured on this server, so this is the built-in reference. It says nothing about whether your model passes — press **Run the verifier** for that.`;
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/explain-formula', async (req, res) => {
  const { formula, plainEnglish, metaphor } = req.body ?? {};

  if (typeof formula !== 'string' || formula.trim() === '' || formula.length > 200) {
    res.status(400).json({ error: 'Send a `formula` string of at most 200 characters.' });
    return;
  }

  const safePlain = typeof plainEnglish === 'string' ? plainEnglish.slice(0, 300) : '';
  const safeMetaphor = typeof metaphor === 'string' ? metaphor.slice(0, 200) : 'a small state machine';

  const client = getGeminiClient();
  if (!client) {
    res.json({ explanation: offlineExplanation(formula, safePlain), isFallback: true });
    return;
  }

  const systemInstruction = `You write short explanations for an interactive "explorable explanation" about formal verification, in the tradition of playful, hand-built educational toys.

Style: warm, concrete, conversational, second person. Use analogies to everyday machines. No unexplained jargon; if you use a technical term, define it in the same sentence.

Accuracy matters more than charm. Never claim a specific model has been verified or that any particular bug does or does not exist — you cannot see the user's state machine. Explain only what the notation means and what a successful proof would guarantee.

Format: at most two short paragraphs, or one short bulleted list. Plain Markdown, using ** for bold and backticks for formulas.`;

  const prompt = `Explain this temporal-logic property to a learner.

System being modelled: ${safeMetaphor}
Formula: ${formula}
Intended reading: ${safePlain}

Cover: (1) what each operator in the formula means, and (2) what a successful proof of it would guarantee about the system.`;

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { systemInstruction }
    });

    const text = response.text;
    if (!text) {
      res.json({ explanation: offlineExplanation(formula, safePlain), isFallback: true });
      return;
    }
    res.json({ explanation: text, isFallback: false });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.json({ explanation: offlineExplanation(formula, safePlain), isFallback: true });
  }
});

// Unknown API routes must 404 rather than fall through to the SPA shell.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API route.' });
});

async function setupServer() {
  if (!IS_PRODUCTION) {
    console.log('Development mode: attaching Vite middleware.');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    console.log('Production mode: serving the compiled build.');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Listening on http://0.0.0.0:${PORT}`);
  });
}

setupServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
