import express from 'express';
import OpenAI from 'openai';
import fs from 'fs';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(express.json());

// Updated CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL, // Allow only your frontend URL
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userConversations = {};

async function setupAssistant() {
  const assistant = await openai.beta.assistants.create({
    name: "Financial Analyst Assistant",
    instructions: "You are an expert financial analyst. Use your knowledge base to answer questions about audited financial statements.",
    model: "gpt-4o",
    tools: [{ type: "file_search" }],
  });

  const fileStreams = ["data/profit.json", "data/BS.json"].map((path) =>
    fs.createReadStream(path)
  );

  let vectorStore = await openai.beta.vectorStores.create({
    name: "Financial Statement",
  });

  await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, {
    files: fileStreams,
  });

  await openai.beta.assistants.update(assistant.id, {
    tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
  });

  return { assistant };
}

setupAssistant().then(({ assistant }) => {
  app.post('/api/chat', async (req, res) => {
    try {
      const { userId, message } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const previousMessages = userConversations[userId] || [];
      const messages = previousMessages.slice(-25).concat([{ role: "user", content: message }]);

      const thread = await openai.beta.threads.create({
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        }))
      });

      const stream = openai.beta.threads.runs.stream(thread.id, {
        assistant_id: assistant.id,
      });

      let replyText = '';
      stream
        .on("messageDone", async (event) => {
          if (event.content[0]?.type === "text") {
            const { text } = event.content[0];
            replyText += text.value;  
          }
        })
        .on("end", () => {
          if (replyText) {
            if (!userConversations[userId]) {
              userConversations[userId] = [];
            }
            userConversations[userId].push({ role: "assistant", content: replyText });
            res.json({ reply: replyText });
          }
        })
        .on("error", (error) => {
          console.error(error);
          res.status(500).json({ error: 'Internal Server Error' });
        });

      if (!userConversations[userId]) {
        userConversations[userId] = [];
      }
      userConversations[userId].push({ role: "user", content: message });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/chat/history', (req, res) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const previousMessages = userConversations[userId] || [];
    res.json({ messages: previousMessages });
  });

  app.post('/api/chat/clear', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    userConversations[userId] = [];
    res.json({ message: 'Chat history cleared.' });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(error => {
  console.error("Error setting up assistant:", error);
});
