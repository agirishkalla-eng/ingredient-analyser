const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

app.post('/api/analyse', async (req, res) => {
  const { apiKey, provider, messages, system } = req.body;
  try {
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system, messages })
      });
      const data = await response.json();
      return res.json({ _provider: 'anthropic', ...data });

    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 2000, messages })
      });
      const data = await response.json();
      return res.json({ _provider: 'openai', ...data });

    } else if (provider === 'gemini') {
      const geminiMessages = messages.map(m => {
        if (typeof m.content === 'string') {
          return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
        }
        const parts = m.content.map(c => {
          if (c.type === 'text') return { text: c.text };
          if (c.type === 'image') return { inlineData: { mimeType: c.source.media_type, data: c.source.data } };
          return null;
        }).filter(Boolean);
        return { role: 'user', parts };
      });

      const systemText = system || '';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents: geminiMessages,
            generationConfig: { maxOutputTokens: 2000 }
          })
        }
      );
      const data = await response.json();
      if (data.error) return res.json({ error: data.error });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ _provider: 'gemini', text });
    }

  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
